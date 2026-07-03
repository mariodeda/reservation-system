import { NextResponse, type NextRequest } from "next/server";
import { observePlatformRoute } from "@/lib/observability/route-events";
import { addDays, nowInTz } from "@/lib/reservations/availability";
import { getStore } from "@/lib/reservations/store";
import { syncDishReservations } from "@/lib/reservations/dish-sync";
import { requirePlatform } from "@/lib/reservations/tenant-context";
import { getTenantStore } from "@/lib/reservations/tenant-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SYNC_DEADLINE_MS = 105_000;

function dateOnly(value: unknown): string | undefined {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return observePlatformRoute(req, "/api/platform/tenants/[id]/dish/sync", syncIntegration, req, ctx);
}

async function syncIntegration(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const platform = await requirePlatform(req);
  if (!platform.ok) return platform.res;
  const { id } = await ctx.params;
  if (!(await getTenantStore().getById(id))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  let body: { startDate?: unknown; endDate?: unknown; mode?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* allow empty body */
  }
  let endDate = dateOnly(body.endDate) ?? today();
  let startDate = dateOnly(body.startDate) ?? endDate;
  const firstSync = body.mode === "first";
  const history60 = body.mode === "history60";
  if (firstSync) {
    const config = await getStore().forTenant(id).getConfig();
    startDate = nowInTz(config.timezone).dateStr;
    endDate = addDays(startDate, Math.min(Math.max(1, config.bookingWindowDays), 365));
  } else if (history60) {
    const config = await getStore().forTenant(id).getConfig();
    endDate = nowInTz(config.timezone).dateStr;
    startDate = addDays(endDate, -59);
  }
  try {
    const result = await syncDishReservations(id, {
      startDate,
      endDate,
      emitEvents: firstSync || history60 ? false : undefined,
      skipExisting: firstSync || history60,
      detailMode: firstSync || history60 ? "new" : "always",
      trigger: firstSync ? "first" : history60 ? "history60" : "manual",
      deadlineAt: Date.now() + SYNC_DEADLINE_MS,
    });
    return NextResponse.json({ ok: true, result, range: { startDate, endDate, mode: firstSync ? "first" : history60 ? "history60" : "manual" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "DISH sync failed." }, { status: 502 });
  }
}
