import { NextResponse, type NextRequest } from "next/server";
import { getStore } from "@/lib/reservations/store";
import { nowInTz, scheduleForDate, toMinutes } from "@/lib/reservations/availability";
import { getOfferings } from "@/lib/reservations/offerings";
import { sanitizeConfig } from "@/lib/reservations/sanitize-config";
import { serviceLabelsFor } from "@/lib/reservations/service-catalog";
import { requireAdmin } from "@/lib/reservations/tenant-context";
import type { AvailabilityConfig, OfferingId, ServiceId } from "@/lib/reservations/types";
import { observeAdminRoute } from "@/lib/observability/route-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface TodayBookingControlService {
  offering: OfferingId;
  offeringLabel: string;
  service: ServiceId;
  serviceLabel: string;
  serviceLabelEn?: string;
  serviceLabelIt?: string;
  start: string;
  end: string;
  cutoffTime: string;
  disabled: boolean;
  cutoffPassed: boolean;
}

export interface TodayBookingControlsResponse {
  date: string;
  timezone: string;
  leadMinutes: number;
  services: TodayBookingControlService[];
}

export async function GET(req: NextRequest) {
  return observeAdminRoute(req, "/api/admin/today-booking-controls", getTodayControls, req);
}

export async function PATCH(req: NextRequest) {
  return observeAdminRoute(req, "/api/admin/today-booking-controls", patchTodayControl, req);
}

async function getTodayControls(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;
  const store = getStore().forTenant(ctx.tenant.id);
  const config = await store.getConfig();
  return NextResponse.json(todayControls(config, ctx.tenant.name));
}

async function patchTodayControl(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;

  let body: { offering?: unknown; service?: unknown; disabled?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const offering = String(body.offering ?? "").slice(0, 40);
  const service = String(body.service ?? "").slice(0, 40);
  const disabled = Boolean(body.disabled);
  if (!offering || !service) {
    return NextResponse.json({ error: "Offering and service are required." }, { status: 400 });
  }

  const store = getStore().forTenant(ctx.tenant.id);
  const config = await store.getConfig();
  const controls = todayControls(config, ctx.tenant.name);
  const target = controls.services.find((s) => s.offering === offering && s.service === service);
  if (!target) return NextResponse.json({ error: "Service is not available today." }, { status: 404 });
  if (target.cutoffPassed) {
    return NextResponse.json({ error: "This service can no longer be changed for today." }, { status: 409 });
  }

  const next = structuredClone(config);
  next.disabledServices = { ...(next.disabledServices ?? {}) };
  const byDate = { ...(next.disabledServices[controls.date] ?? {}) };
  const ids = new Set(byDate[offering] ?? []);
  if (disabled) ids.add(service);
  else ids.delete(service);
  if (ids.size) byDate[offering] = [...ids];
  else delete byDate[offering];
  if (Object.keys(byDate).length) next.disabledServices[controls.date] = byDate;
  else delete next.disabledServices[controls.date];
  if (Object.keys(next.disabledServices).length === 0) delete next.disabledServices;

  const saved = await store.saveConfig(sanitizeConfig(next));
  return NextResponse.json({ ok: true, ...todayControls(saved, ctx.tenant.name) });
}

function todayControls(config: AvailabilityConfig, tenantName: string): TodayBookingControlsResponse {
  const now = nowInTz(config.timezone);
  const services: TodayBookingControlService[] = [];
  for (const offering of getOfferings(config, tenantName)) {
    const schedule = scheduleForDate(config, now.dateStr, offering.id);
    if (schedule.closed) continue;
    for (const service of schedule.services) {
      const cutoffMinutes = toMinutes(service.end) - config.leadMinutes;
      const cutoffPassed = now.minutes > cutoffMinutes;
      const labels = serviceLabelsFor(service);
      services.push({
        offering: offering.id,
        offeringLabel: offering.label,
        service: service.id,
        serviceLabel: service.label,
        serviceLabelEn: labels.labelEn,
        serviceLabelIt: labels.labelIt,
        start: service.start,
        end: service.end,
        cutoffTime: minutesToTime(Math.max(0, cutoffMinutes)),
        disabled: config.disabledServices?.[now.dateStr]?.[offering.id]?.includes(service.id) ?? false,
        cutoffPassed,
      });
    }
  }
  return { date: now.dateStr, timezone: config.timezone, leadMinutes: config.leadMinutes, services };
}

function minutesToTime(minutes: number): string {
  const clamped = Math.min(23 * 60 + 59, Math.max(0, minutes));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}
