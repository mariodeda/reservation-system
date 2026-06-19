import { NextResponse, type NextRequest } from "next/server";
import { getWaitlistStore } from "@/lib/reservations/waitlist-store";
import { requireAdmin } from "@/lib/reservations/tenant-context";
import { WAITLIST_STATUSES, type WaitlistEntry } from "@/lib/reservations/types";

export const runtime = "nodejs";

/** PATCH /api/admin/waitlist/[id] — edit a queue entry or change its status. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.res;
  const { id } = await ctx.params;
  let body: Partial<WaitlistEntry>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  if (body.status !== undefined && !WAITLIST_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }
  const patch: Partial<WaitlistEntry> = {};
  for (const f of ["name", "phone", "email", "partySize", "quotedWaitMin", "pagerLabel", "notes", "status"] as const) {
    if (body[f] !== undefined) (patch as Record<string, unknown>)[f] = body[f];
  }
  const entry = await getWaitlistStore(admin.tenant.id).updateEntry(id, patch);
  if (!entry) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true, entry });
}

/** DELETE /api/admin/waitlist/[id] — remove a queue entry. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.res;
  const { id } = await ctx.params;
  const ok = await getWaitlistStore(admin.tenant.id).deleteEntry(id);
  if (!ok) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
