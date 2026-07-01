import { NextResponse, type NextRequest } from "next/server";
import { getStore } from "@/lib/reservations/store";
import { sanitizeConfig } from "@/lib/reservations/sanitize-config";
import { requireAdmin } from "@/lib/reservations/tenant-context";
import type { AvailabilityConfig } from "@/lib/reservations/types";
import { observeAdminRoute } from "@/lib/observability/route-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return observeAdminRoute(req, "/api/admin/config", getConfig, req);
}

async function getConfig(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;
  try {
    return NextResponse.json({ config: await getStore().forTenant(ctx.tenant.id).getConfig() });
  } catch (err) {
    console.error("[reservations] read config failed:", err);
    return NextResponse.json({ error: "Could not load configuration." }, { status: 500 });
  }
}

/** PUT /api/admin/config — replace the whole availability config (sanitized). */
export async function PUT(req: NextRequest) {
  return observeAdminRoute(req, "/api/admin/config", putConfig, req);
}

async function putConfig(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;
  let body: { config?: Partial<AvailabilityConfig> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  // Accept either a legacy top-level weekly schedule or an offerings array
  // (sanitizeConfig normalizes both and mirrors offerings[0] back to top-level).
  if (
    !body.config ||
    typeof body.config !== "object" ||
    (!body.config.weekly && !(Array.isArray(body.config.offerings) && body.config.offerings.length > 0))
  ) {
    return NextResponse.json({ error: "Invalid config." }, { status: 400 });
  }
  try {
    const saved = await getStore().forTenant(ctx.tenant.id).saveConfig(sanitizeConfig(body.config));
    return NextResponse.json({ ok: true, config: saved });
  } catch (err) {
    console.error("[reservations] save config failed:", err);
    return NextResponse.json({ error: "Could not save configuration." }, { status: 500 });
  }
}
