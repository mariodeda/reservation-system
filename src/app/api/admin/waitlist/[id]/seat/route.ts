import { NextResponse, type NextRequest } from "next/server";
import { getStore, referenceOf } from "@/lib/reservations/store";
import { getWaitlistStore } from "@/lib/reservations/waitlist-store";
import { requireAdmin } from "@/lib/reservations/tenant-context";
import { nowInTz, scheduleForDate } from "@/lib/reservations/availability";
import { observeAdminRoute } from "@/lib/observability/route-events";

export const runtime = "nodejs";

/**
 * POST /api/admin/waitlist/[id]/seat — seat a waiting party. Body may carry
 * { time, service, tableId }; missing time/service default to "now" and the
 * first service the offering runs that day.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return observeAdminRoute(req, "/api/admin/waitlist/[id]/seat", seatWaitlistEntry, req, ctx);
}

async function seatWaitlistEntry(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.res;
  const { id } = await ctx.params;

  let body: { time?: string; service?: string; tableId?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine — defaults apply
  }

  const store = getStore().forTenant(admin.tenant.id);
  const config = await store.getConfig();
  const wlStore = getWaitlistStore(admin.tenant.id);
  const entry = await wlStore.getEntry(id);
  if (!entry) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const time =
    body.time && /^\d{2}:\d{2}$/.test(body.time)
      ? body.time
      : (() => {
          const m = nowInTz(config.timezone).minutes;
          return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        })();
  const service =
    body.service ||
    scheduleForDate(config, entry.date, entry.offering).services[0]?.id ||
    "dinner";

  const result = await wlStore.seatFromWaitlist(
    id,
    { time, service, tableId: body.tableId ?? null },
    config,
  );
  if (result.error) return NextResponse.json({ error: result.error }, { status: 409 });

  return NextResponse.json({
    ok: true,
    reservation: result.reservation
      ? { ...result.reservation, reference: referenceOf(result.reservation.id) }
      : undefined,
    tableWarning: result.tableWarning,
  });
}
