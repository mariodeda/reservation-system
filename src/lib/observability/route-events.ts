import type { NextRequest } from "next/server";
import { eventFromRequest, recordAppEvent } from "./app-event-store";
import { requestContext } from "./request-context";
import type { ActorType, Surface } from "./logger";
import { IMPERSONATION_COOKIE, verifyImpersonationSession } from "@/lib/reservations/auth";

type RouteHandler<TResponse extends Response, TArgs extends unknown[]> = (...args: TArgs) => Promise<TResponse>;

type RequestBodyMetadata = {
  body?: unknown;
  bodyText?: string;
  bodyFormat?: string;
  bodyTruncated?: boolean;
  bodyError?: string;
};

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

const BODY_CAPTURE_LIMIT = 12_000;

function truncateBody(value: string): { value: string; truncated: boolean } {
  if (value.length <= BODY_CAPTURE_LIMIT) return { value, truncated: false };
  return { value: value.slice(0, BODY_CAPTURE_LIMIT), truncated: true };
}

function contentTypeOf(req: NextRequest): string {
  return (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
}

function formDataValue(value: FormDataEntryValue): unknown {
  if (typeof value === "string") return value;
  return {
    filename: value.name,
    type: value.type,
    size: value.size,
  };
}

async function requestBodyMetadata(req: Request, method: string, contentType: string): Promise<RequestBodyMetadata> {
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return {};
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  try {
    if (contentType === "multipart/form-data") {
      const data = await req.formData();
      const body: Record<string, unknown> = {};
      for (const [key, value] of data.entries()) {
        const next = formDataValue(value);
        if (key in body) {
          const existing = body[key];
          body[key] = Array.isArray(existing) ? [...existing, next] : [existing, next];
        } else {
          body[key] = next;
        }
      }
      return { body, bodyFormat: "multipart/form-data" };
    }

    const raw = await req.text();
    const { value, truncated } = truncateBody(raw);
    if (!raw) return { bodyText: "", bodyFormat: contentType || "empty" };
    if (contentType === "application/json" || contentType.endsWith("+json")) {
      try {
        return { body: JSON.parse(raw), bodyFormat: "json", bodyTruncated: truncated || raw.length > value.length };
      } catch {
        return { bodyText: value, bodyFormat: "invalid-json", bodyTruncated: truncated };
      }
    }
    if (contentType === "application/x-www-form-urlencoded") {
      const body: Record<string, string | string[]> = {};
      const params = new URLSearchParams(raw);
      for (const [key, val] of params.entries()) {
        if (key in body) {
          const existing = body[key];
          body[key] = Array.isArray(existing) ? [...existing, val] : [existing, val];
        } else {
          body[key] = val;
        }
      }
      return { body, bodyFormat: "form-urlencoded", bodyTruncated: truncated };
    }
    return {
      bodyText: value,
      bodyFormat: contentType || "text",
      bodyTruncated: truncated || (contentLength > 0 && contentLength > value.length),
    };
  } catch (err) {
    return {
      bodyFormat: contentType || undefined,
      bodyError: err instanceof Error ? err.message : "Could not read request body",
    };
  }
}

async function requestMetadata(req: NextRequest, bodyReq: Request | null, contentType: string): Promise<Record<string, unknown>> {
  return {
    path: req.nextUrl.pathname,
    method: req.method,
    ...(bodyReq ? await requestBodyMetadata(bodyReq, req.method, contentType) : {}),
  };
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
  const bodyReq = ["GET", "HEAD", "OPTIONS"].includes(req.method) ? null : req.clone();
  const contentType = contentTypeOf(req);
  let metadataPromise: Promise<Record<string, unknown>> | undefined;
  const metadata = () => {
    metadataPromise ??= requestMetadata(req, bodyReq, contentType);
    return metadataPromise;
  };
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
        metadata: await metadata(),
      }));
    }
    if (res.status !== 200) {
      await recordAppEvent(eventFromRequest(ctx, {
        level: levelFor(res.status),
        event: opts.event ?? `${opts.surface}.route.non_success`,
        status: res.status,
        reason: await responseReason(res),
        metadata: await metadata(),
      }));
    }
    return res;
  } catch (err) {
    await recordAppEvent(eventFromRequest(ctx, {
      level: "error",
      event: opts.event ?? `${opts.surface}.route.threw`,
      status: 500,
      reason: err instanceof Error ? err.message : "unknown",
      metadata: await metadata(),
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
