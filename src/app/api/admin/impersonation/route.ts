import { NextResponse, type NextRequest } from "next/server";
import { IMPERSONATION_COOKIE, verifyImpersonationSession } from "@/lib/reservations/auth";
import { eventFromRequest, recordAppEvent } from "@/lib/observability/app-event-store";
import { observeAdminRoute } from "@/lib/observability/route-events";
import { requestContext } from "@/lib/observability/request-context";
import { requireAdmin } from "@/lib/reservations/tenant-context";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest) {
  return observeAdminRoute(req, "/api/admin/impersonation", stopImpersonation, req);
}

async function stopImpersonation(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;
  const imp = await verifyImpersonationSession(req.cookies.get(IMPERSONATION_COOKIE)?.value);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(IMPERSONATION_COOKIE, "", { path: "/", maxAge: 0 });
  if (imp) {
    const obs = requestContext(req, {
      surface: "admin",
      actorType: "impersonation",
      actorId: imp.impersonatedBy,
      tenant: ctx.tenant,
      route: "/api/admin/impersonation",
    });
    await recordAppEvent(eventFromRequest(obs, {
      level: "info",
      event: "platform.tenant.impersonation_stopped",
      status: 200,
    }));
  }
  return res;
}
