import { NextResponse, type NextRequest } from "next/server";
import { requirePlatform } from "@/lib/reservations/tenant-context";
import { getTenantStore } from "@/lib/reservations/tenant-store";
import { clearTheForkTokenCache, testTheForkCredentials } from "@/lib/reservations/thefork-client";
import { findTheForkTenantByRestaurantUuid, getTheForkIntegration, isUuid, publicTheForkView, saveTheForkIntegration, type TheForkIntegration } from "@/lib/reservations/thefork-store";
import { observePlatformRoute } from "@/lib/observability/route-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function originOf(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return observePlatformRoute(req, "/api/platform/tenants/[id]/thefork", getIntegration, req, ctx);
}

async function getIntegration(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const platform = await requirePlatform(req);
  if (!platform.ok) return platform.res;
  const { id } = await ctx.params;
  if (!(await getTenantStore().getById(id))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ integration: publicTheForkView(await getTheForkIntegration(id), originOf(req)) });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return observePlatformRoute(req, "/api/platform/tenants/[id]/thefork", patchIntegration, req, ctx);
}

async function patchIntegration(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const platform = await requirePlatform(req);
  if (!platform.ok) return platform.res;
  const { id } = await ctx.params;
  if (!(await getTenantStore().getById(id))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  let body: {
    enabled?: unknown;
    clientId?: unknown;
    clientSecret?: unknown;
    restaurantUuid?: unknown;
    groupUuid?: unknown;
    rotateWebhookToken?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  const restaurantUuid = body.restaurantUuid == null ? undefined : String(body.restaurantUuid).trim();
  const groupUuid = body.groupUuid == null ? undefined : String(body.groupUuid).trim();
  if (restaurantUuid && !isUuid(restaurantUuid)) return NextResponse.json({ error: "Invalid TheFork restaurant UUID." }, { status: 400 });
  if (groupUuid && !isUuid(groupUuid)) return NextResponse.json({ error: "Invalid TheFork group UUID." }, { status: 400 });
  const existing = await getTheForkIntegration(id);
  const hasRestaurantUuid = Object.prototype.hasOwnProperty.call(body, "restaurantUuid");
  const hasGroupUuid = Object.prototype.hasOwnProperty.call(body, "groupUuid");
  const candidate: TheForkIntegration = {
    tenantId: id,
    enabled: body.enabled === undefined ? Boolean(existing?.enabled) : Boolean(body.enabled),
    clientId: body.clientId === undefined ? existing?.clientId : String(body.clientId).trim(),
    clientSecret: body.clientSecret ? String(body.clientSecret) : existing?.clientSecret,
    clientSecretSet: Boolean(body.clientSecret || existing?.clientSecretSet),
    restaurantUuid: hasRestaurantUuid ? (restaurantUuid || undefined) : existing?.restaurantUuid,
    groupUuid: hasGroupUuid ? (groupUuid || undefined) : existing?.groupUuid,
    webhookTokenSet: Boolean(existing?.webhookTokenSet),
    lastSyncAt: existing?.lastSyncAt,
    lastWebhookAt: existing?.lastWebhookAt,
    lastError: existing?.lastError,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (candidate.enabled) {
    if (!candidate.clientId || !candidate.clientSecret) {
      return NextResponse.json({ error: "TheFork Client ID and Client secret are required before enabling sync." }, { status: 400 });
    }
    if (!candidate.restaurantUuid) {
      return NextResponse.json({ error: "TheFork Restaurant UUID is required before enabling sync." }, { status: 400 });
    }
    const conflictingTenant = await findTheForkTenantByRestaurantUuid(candidate.restaurantUuid, id);
    if (conflictingTenant) {
      return NextResponse.json({ error: "This TheFork restaurant UUID is already enabled for another tenant." }, { status: 409 });
    }
    if (body.clientId !== undefined || body.clientSecret) clearTheForkTokenCache();
    try {
      await testTheForkCredentials(candidate);
    } catch (err) {
      return NextResponse.json({
        error: err instanceof Error ? `Could not validate TheFork API credentials: ${err.message}` : "Could not validate TheFork API credentials.",
      }, { status: 400 });
    }
  }
  const saved = await saveTheForkIntegration(id, {
    enabled: body.enabled === undefined ? undefined : Boolean(body.enabled),
    clientId: body.clientId === undefined ? undefined : String(body.clientId).trim(),
    clientSecret: body.clientSecret ? String(body.clientSecret) : undefined,
    restaurantUuid,
    groupUuid,
    rotateWebhookToken: Boolean(body.rotateWebhookToken),
  });
  if (body.clientId !== undefined || body.clientSecret) clearTheForkTokenCache();
  return NextResponse.json({
    ok: true,
    integration: publicTheForkView(saved.integration, originOf(req)),
    webhookToken: saved.webhookToken,
  });
}
