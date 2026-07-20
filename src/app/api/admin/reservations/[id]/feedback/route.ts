import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/reservations/tenant-context";
import { getStore } from "@/lib/reservations/store";
import { sendFeedbackRequestEmail } from "@/lib/reservations/email";
import { getSentEmailStatusBatch, hasSentEmail, withEmailSendLock } from "@/lib/reservations/email-log-store";
import { hasGuestAttended, isEmailEventEnabled } from "@/lib/reservations/email-policy";
import { observeAdminRoute } from "@/lib/observability/route-events";
import { isExternalReservationSource } from "@/lib/reservations/external-sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return observeAdminRoute(req, "/api/admin/reservations/[id]/feedback", sendFeedback, req, { params });
}

async function sendFeedback(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;
  if (!isEmailEventEnabled(ctx.tenant.settings, "feedbackRequest")) {
    return NextResponse.json({ error: "Feedback requests are disabled for this restaurant." }, { status: 403 });
  }
  const { id } = await params;

  try {
    const store = getStore().forTenant(ctx.tenant.id);
    const reservation = await store.getReservation(id);
    if (!reservation) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (isExternalReservationSource(reservation.source))
      return NextResponse.json({ error: "External reservations are read-only and cannot use local email actions." }, { status: 409 });
    if (!hasGuestAttended(reservation))
      return NextResponse.json({ error: "Feedback can only be requested for completed reservations (the guest must have shown up)." }, { status: 422 });
    if (!reservation.email)
      return NextResponse.json({ error: "Reservation has no email address." }, { status: 422 });
    if (!ctx.tenant.settings.reviewUrl)
      return NextResponse.json({ error: "Restaurant review URL is not configured." }, { status: 422 });

    const result = await withEmailSendLock(ctx.tenant.id, id, "feedbackRequest", async () => {
      if (await hasSentEmail(id, "feedbackRequest")) {
        return { sent: false, skipped: true, alreadySent: true };
      }
      return sendFeedbackRequestEmail(reservation, ctx.tenant);
    });
    if ("alreadySent" in result && result.alreadySent) {
      return NextResponse.json({
        ok: true,
        emailSent: false,
        alreadySent: true,
        reviewUrl: ctx.tenant.settings.reviewUrl,
      });
    }
    return NextResponse.json({ ok: true, emailSent: result.sent, reviewUrl: ctx.tenant.settings.reviewUrl });
  } catch (err) {
    console.error("[feedback] send failed:", err);
    return NextResponse.json({ error: "Could not send feedback request." }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return observeAdminRoute(req, "/api/admin/reservations/[id]/feedback", getFeedback, req, { params });
}

async function getFeedback(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;
  const { id } = await params;

  try {
    const reservation = await getStore().forTenant(ctx.tenant.id).getReservation(id);
    if (!reservation) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (isExternalReservationSource(reservation.source)) return NextResponse.json({ feedback: null });
    const sent = await getSentEmailStatusBatch([id], "feedbackRequest");
    return NextResponse.json({ feedback: sent.get(id) ?? null });
  } catch (err) {
    console.error("[feedback] get failed:", err);
    return NextResponse.json({ error: "Could not load feedback." }, { status: 500 });
  }
}
