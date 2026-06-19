import { NextResponse, type NextRequest } from "next/server";
import { getStore } from "@/lib/reservations/store";
import { getTableStore } from "@/lib/reservations/table-store";
import { requireAdmin } from "@/lib/reservations/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/reservations/[id]/table — suggest the best free table. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.res;
  const { id } = await ctx.params;
  const store = getStore().forTenant(admin.tenant.id);
  const reservation = await store.getReservation(id);
  if (!reservation) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const config = await store.getConfig();
  const table = await getTableStore(admin.tenant.id).suggestTable(
    {
      date: reservation.date,
      time: reservation.time,
      offering: reservation.offering,
      service: reservation.service,
      partySize: reservation.partySize,
    },
    config,
  );
  return NextResponse.json({ table });
}
