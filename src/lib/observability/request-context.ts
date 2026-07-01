import type { NextRequest } from "next/server";
import type { ImpersonationSessionPayload, SessionPayload } from "@/lib/reservations/auth";
import type { PlatformSession } from "@/lib/reservations/platform-auth";
import type { Tenant } from "@/lib/reservations/tenant";
import { clientIp } from "@/lib/reservations/rate-limit";
import { hashValue, newRequestId, type ActorType, type Surface } from "./logger";

export interface RequestContext {
  requestId: string;
  surface: Surface;
  actorType: ActorType;
  actorId?: string;
  route: string;
  method: string;
  ipHash?: string;
  userAgentHash?: string;
  startedAt: number;
  tenantId?: string;
  tenantSlug?: string;
}

export function requestContext(
  req: NextRequest,
  input: {
    surface: Surface;
    actorType?: ActorType;
    actorId?: string;
    tenant?: Tenant;
    route?: string;
    session?: SessionPayload | ImpersonationSessionPayload | PlatformSession;
  },
): RequestContext {
  const requestId = req.headers.get("x-request-id") || req.headers.get("x-correlation-id") || newRequestId();
  const impersonator = input.session && "impersonatedBy" in input.session ? input.session.impersonatedBy : undefined;
  const sessionUser = input.session && "u" in input.session ? input.session.u : undefined;
  return {
    requestId,
    surface: input.surface,
    actorType: impersonator ? "impersonation" : input.actorType ?? "unknown",
    actorId: impersonator ?? input.actorId ?? sessionUser,
    route: input.route ?? req.nextUrl.pathname,
    method: req.method,
    ipHash: hashValue(clientIp(req)),
    userAgentHash: hashValue(req.headers.get("user-agent") ?? ""),
    startedAt: Date.now(),
    tenantId: input.tenant?.id,
    tenantSlug: input.tenant?.slug,
  };
}

export function elapsedMs(ctx: Pick<RequestContext, "startedAt">): number {
  return Math.max(0, Date.now() - ctx.startedAt);
}
