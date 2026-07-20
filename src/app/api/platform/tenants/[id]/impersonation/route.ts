import { NextResponse, type NextRequest } from "next/server";
import { createImpersonationSession, impersonationCookieOptions, IMPERSONATION_COOKIE } from "@/lib/reservations/auth";
import { eventFromRequest, recordAppEvent } from "@/lib/observability/app-event-store";
import { observePlatformRoute } from "@/lib/observability/route-events";
import { requestContext } from "@/lib/observability/request-context";
import { getPlatformStore } from "@/lib/reservations/platform-store";
import { requirePlatform } from "@/lib/reservations/tenant-context";
import { getTenantStore } from "@/lib/reservations/tenant-store";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctxArg: { params: Promise<{ id: string }> }) {
  return observePlatformRoute(req, "/api/platform/tenants/[id]/impersonation", startImpersonation, req, ctxArg);
}

async function startImpersonation(req: NextRequest, ctxArg: { params: Promise<{ id: string }> }) {
  const ctx = await requirePlatform(req);
  if (!ctx.ok) return ctx.res;
  const { id } = await ctxArg.params;
  const obs = requestContext(req, {
    surface: "platform",
    actorType: "platform",
    session: ctx.session,
    route: "/api/platform/tenants/[id]/impersonation",
  });
  let body: { operatorPassword?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const operatorPassword = String(body.operatorPassword ?? "");
  if (!operatorPassword || !(await getPlatformStore().verifyLogin(ctx.session.u, operatorPassword))) {
    await recordAppEvent({
      ...eventFromRequest(obs, {
        level: "warn",
        event: "platform.tenant.impersonation_reauth_failed",
        status: 401,
        reason: "operator_password",
      }),
      tenantId: id,
    });
    return NextResponse.json({ error: "Operator password is required." }, { status: 401 });
  }

  const tenant = await getTenantStore().getById(id);
  if (!tenant) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (tenant.status !== "active") {
    return NextResponse.json({ error: "Cannot impersonate a disabled restaurant." }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true, url: `/admin/${encodeURIComponent(tenant.slug)}` });
  res.cookies.set(IMPERSONATION_COOKIE, await createImpersonationSession(tenant.id, ctx.session.u), impersonationCookieOptions);
  await recordAppEvent({
    ...eventFromRequest(obs, {
      level: "warn",
      event: "platform.tenant.impersonation_started",
      status: 200,
      metadata: { slug: tenant.slug },
    }),
    tenantId: tenant.id,
  });
  return res;
}
