import { NextResponse, type NextRequest } from "next/server";
import { getStore, referenceOf } from "@/lib/reservations/store";
import { requireAdmin } from "@/lib/reservations/tenant-context";
import { getCustomerStore } from "@/lib/reservations/customer-store";
import { getFeedbackStatusBatch } from "@/lib/reservations/feedback-store";
import { getEmailStatusBatch } from "@/lib/reservations/email-log-store";
import { processDueFeedbackRequests } from "@/lib/reservations/feedback-automation";
import type {
  NewReservationInput,
  ReservationStatus,
} from "@/lib/reservations/types";
import { RESERVATION_STATUSES } from "@/lib/reservations/types";
import { emitReservation } from "@/lib/reservations/events";
import { eventFromRequest, recordAppEvent } from "@/lib/observability/app-event-store";
import { elapsedMs, requestContext } from "@/lib/observability/request-context";
import { observeAdminRoute } from "@/lib/observability/route-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/reservations?date=&from=&to=&status= */
export async function GET(req: NextRequest) {
  return observeAdminRoute(req, "/api/admin/reservations", listReservations, req);
}

async function listReservations(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;
  const obs = requestContext(req, { surface: "admin", actorType: "staff", tenant: ctx.tenant, session: ctx.session, route: "/api/admin/reservations" });
  const sp = req.nextUrl.searchParams;
  try {
    const store = getStore().forTenant(ctx.tenant.id);
    const status = sp.get("status") as ReservationStatus | null;
    const validStatus = status && RESERVATION_STATUSES.includes(status) ? status : undefined;
    const q = sp.get("q")?.trim().toLowerCase().slice(0, 200);

    // Global search across all dates (name / email / phone / reference)
    if (q) {
      const matched = await store.searchReservations(q, { status: validStatus, limit: 200 });
      return NextResponse.json({ reservations: matched.map((r) => ({ ...r, reference: referenceOf(r.id) })) });
    }

    const reservations = await store.listReservations({
      date: sp.get("date") ?? undefined,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      status: validStatus,
    });
    processDueFeedbackRequests(reservations, ctx.tenant)
      .catch((err) => console.error("[feedback] due processor failed:", err));

    // Enrich with customer profile data (visit count, VIP, dietary notes)
    const emails = reservations.map((r) => r.email).filter(Boolean);
    const completedIds = reservations.filter((r) => r.status === "completed").map((r) => r.id);
    const allIds = reservations.map((r) => r.id);

    const [enrichments, feedbackMap, emailMap] = await Promise.all([
      getCustomerStore(ctx.tenant.id).getReservationEnrichments(emails).catch(() => new Map()),
      completedIds.length ? getFeedbackStatusBatch(completedIds).catch(() => new Map()) : Promise.resolve(new Map()),
      allIds.length ? getEmailStatusBatch(allIds).catch(() => new Map()) : Promise.resolve(new Map()),
    ]);

    return NextResponse.json({
      reservations: reservations.map((r) => {
        const enr = enrichments.get(r.email.trim().toLowerCase());
        const fb = feedbackMap.get(r.id);
        const em = emailMap.get(r.id);
        return {
          ...r,
          reference: referenceOf(r.id),
          visitCount: enr?.visitCount,
          customerVip: enr?.customerVip,
          dietaryNotes: enr?.dietaryNotes,
          feedbackSentAt: fb?.sentAt ?? null,
          emails: em ?? undefined,
        };
      }),
    });
  } catch (err) {
    console.error("[reservations] admin list failed:", err);
    return NextResponse.json({ error: "Could not load reservations." }, { status: 500 });
  }
}

/** POST /api/admin/reservations — manual booking (walk-in / phone). Bypasses
 *  capacity/lead checks so staff can always record a guest. */
export async function POST(req: NextRequest) {
  return observeAdminRoute(req, "/api/admin/reservations", createReservation, req);
}

async function createReservation(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;
  const obs = requestContext(req, { surface: "admin", actorType: "staff", tenant: ctx.tenant, session: ctx.session, route: "/api/admin/reservations" });
  let body: Partial<NewReservationInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  if (!body.date || !body.time || !body.service || !body.name) {
    return NextResponse.json(
      { error: "Date, time, service and name are required." },
      { status: 400 },
    );
  }
  const store = getStore().forTenant(ctx.tenant.id);
  const reservation = await store.createReservation({
    date: String(body.date),
    time: String(body.time),
    offering: body.offering ? String(body.offering).slice(0, 40) : undefined,
    service: String(body.service),
    partySize: Math.min(1000, Math.max(1, Math.trunc(Number(body.partySize)) || 1)),
    name: String(body.name),
    email: String(body.email ?? ""),
    phone: String(body.phone ?? ""),
    occasion: body.occasion ? String(body.occasion) : undefined,
    notes: body.notes ? String(body.notes) : undefined,
    tableId: body.tableId ? String(body.tableId) : undefined,
    tableLabel: body.tableLabel ? String(body.tableLabel) : undefined,
    source: "admin",
    status: (["pending", "confirmed", "seated"] as ReservationStatus[]).includes(body.status as ReservationStatus)
      ? (body.status as ReservationStatus)
      : "confirmed",
  });
  emitReservation({
    type: "reservation.created",
    tenantId: ctx.tenant.id,
    id: reservation.id,
    name: reservation.name,
    partySize: reservation.partySize,
    date: reservation.date,
    time: reservation.time,
    service: reservation.service,
    offering: reservation.offering ?? "main",
    source: "admin",
  });

  const reference = referenceOf(reservation.id);
  await recordAppEvent(eventFromRequest(obs, {
    level: "info",
    event: "admin.reservation.created",
    status: 201,
    reservationId: reservation.id,
    reference,
    metadata: {
      date: reservation.date,
      time: reservation.time,
      service: reservation.service,
      offering: reservation.offering ?? "main",
      partySize: reservation.partySize,
      status: reservation.status,
      durationMs: elapsedMs(obs),
    },
  }));

  return NextResponse.json(
    { ok: true, reservation: { ...reservation, reference } },
    { status: 201 },
  );
}
