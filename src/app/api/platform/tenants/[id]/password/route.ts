import { NextResponse, type NextRequest } from "next/server";
import { getTenantStore } from "@/lib/reservations/tenant-store";
import { requirePlatform } from "@/lib/reservations/tenant-context";
import { hashPassword } from "@/lib/reservations/tenant";
import { getPlatformStore } from "@/lib/reservations/platform-store";

export const runtime = "nodejs";

/** POST /api/platform/tenants/[id]/password  { password } — reset a tenant's staff login password. */
export async function POST(req: NextRequest, ctxArg: { params: Promise<{ id: string }> }) {
  const ctx = await requirePlatform(req);
  if (!ctx.ok) return ctx.res;
  const { id } = await ctxArg.params;
  let body: { password?: string; operatorPassword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  const password = String(body.password ?? "");
  const operatorPassword = String(body.operatorPassword ?? "");
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (!operatorPassword || !(await getPlatformStore().verifyLogin(ctx.session.u, operatorPassword))) {
    return NextResponse.json({ error: "Operator password is required." }, { status: 401 });
  }
  const store = getTenantStore();
  if (!(await store.getById(id))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  await store.setPassword(id, hashPassword(password));
  return NextResponse.json({ ok: true });
}
