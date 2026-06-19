/**
 * Node-side tenant resolution. The Edge proxy can't reach the database, so
 * tenant lookup (and the session<->tenant binding check) happens here, in the
 * route handlers and server components that run on the Node runtime.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantStore } from "./tenant-store";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "./auth";
import {
  PLATFORM_COOKIE,
  verifyPlatformSession,
  type PlatformSession,
} from "./platform-auth";
import type { Tenant } from "./tenant";

const TTL_MS = 30_000;
const cache = new Map<string, { tenant: Tenant | null; exp: number }>();

/** Lowercased hostname without port. */
export function hostOf(req: NextRequest): string {
  return (req.headers.get("host") || "").split(":")[0].trim().toLowerCase();
}

export async function tenantByHost(host: string): Promise<Tenant | null> {
  const now = Date.now();
  const hit = cache.get(`host:${host}`);
  if (hit && hit.exp > now) return hit.tenant;
  const tenant = await getTenantStore().getByHost(host);
  cache.set(`host:${host}`, { tenant, exp: now + TTL_MS });
  return tenant;
}

/** Resolve a tenant by its stable public key (sent by marketing sites). */
export async function tenantByPublicKey(key: string): Promise<Tenant | null> {
  if (!key) return null;
  const now = Date.now();
  const hit = cache.get(`pk:${key}`);
  if (hit && hit.exp > now) return hit.tenant;
  const tenant = await getTenantStore().getByPublicKey(key);
  cache.set(`pk:${key}`, { tenant, exp: now + TTL_MS });
  return tenant;
}

/** Test-only: drop the tenant resolution cache. */
export function clearTenantCache(): void {
  cache.clear();
}

/** Admin/same-origin resolution: host only. */
export async function resolveTenant(req: NextRequest): Promise<Tenant | null> {
  return tenantByHost(hostOf(req));
}

/**
 * Public booking resolution: prefer the explicit `?tenant=<publicKey>` (sent by
 * marketing sites on the shared API), falling back to the Host header for
 * same-origin / single-domain setups.
 */
export async function resolvePublicTenant(req: NextRequest): Promise<Tenant | null> {
  const key = req.nextUrl.searchParams.get("tenant")?.trim();
  if (key) return tenantByPublicKey(key);
  return tenantByHost(hostOf(req));
}

const unknownTenant = () =>
  NextResponse.json({ error: "Unknown tenant for this host." }, { status: 404 });

/** Public routes: require a resolvable tenant (key-first), else a 404 Response. */
export async function requireTenant(
  req: NextRequest,
): Promise<{ ok: true; tenant: Tenant } | { ok: false; res: NextResponse }> {
  const tenant = await resolvePublicTenant(req);
  if (!tenant) return { ok: false, res: unknownTenant() };
  return { ok: true, tenant };
}

export type AdminCtx =
  | { ok: true; tenant: Tenant; session: SessionPayload }
  | { ok: false; res: NextResponse };

/**
 * Admin routes: resolve the tenant by host AND require a session minted for
 * THAT tenant. This is the cross-tenant guard — a valid session for tenant A is
 * rejected (403) on tenant B's host.
 */
export async function requireAdmin(req: NextRequest): Promise<AdminCtx> {
  const tenant = await resolveTenant(req);
  if (!tenant) return { ok: false, res: unknownTenant() };
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.tid !== tenant.id)
    return { ok: false, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { ok: true, tenant, session };
}

export type PlatformCtx =
  | { ok: true; session: PlatformSession }
  | { ok: false; res: NextResponse };

/** Platform (operator) routes: require a valid platform session. */
export async function requirePlatform(req: NextRequest): Promise<PlatformCtx> {
  const session = await verifyPlatformSession(req.cookies.get(PLATFORM_COOKIE)?.value);
  if (!session) return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { ok: true, session };
}
