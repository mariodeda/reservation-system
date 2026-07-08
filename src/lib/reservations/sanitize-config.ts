/**
 * Sanitises an untrusted availability config into a safe, fully-populated
 * AvailabilityConfig. Pure (no I/O) so it can be unit-tested and reused by the
 * admin config route. Every numeric field is clamped, every date/time string is
 * validated, and the weekly schedule always has all 7 days.
 *
 * Multi-offering: the output always carries a canonical `offerings` array whose
 * first entry has the stable id "main", and the top-level weekly/dateOverrides/
 * blockedSlots mirror offerings[0] for legacy readers. Idempotent.
 */
import {
  type AvailabilityConfig,
  type CapacityMode,
  type DaySchedule,
  DEFAULT_OFFERING_ID,
  type DisabledServices,
  type DatedSlotCapacityOverrides,
  type ForwardSlotCapacityOverrides,
  type Offering,
  type ServiceWindow,
} from "./types";
import { canonicalServiceLabel } from "./service-catalog";

const MAX_OFFERINGS = 12;

export const isTime = (s: unknown) =>
  typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const isDate = (s: unknown) =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export const clamp = (n: unknown, min: number, max: number, dflt: number) => {
  const v = Math.trunc(Number(n));
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt;
};

export function sanitizeService(s: Partial<ServiceWindow>, i: number): ServiceWindow {
  const id = String(s.id ?? `service-${i}`).slice(0, 40);
  const out: ServiceWindow = {
    id,
    label: canonicalServiceLabel(id, String(s.label ?? "Service").slice(0, 60)),
    start: isTime(s.start) ? (s.start as string) : "12:00",
    end: isTime(s.end) ? (s.end as string) : "22:00",
    interval: clamp(s.interval, 5, 240, 30),
    capacity: clamp(s.capacity, 0, 100000, 20),
  };
  // Optional per-service table turn time; only persisted when explicitly set.
  if (s.turnMinutes != null) out.turnMinutes = clamp(s.turnMinutes, 15, 1440, 120);
  return out;
}

export function sanitizeDay(d: Partial<DaySchedule> | undefined): DaySchedule {
  const services = Array.isArray(d?.services) ? d!.services.slice(0, 8) : [];
  return {
    closed: Boolean(d?.closed),
    services: services.map((s, i) => sanitizeService(s, i)),
  };
}

/** The per-offering schedule bundle: weekly (all 7 days) + overrides + blocks. */
type ScheduleBundle = Pick<Offering, "weekly" | "dateOverrides" | "blockedSlots">;

function sanitizeScheduleBundle(
  input: Partial<ScheduleBundle> | undefined,
): ScheduleBundle {
  const weekly: ScheduleBundle["weekly"] = {};
  for (let d = 0; d < 7; d++) weekly[d] = sanitizeDay(input?.weekly?.[d]);

  const blockedSlots: ScheduleBundle["blockedSlots"] = {};
  if (input?.blockedSlots && typeof input.blockedSlots === "object") {
    for (const [date, times] of Object.entries(input.blockedSlots)) {
      if (!isDate(date) || !Array.isArray(times)) continue;
      const valid = Array.from(new Set(times.filter(isTime))).slice(0, 100);
      if (valid.length) blockedSlots[date] = valid;
    }
  }

  const dateOverrides: ScheduleBundle["dateOverrides"] = {};
  if (input?.dateOverrides && typeof input.dateOverrides === "object") {
    for (const [date, sched] of Object.entries(input.dateOverrides)) {
      if (isDate(date)) dateOverrides[date] = sanitizeDay(sched as DaySchedule);
    }
  }

  return { weekly, dateOverrides, blockedSlots };
}

function sanitizeDisabledServices(input: Partial<AvailabilityConfig>): DisabledServices | undefined {
  const out: DisabledServices = {};
  const value = input.disabledServices;
  if (!value || typeof value !== "object") return undefined;
  for (const [date, byOffering] of Object.entries(value)) {
    if (!isDate(date) || !byOffering || typeof byOffering !== "object") continue;
    for (const [offeringId, serviceIds] of Object.entries(byOffering)) {
      if (!Array.isArray(serviceIds)) continue;
      const oid = String(offeringId).slice(0, 40);
      const valid = Array.from(
        new Set(
          serviceIds
            .map((id) => String(id).slice(0, 40))
            .filter((id) => id.length > 0),
        ),
      ).slice(0, 32);
      if (!valid.length) continue;
      out[date] ??= {};
      out[date][oid] = valid;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function sanitizeCapacityMode(input: unknown): CapacityMode {
  return input === "manual" ? "manual" : "tables";
}

function sanitizeDatedSlotCapacityOverrides(input: Partial<AvailabilityConfig>): DatedSlotCapacityOverrides | undefined {
  const value = input.slotCapacityOverrides;
  if (!value || typeof value !== "object") return undefined;
  const out: DatedSlotCapacityOverrides = {};
  for (const [date, byOffering] of Object.entries(value)) {
    if (!isDate(date) || !byOffering || typeof byOffering !== "object") continue;
    for (const [offeringId, byService] of Object.entries(byOffering)) {
      if (!byService || typeof byService !== "object") continue;
      const oid = String(offeringId).slice(0, 40);
      for (const [serviceId, byTime] of Object.entries(byService)) {
        if (!byTime || typeof byTime !== "object") continue;
        const sid = String(serviceId).slice(0, 40);
        for (const [time, rawCapacity] of Object.entries(byTime)) {
          if (!isTime(time)) continue;
          const capacity = clamp(rawCapacity, 0, 100000, 20);
          out[date] ??= {};
          out[date][oid] ??= {};
          out[date][oid][sid] ??= {};
          out[date][oid][sid][time] = capacity;
        }
      }
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function sanitizeForwardSlotCapacityOverrides(input: Partial<AvailabilityConfig>): ForwardSlotCapacityOverrides | undefined {
  const value = input.forwardSlotCapacityOverrides;
  if (!value || typeof value !== "object") return undefined;
  const out: ForwardSlotCapacityOverrides = {};
  for (const [offeringId, byService] of Object.entries(value)) {
    if (!byService || typeof byService !== "object") continue;
    const oid = String(offeringId).slice(0, 40);
    for (const [serviceId, byTime] of Object.entries(byService)) {
      if (!byTime || typeof byTime !== "object") continue;
      const sid = String(serviceId).slice(0, 40);
      for (const [time, rawEntries] of Object.entries(byTime)) {
        if (!isTime(time) || !Array.isArray(rawEntries)) continue;
        const entries = rawEntries
          .filter((entry): entry is { effectiveFrom: string; capacity: number } =>
            Boolean(entry) &&
            typeof entry === "object" &&
            isDate((entry as { effectiveFrom?: unknown }).effectiveFrom),
          )
          .map((entry) => ({
            effectiveFrom: String(entry.effectiveFrom),
            capacity: clamp(entry.capacity, 0, 100000, 20),
          }))
          .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
          .slice(-120);
        if (!entries.length) continue;
        out[oid] ??= {};
        out[oid][sid] ??= {};
        out[oid][sid][time] = entries;
      }
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export function sanitizeConfig(input: Partial<AvailabilityConfig>): AvailabilityConfig {
  // Build the canonical offerings array. If the input carries offerings, use
  // them; otherwise synthesize a single primary offering from the top-level
  // schedule (legacy / single-offering configs). The primary offering's id is
  // ALWAYS DEFAULT_OFFERING_ID so it stays in lockstep with the reservation
  // backfill and the DB column default — never orphaning existing bookings.
  const rawOfferings =
    Array.isArray(input.offerings) && input.offerings.length > 0
      ? input.offerings.slice(0, MAX_OFFERINGS)
      : null;

  const offerings: Offering[] = [];
  const usedIds = new Set<string>();
  const sources: Array<Partial<Offering>> = rawOfferings ?? [
    { id: DEFAULT_OFFERING_ID, label: "Dining", weekly: input.weekly, dateOverrides: input.dateOverrides, blockedSlots: input.blockedSlots },
  ];

  sources.forEach((o, i) => {
    const bundle = sanitizeScheduleBundle(o);
    // index 0 is always "main"; others keep their id (deduped) or get a fallback.
    let id =
      i === 0 ? DEFAULT_OFFERING_ID : String(o.id ?? `offering-${i}`).slice(0, 40);
    if (i > 0) {
      while (id === DEFAULT_OFFERING_ID || usedIds.has(id)) id = `${id}-${i}`.slice(0, 40);
    }
    usedIds.add(id);
    const offering: Offering = {
      id,
      // Use `||` (not `??`) so an empty/whitespace label falls back to a default
      // rather than persisting a blank, invisible offering name.
      label: (String(o.label ?? "").trim() || (i === 0 ? "Dining" : `Offering ${i + 1}`)).slice(0, 60),
      ...bundle,
    };
    const description = typeof o.description === "string" ? o.description.slice(0, 280) : undefined;
    if (description) offering.description = description;
    offerings.push(offering);
  });

  // Mirror offerings[0] into the top-level fields so legacy readers and the
  // config-route guard keep working without knowing about offerings.
  const primary = offerings[0];

  const closures = Array.isArray(input.closures)
    ? Array.from(new Set(input.closures.filter(isDate))).slice(0, 1000)
    : [];

  const minPartySize = clamp(input.minPartySize, 1, 1000, 1);
  const rawTz = typeof input.timezone === "string" ? input.timezone.slice(0, 64) : "";
  const validTz = rawTz && (() => { try { Intl.DateTimeFormat(undefined, { timeZone: rawTz }); return true; } catch { return false; } })();
  const out: AvailabilityConfig = {
    timezone: validTz ? rawTz : "Europe/Rome",
    bookingWindowDays: clamp(input.bookingWindowDays, 1, 730, 60),
    minPartySize,
    maxPartySize: clamp(input.maxPartySize, minPartySize, 1000, 12),
    leadMinutes: clamp(input.leadMinutes, 0, 7 * 24 * 60, 0),
    weekly: primary.weekly,
    closures,
    dateOverrides: primary.dateOverrides,
    blockedSlots: primary.blockedSlots,
    capacityMode: sanitizeCapacityMode(input.capacityMode),
    offerings,
  };
  // Optional default table turn time; only persisted when explicitly set.
  if (input.turnMinutes != null) out.turnMinutes = clamp(input.turnMinutes, 15, 1440, 120);
  const disabledServices = sanitizeDisabledServices(input);
  if (disabledServices) out.disabledServices = disabledServices;
  const slotCapacityOverrides = sanitizeDatedSlotCapacityOverrides(input);
  if (slotCapacityOverrides) out.slotCapacityOverrides = slotCapacityOverrides;
  const forwardSlotCapacityOverrides = sanitizeForwardSlotCapacityOverrides(input);
  if (forwardSlotCapacityOverrides) out.forwardSlotCapacityOverrides = forwardSlotCapacityOverrides;
  return out;
}
