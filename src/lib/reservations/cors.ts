/**
 * Per-tenant CORS for the public booking API. A marketing site on another domain
 * may call these endpoints only if its Origin is in the tenant's allowedOrigins.
 * Same-origin / server-to-server requests send no Origin and need no CORS.
 */
import { NextResponse, type NextRequest } from "next/server";
import type { Tenant } from "./tenant";

/** The Origin to echo back if it's allowed for this tenant, else null. */
export function allowedOrigin(req: NextRequest, tenant: Tenant): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  const allow = tenant.settings.allowedOrigins ?? [];
  return allow.includes(origin.toLowerCase()) ? origin : null;
}

/** Echo CORS headers on a response for an allowed origin. No-op when null. */
export function withCors<T extends Response>(res: T, origin: string | null): T {
  if (origin) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.append("Vary", "Origin");
  }
  return res;
}

/**
 * Preflight (OPTIONS) handler body. 204 + CORS headers if the origin is allowed
 * for the resolved tenant, else 403. The browser preflights the exact URL
 * (including `?tenant=`), so the tenant resolves the same way as the real call.
 */
export function preflight(req: NextRequest, tenant: Tenant | null): NextResponse {
  const origin = tenant ? allowedOrigin(req, tenant) : null;
  if (!origin) return new NextResponse(null, { status: 403 });
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  res.headers.set("Access-Control-Max-Age", "600");
  res.headers.append("Vary", "Origin");
  return res;
}
