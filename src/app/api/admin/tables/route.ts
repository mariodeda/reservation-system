import { NextResponse, type NextRequest } from "next/server";
import { getStore } from "@/lib/reservations/store";
import { getTableStore } from "@/lib/reservations/table-store";
import { requireAdmin } from "@/lib/reservations/tenant-context";
import type { NewTableInput } from "@/lib/reservations/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/tables            → list managed tables
 * GET /api/admin/tables?date=YYYY-MM-DD → floor view: tables + day state
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.res;
  const date = req.nextUrl.searchParams.get("date");
  const store = getTableStore(admin.tenant.id);
  try {
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const config = await getStore().forTenant(admin.tenant.id).getConfig();
      const floor = await store.listTablesWithDayState(date, config);
      return NextResponse.json({ floor });
    }
    const tables = await store.listTables();
    return NextResponse.json({ tables });
  } catch (err) {
    console.error("[tables] list failed:", err);
    return NextResponse.json({ error: "Could not load tables." }, { status: 500 });
  }
}

/** POST /api/admin/tables — create a managed table. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.res;
  let body: Partial<NewTableInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  if (!body.label?.trim()) {
    return NextResponse.json({ error: "A table label is required." }, { status: 400 });
  }
  if (!Number.isFinite(Number(body.capacity)) || Number(body.capacity) < 1) {
    return NextResponse.json({ error: "Capacity must be at least 1." }, { status: 400 });
  }
  const table = await getTableStore(admin.tenant.id).createTable({
    offering: body.offering ? String(body.offering).slice(0, 40) : null,
    label: String(body.label),
    capacity: Number(body.capacity),
    minParty: body.minParty != null ? Number(body.minParty) : undefined,
    zone: body.zone ? String(body.zone) : undefined,
    sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
    joinable: Boolean(body.joinable),
  });
  return NextResponse.json({ ok: true, table }, { status: 201 });
}
