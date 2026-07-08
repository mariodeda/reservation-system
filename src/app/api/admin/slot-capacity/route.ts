import { NextResponse, type NextRequest } from "next/server";
import { generateSlots, scheduleForDate } from "@/lib/reservations/availability";
import { getOfferings } from "@/lib/reservations/offerings";
import { getStore } from "@/lib/reservations/store";
import { clamp, isDate, isTime, sanitizeConfig } from "@/lib/reservations/sanitize-config";
import { requireAdmin } from "@/lib/reservations/tenant-context";
import { DEFAULT_OFFERING_ID, type AvailabilityConfig, type OfferingId, type ServiceId } from "@/lib/reservations/types";
import { observeAdminRoute } from "@/lib/observability/route-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SlotCapacityBody {
  date?: unknown;
  offering?: unknown;
  service?: unknown;
  time?: unknown;
  capacity?: unknown;
  scope?: unknown;
}

export async function PATCH(req: NextRequest) {
  return observeAdminRoute(req, "/api/admin/slot-capacity", patchSlotCapacity, req);
}

async function patchSlotCapacity(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;

  let body: SlotCapacityBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const rawDate = body.date;
  const rawTime = body.time;
  const offering = String(body.offering ?? DEFAULT_OFFERING_ID).slice(0, 40) as OfferingId;
  const service = String(body.service ?? "").slice(0, 40) as ServiceId;
  const scope = body.scope === "future" ? "future" : "date";
  const capacity = clamp(body.capacity, 0, 100000, 20);
  if (!isDate(rawDate) || !isTime(rawTime) || !offering || !service) {
    return NextResponse.json({ error: "Date, offering, service, time, and capacity are required." }, { status: 400 });
  }
  const date = rawDate as string;
  const time = rawTime as string;

  const store = getStore().forTenant(ctx.tenant.id);
  const config = await store.getConfig();
  if ((config.capacityMode ?? "tables") !== "manual") {
    return NextResponse.json({ error: "Manual slot capacity is not enabled for this restaurant." }, { status: 409 });
  }
  const offerings = getOfferings(config, ctx.tenant.name);
  if (!offerings.some((o) => o.id === offering)) {
    return NextResponse.json({ error: "Offering not found." }, { status: 404 });
  }

  const schedule = scheduleForDate(config, date, offering);
  const serviceWindow = schedule.services.find((s) => s.id === service);
  const validSlot = Boolean(serviceWindow && generateSlots(serviceWindow).includes(time));
  if (!validSlot) {
    return NextResponse.json({ error: "That service/time is not configured for this date." }, { status: 404 });
  }

  const saved = await store.saveConfig(sanitizeConfig(updateSlotCapacity(config, offering, service, date, time, capacity, scope)));
  return NextResponse.json({ ok: true, capacityMode: saved.capacityMode ?? "tables", offering, service, date, time, capacity, scope });
}

function updateSlotCapacity(
  config: AvailabilityConfig,
  offering: OfferingId,
  service: ServiceId,
  date: string,
  time: string,
  capacity: number,
  scope: "date" | "future",
): AvailabilityConfig {
  const next = structuredClone(config);
  if (scope === "date") {
    next.slotCapacityOverrides ??= {};
    next.slotCapacityOverrides[date] ??= {};
    next.slotCapacityOverrides[date][offering] ??= {};
    next.slotCapacityOverrides[date][offering][service] ??= {};
    next.slotCapacityOverrides[date][offering][service][time] = capacity;
    return next;
  }

  next.forwardSlotCapacityOverrides ??= {};
  next.forwardSlotCapacityOverrides[offering] ??= {};
  next.forwardSlotCapacityOverrides[offering][service] ??= {};
  const entries = next.forwardSlotCapacityOverrides[offering][service][time] ?? [];
  const withoutSameDate = entries.filter((entry) => entry.effectiveFrom !== date);
  next.forwardSlotCapacityOverrides[offering][service][time] = [...withoutSameDate, { effectiveFrom: date, capacity }]
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

  const dated = next.slotCapacityOverrides?.[date]?.[offering]?.[service];
  if (dated) {
    delete dated[time];
    if (Object.keys(dated).length === 0) delete next.slotCapacityOverrides?.[date]?.[offering]?.[service];
  }
  return next;
}
