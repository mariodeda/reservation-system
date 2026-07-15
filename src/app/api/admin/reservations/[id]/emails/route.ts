import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/reservations/tenant-context";
import { getStore, referenceOf } from "@/lib/reservations/store";
import { getEmailLogByReservation } from "@/lib/reservations/email-log-store";
import { observeAdminRoute } from "@/lib/observability/route-events";
import { sendConfirmationEmail } from "@/lib/reservations/email";
import { reservationEmailServiceLabel } from "@/lib/reservations/reservation-email-label";
import { isExternalReservationSource } from "@/lib/reservations/external-sources";
import { localNowOrdinalMinutes, reservationLocalMinutes } from "@/lib/reservations/email-policy";
import { eventFromRequest, recordAppEvent } from "@/lib/observability/app-event-store";
import { requestContext } from "@/lib/observability/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/reservations/[id]/emails — full email send history (debug). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return observeAdminRoute(req, "/api/admin/reservations/[id]/emails", getReservationEmails, req, { params });
}

/** POST /api/admin/reservations/[id]/emails — retry a failed booking confirmation email. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return observeAdminRoute(req, "/api/admin/reservations/[id]/emails", retryReservationEmail, req, { params });
}

async function getReservationEmails(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;
  const { id } = await params;

  try {
    // Tenant-scoped lookup first so logs can't be read cross-tenant.
    const reservation = await getStore().forTenant(ctx.tenant.id).getReservation(id);
    if (!reservation) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const emails = await getEmailLogByReservation(id);
    return NextResponse.json({ emails });
  } catch (err) {
    console.error("[email-log] get failed:", err);
    return NextResponse.json({ error: "Could not load email log." }, { status: 500 });
  }
}

async function retryReservationEmail(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;
  const { id } = await params;
  const obs = requestContext(req, { surface: "admin", actorType: "staff", tenant: ctx.tenant, session: ctx.session, route: "/api/admin/reservations/[id]/emails" });

  let body: { type?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (body.type !== undefined && body.type !== "bookingConfirmation") {
    return NextResponse.json({ error: "Only booking confirmation retry is supported." }, { status: 400 });
  }

  try {
    const store = getStore().forTenant(ctx.tenant.id);
    const reservation = await store.getReservation(id);
    if (!reservation) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (isExternalReservationSource(reservation.source)) {
      return NextResponse.json({ error: "External reservations do not use local booking emails." }, { status: 409 });
    }

    const config = await store.getConfig();
    const start = reservationLocalMinutes(reservation);
    const now = localNowOrdinalMinutes(config.timezone);
    if (start !== null && now !== null && now >= start) {
      return NextResponse.json({ error: "Booking time has already passed." }, { status: 409 });
    }

    const history = await getEmailLogByReservation(id);
    const latestBookingAttempt = history.find((email) => email.type === "bookingConfirmation");
    if (latestBookingAttempt?.status !== "failed") {
      return NextResponse.json({ error: "No failed booking confirmation email to retry." }, { status: 409 });
    }

    const emailLabel = reservationEmailServiceLabel(reservation, ctx.tenant, config);
    const result = await sendConfirmationEmail(reservation, ctx.tenant, emailLabel, config);
    await recordAppEvent(eventFromRequest(obs, {
      level: result.sent ? "info" : "warn",
      event: result.sent ? "admin.reservation.booking_email_retry.sent" : "admin.reservation.booking_email_retry.not_sent",
      status: result.sent ? 200 : 409,
      reservationId: id,
      reference: referenceOf(id),
      reason: result.reason,
      metadata: {
        emailSent: result.sent,
        reason: result.reason,
        error: result.error,
      },
    }));

    if (!result.sent) {
      return NextResponse.json(
        { error: result.error || result.reason || "Booking confirmation email was not sent.", emailSent: false },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, emailSent: true });
  } catch (err) {
    console.error("[email-log] retry failed:", err);
    return NextResponse.json({ error: "Could not retry booking email." }, { status: 500 });
  }
}
