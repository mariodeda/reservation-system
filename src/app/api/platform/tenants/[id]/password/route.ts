import { NextResponse, type NextRequest } from "next/server";
import { getTenantStore } from "@/lib/reservations/tenant-store";
import { requirePlatform } from "@/lib/reservations/tenant-context";
import { hashPassword } from "@/lib/reservations/tenant";
import { getPlatformStore } from "@/lib/reservations/platform-store";
import { eventFromRequest, recordAppEvent } from "@/lib/observability/app-event-store";
import { observePlatformRoute } from "@/lib/observability/route-events";
import { requestContext } from "@/lib/observability/request-context";

export const runtime = "nodejs";

/** POST /api/platform/tenants/[id]/password  { password } — reset a tenant's staff login password. */
export async function POST(req: NextRequest, ctxArg: { params: Promise<{ id: string }> }) {
  return observePlatformRoute(req, "/api/platform/tenants/[id]/password", resetPassword, req, ctxArg);
}

async function resetPassword(req: NextRequest, ctxArg: { params: Promise<{ id: string }> }) {
  const ctx = await requirePlatform(req);
  if (!ctx.ok) return ctx.res;
  const { id } = await ctxArg.params;
  const obs = requestContext(req, { surface: "platform", actorType: "platform", session: ctx.session, route: "/api/platform/tenants/[id]/password" });
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
    await recordAppEvent({
      ...eventFromRequest(obs, {
        level: "warn",
        event: "platform.tenant.password_reset_reauth_failed",
        status: 401,
        reason: "operator_password",
      }),
      tenantId: id,
    });
    return NextResponse.json({ error: "Operator password is required." }, { status: 401 });
  }
  const store = getTenantStore();
  if (!(await store.getById(id))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  await store.setPassword(id, hashPassword(password));
  await recordAppEvent({
    ...eventFromRequest(obs, {
      level: "warn",
      event: "platform.tenant.staff_password_reset",
      status: 200,
    }),
    tenantId: id,
  });
  return NextResponse.json({ ok: true });
}
