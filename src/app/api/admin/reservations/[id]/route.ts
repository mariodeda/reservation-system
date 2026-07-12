import { NextResponse, type NextRequest } from "next/server";
import { getStore, referenceOf } from "@/lib/reservations/store";
import { getTableStore } from "@/lib/reservations/table-store";
import { requireAdmin } from "@/lib/reservations/tenant-context";
import { RESERVATION_STATUSES, type Reservation } from "@/lib/reservations/types";
import { sendFeedbackRequestForReservation } from "@/lib/reservations/feedback-automation";
import { sendCancellationEmail, sendConfirmationEmail } from "@/lib/reservations/email";
import { emitReservation } from "@/lib/reservations/events";
import { reservationEmailServiceLabel } from "@/lib/reservations/reservation-email-label";
import { eventFromRequest, recordAppEvent } from "@/lib/observability/app-event-store";
import { requestContext } from "@/lib/observability/request-context";
import { observeAdminRoute } from "@/lib/observability/route-events";
import { isExternalReservationSource } from "@/lib/reservations/external-sources";

export const runtime = "nodejs";

/** PATCH /api/admin/reservations/[id] — update status or editable fields. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return observeAdminRoute(req, "/api/admin/reservations/[id]", patchReservation, req, ctx);
}

async function patchReservation(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.res;
  const { id } = await ctx.params;
  const obs = requestContext(req, { surface: "admin", actorType: "staff", tenant: admin.tenant, session: admin.session, route: "/api/admin/reservations/[id]" });
  let body: Partial<Reservation>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const store = getStore().forTenant(admin.tenant.id);

  const patch: Partial<Reservation> = {};
  if (body.status !== undefined) {
    if (!RESERVATION_STATUSES.includes(body.status))
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    patch.status = body.status;
  }
  for (const f of ["date", "time", "offering", "service", "name", "email", "phone", "occasion", "notes", "tableLabel"] as const) {
    if (body[f] !== undefined) (patch as Record<string, unknown>)[f] = body[f];
  }
  if (body.partySize !== undefined) patch.partySize = Math.min(1000, Math.max(1, Math.trunc(Number(body.partySize)) || 1));
  if (Object.prototype.hasOwnProperty.call(body, "durationMinsOverride")) {
    if (body.durationMinsOverride === null || body.durationMinsOverride === 0) {
      patch.durationMinsOverride = null;
    } else {
      const v = Math.trunc(Number(body.durationMinsOverride));
      if (v >= 15 && v <= 480) patch.durationMinsOverride = v;
    }
  }

  // table_id goes through the conflict-checked assignment path (and supports
  // unassign via null/""), never the blind field loop.
  const assigningTable = Object.prototype.hasOwnProperty.call(body, "tableId");
  const tableSensitiveEdit = ["date", "time", "offering", "service"].some((f) =>
    Object.prototype.hasOwnProperty.call(patch, f),
  );
  const existing = await store.getReservation(id);
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const patchKeys = Object.keys(patch);
  const externalLocalTablePatch = isExternalReservationSource(existing.source) && (
    (assigningTable && patchKeys.length === 0) ||
    (!assigningTable && patchKeys.length === 1 && Object.prototype.hasOwnProperty.call(patch, "tableLabel"))
  );
  if (isExternalReservationSource(existing.source) && !externalLocalTablePatch) {
    return NextResponse.json({ error: "External reservations are read-only in this system." }, { status: 409 });
  }

  const locked = existing.status === "seated" || existing.status === "completed";
  const onlyCompletingSeated =
    existing.status === "seated" &&
    patch.status === "completed" &&
    Object.keys(patch).length === 1 &&
    !assigningTable;

  if (locked && !onlyCompletingSeated && !externalLocalTablePatch) {
    return NextResponse.json({ error: "Seated or completed reservations cannot be modified." }, { status: 409 });
  }

  if (!assigningTable && tableSensitiveEdit) {
    const candidate = { ...existing, ...patch };
    if (candidate.tableId || candidate.tableIds?.length) {
      const config = await store.getConfig();
      const tableError = await getTableStore(admin.tenant.id).validateAssignedTables(candidate, config);
      if (tableError) {
        await recordAppEvent(eventFromRequest(obs, {
          level: "warn",
          event: "admin.reservation.table_conflict",
          status: 409,
          reservationId: id,
          reference: referenceOf(id),
          reason: tableError,
        }));
        return NextResponse.json({ error: tableError }, { status: 409 });
      }
    }
  }

  let updated: Reservation | null = null;
  if (Object.keys(patch).length > 0) {
    updated = await store.updateReservation(id, patch);
    if (!updated) return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (assigningTable) {
    const config = await store.getConfig();
    const tableId = body.tableId ? String(body.tableId) : null;
    const result = await getTableStore(admin.tenant.id).assignTable(id, tableId, config);
    if (result.error) {
      await recordAppEvent(eventFromRequest(obs, {
        level: "warn",
        event: "admin.reservation.table_conflict",
        status: 409,
        reservationId: id,
        reference: referenceOf(id),
        reason: result.error,
      }));
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
  }

  const final = updated ?? (await store.getReservation(id));
  if (!final) return NextResponse.json({ error: "Not found." }, { status: 404 });
  // Re-read so the response reflects the table assignment too.
  const fresh = assigningTable ? await store.getReservation(id) : final;
  const reservation = fresh ?? final;

  // Auto-send feedback email when status transitions to "completed" and has an email.
  // Fire-and-forget — don't block or fail the status update if email fails.
  if (patch.status === "completed") {
    sendFeedbackRequestForReservation(reservation, admin.tenant)
      .catch((err) => console.error("[feedback] auto-send failed:", err));
  }
  if (patch.status === "confirmed" && existing.status === "pending" && !isExternalReservationSource(existing.source)) {
    const config = await store.getConfig();
    const emailLabel = reservationEmailServiceLabel(reservation, admin.tenant, config);
    await sendConfirmationEmail(reservation, admin.tenant, emailLabel, config);
  }
  if (patch.status === "cancelled" && existing.status !== "cancelled" && !isExternalReservationSource(existing.source)) {
    sendCancellationEmail(reservation, admin.tenant)
      .catch((err) => console.error("[email] cancellation send failed:", err));
  }

  emitReservation({
    type: "reservation.updated",
    tenantId: admin.tenant.id,
    id: reservation.id,
    name: reservation.name,
    partySize: reservation.partySize,
    date: reservation.date,
    time: reservation.time,
    service: reservation.service,
    offering: reservation.offering ?? "main",
    status: reservation.status,
    source: externalLocalTablePatch ? "admin" : reservation.source,
  });

  await recordAppEvent(eventFromRequest(obs, {
    level: "info",
    event: "admin.reservation.updated",
    status: 200,
    reservationId: reservation.id,
    reference: referenceOf(reservation.id),
    metadata: {
      status: reservation.status,
      assignedTable: Boolean(reservation.tableId || reservation.tableIds?.length),
      fields: Object.keys(patch),
      tableAssignmentChanged: assigningTable,
    },
  }));

  return NextResponse.json({ ok: true, reservation: { ...reservation, reference: referenceOf(reservation.id) } });
}

/** DELETE /api/admin/reservations/[id] */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return observeAdminRoute(req, "/api/admin/reservations/[id]", deleteReservation, req, ctx);
}

async function deleteReservation(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.res;
  const { id } = await ctx.params;
  const obs = requestContext(req, { surface: "admin", actorType: "staff", tenant: admin.tenant, session: admin.session, route: "/api/admin/reservations/[id]" });
  const store = getStore().forTenant(admin.tenant.id);
  const existing = await store.getReservation(id);
  if (existing && isExternalReservationSource(existing.source)) {
    return NextResponse.json({ error: "External reservations are read-only in this system." }, { status: 409 });
  }
  if (existing && (existing.status === "seated" || existing.status === "completed")) {
    return NextResponse.json({ error: "Seated or completed reservations cannot be deleted." }, { status: 409 });
  }
  const ok = await store.deleteReservation(id);
  if (!ok) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (existing) {
    emitReservation({
      type: "reservation.updated",
      tenantId: admin.tenant.id,
      id: existing.id,
      name: existing.name,
      partySize: existing.partySize,
      date: existing.date,
      time: existing.time,
      service: existing.service,
      offering: existing.offering ?? "main",
      status: "cancelled",
      source: existing.source,
    });
    await recordAppEvent(eventFromRequest(obs, {
      level: "info",
      event: "admin.reservation.deleted",
      status: 200,
      reservationId: existing.id,
      reference: referenceOf(existing.id),
      metadata: { status: existing.status, date: existing.date, time: existing.time },
    }));
  }
  return NextResponse.json({ ok: true });
}
