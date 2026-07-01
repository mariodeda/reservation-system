import { NextResponse, type NextRequest } from "next/server";
import { listAppEvents, type AppEventFilter } from "@/lib/observability/app-event-store";
import { getTenantStore } from "@/lib/reservations/tenant-store";
import { requirePlatform } from "@/lib/reservations/tenant-context";
import type { ActorType, LogLevel, Surface } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const levels = new Set<LogLevel>(["debug", "info", "warn", "error"]);
const surfaces = new Set<Surface>(["public", "admin", "platform", "system"]);
const actorTypes = new Set<ActorType>(["guest", "staff", "platform", "system", "unknown"]);

function text(params: URLSearchParams, key: string, max = 120): string | undefined {
  const value = String(params.get(key) ?? "").trim();
  return value ? value.slice(0, max) : undefined;
}

function oneOf<T extends string>(params: URLSearchParams, key: string, allowed: Set<T>): T | undefined {
  const value = text(params, key, 32);
  return value && allowed.has(value as T) ? value as T : undefined;
}

function numberParam(params: URLSearchParams, key: string): number | undefined {
  const raw = text(params, key, 16);
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) ? value : undefined;
}

function filters(req: NextRequest): AppEventFilter {
  const params = req.nextUrl.searchParams;
  return {
    tenantId: text(params, "tenantId", 64),
    level: oneOf(params, "level", levels),
    surface: oneOf(params, "surface", surfaces),
    actorType: oneOf(params, "actorType", actorTypes),
    event: text(params, "event", 96),
    requestId: text(params, "requestId", 64),
    reservationId: text(params, "reservationId", 64),
    reference: text(params, "reference", 16),
    status: numberParam(params, "status"),
    reason: text(params, "reason", 120),
    q: text(params, "q", 120),
    from: text(params, "from", 32),
    to: text(params, "to", 32),
    limit: numberParam(params, "limit"),
  };
}

export async function GET(req: NextRequest) {
  const ctx = await requirePlatform(req);
  if (!ctx.ok) return ctx.res;

  try {
    const store = getTenantStore();
    const [events, tenants] = await Promise.all([
      listAppEvents(filters(req)),
      store.list(),
    ]);

    return NextResponse.json({
      events,
      tenants: tenants.map((tenant) => ({
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        status: tenant.status,
      })),
    });
  } catch (err) {
    console.error("[platform/logs] failed:", err);
    return NextResponse.json({ error: "Could not load logs." }, { status: 500 });
  }
}
