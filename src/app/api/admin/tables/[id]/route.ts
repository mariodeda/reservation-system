import { NextResponse, type NextRequest } from "next/server";
import { getTableStore } from "@/lib/reservations/table-store";
import { requireAdmin } from "@/lib/reservations/tenant-context";
import type { NewTableInput } from "@/lib/reservations/types";

export const runtime = "nodejs";

/** PATCH /api/admin/tables/[id] — update a managed table. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.res;
  const { id } = await ctx.params;
  let body: Partial<NewTableInput> & { active?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  const patch: Partial<NewTableInput> & { active?: boolean } = {};
  for (const f of ["offering", "label", "capacity", "minParty", "zone", "sortOrder", "joinable", "active"] as const) {
    if (body[f] !== undefined) (patch as Record<string, unknown>)[f] = body[f];
  }
  const table = await getTableStore(admin.tenant.id).updateTable(id, patch);
  if (!table) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true, table });
}

/** DELETE /api/admin/tables/[id] — soft-delete (deactivate). */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.res;
  const { id } = await ctx.params;
  const ok = await getTableStore(admin.tenant.id).deleteTable(id);
  if (!ok) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
