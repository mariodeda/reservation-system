import { NextResponse, type NextRequest } from "next/server";
import { observePlatformRoute } from "@/lib/observability/route-events";
import { testDishCredentials } from "@/lib/reservations/dish-client";
import { findDishTenantByEmail, getDishIntegration, publicDishView, saveDishIntegration, type DishIntegration } from "@/lib/reservations/dish-store";
import { requirePlatform } from "@/lib/reservations/tenant-context";
import { getTenantStore } from "@/lib/reservations/tenant-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return observePlatformRoute(req, "/api/platform/tenants/[id]/dish", getIntegration, req, ctx);
}

async function getIntegration(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const platform = await requirePlatform(req);
  if (!platform.ok) return platform.res;
  const { id } = await ctx.params;
  if (!(await getTenantStore().getById(id))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ integration: publicDishView(await getDishIntegration(id)) });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return observePlatformRoute(req, "/api/platform/tenants/[id]/dish", patchIntegration, req, ctx);
}

async function patchIntegration(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const platform = await requirePlatform(req);
  if (!platform.ok) return platform.res;
  const { id } = await ctx.params;
  if (!(await getTenantStore().getById(id))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  let body: { enabled?: unknown; email?: unknown; password?: unknown; establishmentId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  const existing = await getDishIntegration(id);
  const candidate: DishIntegration = {
    tenantId: id,
    enabled: body.enabled === undefined ? Boolean(existing?.enabled) : Boolean(body.enabled),
    email: body.email === undefined ? existing?.email : String(body.email).trim(),
    password: body.password ? String(body.password) : existing?.password,
    establishmentId: body.establishmentId === undefined ? existing?.establishmentId : String(body.establishmentId).trim(),
    passwordSet: Boolean(body.password || existing?.passwordSet),
    lastSyncAt: existing?.lastSyncAt,
    lastError: existing?.lastError,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (candidate.enabled) {
    if (!candidate.email || !candidate.password) {
      return NextResponse.json({ error: "DISH email and password are required before enabling sync." }, { status: 400 });
    }
    if (!candidate.establishmentId) {
      return NextResponse.json({ error: "DISH establishment id is required before enabling sync." }, { status: 400 });
    }
    const conflictingTenant = await findDishTenantByEmail(candidate.email, id);
    if (conflictingTenant) {
      return NextResponse.json({ error: "This DISH login email is already enabled for another tenant." }, { status: 409 });
    }
    try {
      await testDishCredentials(candidate);
    } catch (err) {
      return NextResponse.json({
        error: err instanceof Error ? `Could not validate DISH login: ${err.message}` : "Could not validate DISH login.",
      }, { status: 400 });
    }
  }
  const saved = await saveDishIntegration(id, {
    enabled: body.enabled === undefined ? undefined : Boolean(body.enabled),
    email: body.email === undefined ? undefined : String(body.email).trim(),
    password: body.password ? String(body.password) : undefined,
    establishmentId: body.establishmentId === undefined ? undefined : String(body.establishmentId).trim(),
  });
  return NextResponse.json({ ok: true, integration: publicDishView(saved) });
}
