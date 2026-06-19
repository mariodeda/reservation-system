import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/reservations/tenant-context";
import { getTenantStore } from "@/lib/reservations/tenant-store";
import { verifyPassword, hashPassword } from "@/lib/reservations/tenant";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const current = String(body.currentPassword ?? "").slice(0, 200);
  const next = String(body.newPassword ?? "").slice(0, 200);

  if (!current || !next) {
    return NextResponse.json({ error: "Both current and new password are required." }, { status: 400 });
  }
  if (next.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 422 });
  }

  if (!verifyPassword(current, ctx.tenant.adminPasswordHash)) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
  }

  await getTenantStore().setPassword(ctx.tenant.id, hashPassword(next));
  return NextResponse.json({ ok: true });
}
