import { NextResponse, type NextRequest } from "next/server";
import { getStore } from "@/lib/reservations/store";
import { sanitizeConfig } from "@/lib/reservations/sanitize-config";
import { requireAdmin } from "@/lib/reservations/tenant-context";
import type { CapacityMode } from "@/lib/reservations/types";
import { observeAdminRoute } from "@/lib/observability/route-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return observeAdminRoute(req, "/api/admin/settings/capacity", getCapacitySettings, req);
}

export async function PATCH(req: NextRequest) {
  return observeAdminRoute(req, "/api/admin/settings/capacity", patchCapacitySettings, req);
}

async function getCapacitySettings(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;
  const config = await getStore().forTenant(ctx.tenant.id).getConfig();
  return NextResponse.json({ capacityMode: config.capacityMode ?? "tables" });
}

async function patchCapacitySettings(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;

  let body: { capacityMode?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  if (body.capacityMode !== "tables" && body.capacityMode !== "manual") {
    return NextResponse.json({ error: "capacityMode must be tables or manual." }, { status: 400 });
  }

  const store = getStore().forTenant(ctx.tenant.id);
  const config = await store.getConfig();
  const saved = await store.saveConfig(sanitizeConfig({ ...config, capacityMode: body.capacityMode as CapacityMode }));
  return NextResponse.json({ capacityMode: saved.capacityMode ?? "tables" });
}
