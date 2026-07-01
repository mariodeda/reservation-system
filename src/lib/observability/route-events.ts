import type { NextRequest } from "next/server";
import { eventFromRequest, recordAppEvent } from "./app-event-store";
import { requestContext } from "./request-context";
import type { ActorType, Surface } from "./logger";
import { IMPERSONATION_COOKIE, verifyImpersonationSession } from "@/lib/reservations/auth";

type RouteHandler<TResponse extends Response, TArgs extends unknown[]> = (...args: TArgs) => Promise<TResponse>;

interface ObserveRouteOptions {
  surface: Surface;
  actorType?: ActorType;
  actorId?: string;
  tenantId?: string;
  route: string;
  event?: string;
}

function levelFor(status: number) {
  return status >= 500 ? "error" : status >= 400 ? "warn" : "info";
}

async function responseReason(res: Response): Promise<string | undefined> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return res.statusText || undefined;
  try {
    const data = await res.clone().json() as { error?: unknown };
    const error = typeof data.error === "string" ? data.error.trim() : "";
    return error ? error.slice(0, 120) : res.statusText || undefined;
  } catch {
    return res.statusText || undefined;
  }
}

export async function observeRoute<TResponse extends Response, TArgs extends unknown[]>(
  req: NextRequest,
  opts: ObserveRouteOptions,
  handler: RouteHandler<TResponse, TArgs>,
  ...args: TArgs
): Promise<TResponse> {
  const ctx = requestContext(req, {
    surface: opts.surface,
    actorType: opts.actorType ?? "unknown",
    actorId: opts.actorId,
    route: opts.route,
  });
  if (opts.tenantId) ctx.tenantId = opts.tenantId;
  try {
    const res = await handler(...args);
    if (
      opts.surface === "admin" &&
      opts.actorType === "impersonation" &&
      !["GET", "HEAD", "OPTIONS"].includes(req.method)
    ) {
      await recordAppEvent(eventFromRequest(ctx, {
        level: levelFor(res.status),
        event: "admin.impersonation.mutation",
        status: res.status,
        reason: res.status >= 400 ? await responseReason(res) : undefined,
        metadata: {
          path: req.nextUrl.pathname,
          method: req.method,
        },
      }));
    }
    if (res.status !== 200) {
      await recordAppEvent(eventFromRequest(ctx, {
        level: levelFor(res.status),
        event: opts.event ?? `${opts.surface}.route.non_success`,
        status: res.status,
        reason: await responseReason(res),
        metadata: {
          path: req.nextUrl.pathname,
          method: req.method,
        },
      }));
    }
    return res;
  } catch (err) {
    await recordAppEvent(eventFromRequest(ctx, {
      level: "error",
      event: opts.event ?? `${opts.surface}.route.threw`,
      status: 500,
      reason: err instanceof Error ? err.message : "unknown",
      metadata: {
        path: req.nextUrl.pathname,
        method: req.method,
      },
    }));
    throw err;
  }
}

export function observePlatformRoute<TResponse extends Response, TArgs extends unknown[]>(
  req: NextRequest,
  route: string,
  handler: RouteHandler<TResponse, TArgs>,
  ...args: TArgs
): Promise<TResponse> {
  return observeRoute(req, { surface: "platform", actorType: "platform", route }, handler, ...args);
}

export async function observeAdminRoute<TResponse extends Response, TArgs extends unknown[]>(
  req: NextRequest,
  route: string,
  handler: RouteHandler<TResponse, TArgs>,
  ...args: TArgs
): Promise<TResponse> {
  const imp = await verifyImpersonationSession(req.cookies.get(IMPERSONATION_COOKIE)?.value);
  return observeRoute(
    req,
    { surface: "admin", actorType: imp ? "impersonation" : "staff", actorId: imp?.impersonatedBy, tenantId: imp?.tid, route },
    handler,
    ...args,
  );
}

export function observePublicRoute<TResponse extends Response, TArgs extends unknown[]>(
  req: NextRequest,
  route: string,
  handler: RouteHandler<TResponse, TArgs>,
  ...args: TArgs
): Promise<TResponse> {
  return observeRoute(req, { surface: "public", actorType: "guest", route }, handler, ...args);
}

export function observeSystemRoute<TResponse extends Response, TArgs extends unknown[]>(
  req: NextRequest,
  route: string,
  handler: RouteHandler<TResponse, TArgs>,
  ...args: TArgs
): Promise<TResponse> {
  return observeRoute(req, { surface: "system", actorType: "system", route }, handler, ...args);
}
