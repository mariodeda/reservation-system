import { NextResponse, type NextRequest } from "next/server";
import { requirePlatform } from "@/lib/reservations/tenant-context";
import { addDays, nowInTz } from "@/lib/reservations/availability";
import { getStore } from "@/lib/reservations/store";
import { getTenantStore } from "@/lib/reservations/tenant-store";
import { syncTheForkReservations } from "@/lib/reservations/thefork-sync";
import { observePlatformRoute } from "@/lib/observability/route-events";

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
  return observePlatformRoute(req, "/api/platform/tenants/[id]/thefork/sync", syncIntegration, req, ctx);
}

async function syncIntegration(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const platform = await requirePlatform(req);
  if (!platform.ok) return platform.res;
  const { id } = await ctx.params;
  if (!(await getTenantStore().getById(id))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  let body: { startDate?: unknown; endDate?: unknown; filterBy?: unknown; mode?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* allow empty body */
  }
  let endDate = dateOnly(body.endDate) ?? today();
  let startDate = dateOnly(body.startDate) ?? endDate;
  let filterBy: "updatedDate" | "mealDate" = body.filterBy === "mealDate" ? "mealDate" : "updatedDate";
  const firstSync = body.mode === "first";
  if (firstSync) {
    const config = await getStore().forTenant(id).getConfig();
    startDate = nowInTz(config.timezone).dateStr;
    endDate = addDays(startDate, Math.min(Math.max(1, config.bookingWindowDays), 365));
    filterBy = "mealDate";
  }
  try {
    const result = await syncTheForkReservations(id, {
      startDate,
      endDate,
      filterBy,
      emitEvents: firstSync ? false : undefined,
      skipExisting: firstSync,
      deadlineAt: Date.now() + SYNC_DEADLINE_MS,
    });
    return NextResponse.json({ ok: true, result, range: { startDate, endDate, filterBy, mode: firstSync ? "first" : "manual" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "TheFork sync failed." }, { status: 502 });
  }
}
