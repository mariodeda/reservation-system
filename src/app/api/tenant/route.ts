import { NextResponse, type NextRequest } from "next/server";
import { tenantByHost, tenantByPublicKey } from "@/lib/reservations/tenant-context";
import { allowedOrigin, preflight, withCors } from "@/lib/reservations/cors";
import type { Tenant } from "@/lib/reservations/tenant";

export const runtime = "nodejs";

/**
 * Public branding endpoint for the book-now page.
 *   GET /api/tenant?tenant=<publicKey>   (preferred — scalable, host-independent)
 *   GET /api/tenant?host=<host>          (fallback)
 *   -> { name, theme } | 404
 *
 * Returns only non-sensitive branding (name + accent theme), never credentials.
 * Lives with the reservation service after the split (see docs/RESERVATION-SPLIT.md);
 * marketing sites consume it cross-origin.
 */
async function resolve(req: NextRequest): Promise<Tenant | null> {
  const key = req.nextUrl.searchParams.get("tenant")?.trim();
  if (key) return tenantByPublicKey(key);
  const host = (req.nextUrl.searchParams.get("host") ?? req.headers.get("host") ?? "")
    .split(":")[0]
    .trim()
    .toLowerCase();
  return host ? tenantByHost(host) : null;
}

export async function OPTIONS(req: NextRequest) {
  return preflight(req, await resolve(req));
}

export async function GET(req: NextRequest) {
  const tenant = await resolve(req);
  if (!tenant) {
    return NextResponse.json({ error: "Unknown tenant" }, { status: 404 });
  }
  const res = NextResponse.json({
    name: tenant.name,
    theme: tenant.settings.theme ?? undefined,
  });
  return withCors(res, allowedOrigin(req, tenant));
}
