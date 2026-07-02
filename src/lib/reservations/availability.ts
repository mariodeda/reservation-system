import {
  ACTIVE_STATUSES,
  type AvailabilityConfig,
  type DayAvailability,
  type DaySchedule,
  type MonthDay,
  type NewReservationInput,
  type Offering,
  type OfferingId,
  type Reservation,
  type RestaurantTable,
  type ServiceId,
  type ServiceWindow,
} from "./types";
import { getOffering, getOfferings, offeringOf } from "./offerings";

/* ---------- time helpers ---------- */

export const toMinutes = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const pad = (n: number) => String(n).padStart(2, "0");
const toTime = (mins: number): string => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

export function generateSlots(w: ServiceWindow): string[] {
  const out: string[] = [];
  const interval = Math.floor(Number(w.interval));
  if (!Number.isFinite(interval) || interval <= 0) return out; // guard against bad config
  const start = toMinutes(w.start);
  const end = toMinutes(w.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return out;
  for (let m = start; m <= end && out.length < 288; m += interval) out.push(toTime(m));
  return out;
}

/** Current date + minute-of-day in the configured timezone. */
export function nowInTz(tz: string): { dateStr: string; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
  const hour = p.hour === "24" ? 0 : Number(p.hour);
  return { dateStr: `${p.year}-${p.month}-${p.day}`, minutes: hour * 60 + Number(p.minute) };
}

const isValidDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const weekdayOf = (dateStr: string) => new Date(`${dateStr}T00:00:00Z`).getUTCDay();

/** Add N days to a YYYY-MM-DD string (UTC-safe). */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Resolve the day's schedule for a single offering (date override ?? weekly). */
export function scheduleForOffering(offering: Offering, dateStr: string): DaySchedule {
  return (
    offering.dateOverrides[dateStr] ??
    offering.weekly[weekdayOf(dateStr)] ?? { closed: true, services: [] }
  );
}

/**
 * Resolve the day's schedule for a config. Back-compat: with no offeringId it
 * uses the primary ("main") offering, which for a legacy/single-offering config
 * is exactly the old top-level weekly/dateOverrides behavior.
 */
export function scheduleForDate(
  config: AvailabilityConfig,
  dateStr: string,
  offeringId?: OfferingId,
): DaySchedule {
  return scheduleForOffering(getOffering(config, offeringId), dateStr);
}

/** True when the given offering is unbookable on the date (closed/no services). */
export function isClosed(
  config: AvailabilityConfig,
  dateStr: string,
  offeringId?: OfferingId,
): boolean {
  if (config.closures.includes(dateStr)) return true; // tenant-wide holidays
  const s = scheduleForDate(config, dateStr, offeringId);
  return s.closed || s.services.length === 0;
}

export function isServiceDisabled(
  config: AvailabilityConfig,
  dateStr: string,
  offeringId: OfferingId,
  serviceId: ServiceId,
): boolean {
  return config.disabledServices?.[dateStr]?.[offeringId]?.includes(serviceId) ?? false;
}

function activeTables(tables?: RestaurantTable[]): RestaurantTable[] {
  return (tables ?? []).filter((t) => t.active);
}

/**
 * Bookable covers for a service slot. Once a tenant has active managed tables,
 * the table inventory is the capacity source of truth. A table bound to an
 * offering only contributes to that offering; an unbound table contributes to
 * every offering's capacity view. Tenants without active tables keep the legacy
 * per-service capacity fallback.
 */
export function serviceSlotCapacity(
  service: ServiceWindow,
  offeringId: OfferingId,
  tables?: RestaurantTable[],
): number {
  const active = activeTables(tables);
  if (active.length === 0) return service.capacity;
  return active
    .filter((t) => t.offering === null || t.offering === offeringId)
    .reduce((sum, t) => sum + t.capacity, 0);
}

export const DEFAULT_TURN_MINUTES = 120;

/**
 * Minutes a table stays occupied for a booking in the given offering/service:
 * the service's own override, else the config default, else 120. Used for
 * physical table-assignment conflict detection and table-derived covers capacity.
 */
export function turnMinutesFor(
  config: AvailabilityConfig,
  offeringId: OfferingId | undefined,
  serviceId: ServiceId,
  dateStr?: string,
): number {
  const offering = getOffering(config, offeringId);
  const schedule = dateStr ? scheduleForOffering(offering, dateStr) : undefined;
  const svc = schedule?.services.find((s) => s.id === serviceId);
  const v = svc?.turnMinutes ?? config.turnMinutes ?? DEFAULT_TURN_MINUTES;
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : DEFAULT_TURN_MINUTES;
}

/** Half-open interval overlap: [aStart, aStart+aTurn) ∩ [bStart, bStart+bTurn). */
export function turnsOverlap(
  aStart: number,
  aTurn: number,
  bStart: number,
  bTurn: number,
): boolean {
  return aStart < bStart + bTurn && bStart < aStart + aTurn;
}

/**
 * Covers occupying capacity for a candidate slot. Uses reservation/service
 * duration windows, not just identical start times, so a 12:00 booking with a
 * 120-minute turn also consumes capacity for a 13:00 candidate.
 */
function bookedCoversForSlot(
  config: AvailabilityConfig,
  reservations: Reservation[],
  date: string,
  time: string,
  offeringId: OfferingId,
  serviceId: ServiceId,
  candidateTurnMinutes: number,
): number {
  const candidateStart = toMinutes(time);
  return reservations
    .filter((r) => {
      if (
        r.date !== date ||
        offeringOf(r.offering) !== offeringId ||
        !ACTIVE_STATUSES.includes(r.status)
      ) {
        return false;
      }
      const existingStart = toMinutes(r.time);
      const existingTurn = r.durationMinsOverride ?? turnMinutesFor(config, r.offering, r.service, r.date);
      return turnsOverlap(existingStart, existingTurn, candidateStart, candidateTurnMinutes);
    })
    .reduce((sum, r) => sum + r.partySize, 0);
}

/* ---------- public availability views ---------- */

export function getDayAvailability(
  config: AvailabilityConfig,
  reservations: Reservation[],
  dateStr: string,
  offeringId?: OfferingId,
  tables?: RestaurantTable[],
): DayAvailability {
  const offering = getOffering(config, offeringId);
  const resolvedId = offering.id;
  const now = nowInTz(config.timezone);
  const dayPast = dateStr < now.dateStr;
  const closed = isClosed(config, dateStr, resolvedId);
  const beyondWindow = dateStr > addDays(now.dateStr, config.bookingWindowDays);

  if (closed || dayPast || beyondWindow) {
    return { date: dateStr, offering: resolvedId, closed, past: dayPast, full: false, services: [] };
  }

  const blocked = new Set(offering.blockedSlots[dateStr] ?? []);
  const schedule = scheduleForOffering(offering, dateStr);
  const services = schedule.services.map((w) => ({
    id: w.id,
    label: w.label,
    slots: generateSlots(w).map((time) => {
      const capacity = serviceSlotCapacity(w, resolvedId, tables);
      const candidateTurn = turnMinutesFor(config, resolvedId, w.id, dateStr);
      const booked = bookedCoversForSlot(config, reservations, dateStr, time, resolvedId, w.id, candidateTurn);
      const remaining = Math.max(0, capacity - booked);
      const tooSoon = dateStr === now.dateStr && toMinutes(time) < now.minutes + config.leadMinutes;
      const disabled = isServiceDisabled(config, dateStr, resolvedId, w.id);
      const available = !disabled && !blocked.has(time) && !tooSoon && remaining >= config.minPartySize;
      return { time, capacity, booked, remaining, available };
    }),
  }));

  const full = services.every((s) => s.slots.every((sl) => !sl.available));
  return { date: dateStr, offering: resolvedId, closed: false, past: false, full, services };
}

/** Day status for a single offering (no past/window handling — caller does that). */
function offeringDayStatus(
  config: AvailabilityConfig,
  reservations: Reservation[],
  date: string,
  offeringId: OfferingId,
  tables?: RestaurantTable[],
): "open" | "closed" | "full" {
  if (isClosed(config, date, offeringId)) return "closed";
  return getDayAvailability(config, reservations, date, offeringId, tables).full ? "full" : "open";
}

export function getMonthAvailability(
  config: AvailabilityConfig,
  reservations: Reservation[],
  year: number,
  month: number, // 1-12
  offeringId?: OfferingId,
  tables?: RestaurantTable[],
): MonthDay[] {
  const now = nowInTz(config.timezone);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // When no offering is specified, aggregate across all of them: a day is
  // "open" if ANY offering is open, "full" if all non-closed offerings are
  // full, "closed" only if every offering is closed.
  const ids = offeringId
    ? [getOffering(config, offeringId).id]
    : getOfferings(config).map((o) => o.id);
  const out: MonthDay[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${pad(month)}-${pad(day)}`;
    let status: MonthDay["status"];
    if (date < now.dateStr) status = "past";
    else if (date > addDays(now.dateStr, config.bookingWindowDays)) status = "closed";
    else {
      const statuses = ids.map((id) => offeringDayStatus(config, reservations, date, id, tables));
      if (statuses.some((s) => s === "open")) status = "open";
      else if (statuses.some((s) => s === "full")) status = "full";
      else status = "closed";
    }
    out.push({ date, status });
  }
  return out;
}

/* ---------- booking validation (server-side source of truth) ---------- */

export interface BookCheck {
  ok: boolean;
  error?: string;
}

/** Strip non-digits and compare last 9 to normalise country-code variations. */
export function normalizePhone(phone: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : digits;
}

export function normalizeEmail(email: string): string {
  return (email ?? "").trim().toLowerCase();
}

export function canBook(
  config: AvailabilityConfig,
  reservations: Reservation[],
  input: NewReservationInput,
  tables?: RestaurantTable[],
): BookCheck {
  if (!isValidDate(input.date)) return { ok: false, error: "Invalid date." };
  if (!/^\d{2}:\d{2}$/.test(input.time)) return { ok: false, error: "Invalid time." };
  if (!input.name?.trim()) return { ok: false, error: "Name is required." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email || ""))
    return { ok: false, error: "A valid email is required." };
  const phoneDigits = (input.phone ?? "").replace(/\D/g, "");
  if (phoneDigits.length < 6)
    return { ok: false, error: "A valid phone number is required." };
  if (!Number.isInteger(input.partySize) || input.partySize < config.minPartySize)
    return { ok: false, error: `Party size must be at least ${config.minPartySize}.` };
  if (input.partySize > config.maxPartySize)
    return { ok: false, error: `For parties over ${config.maxPartySize}, please call us.` };

  const offering = getOffering(config, input.offering);
  const offeringId = offering.id;
  // Reject an unknown offering id rather than silently falling back to the
  // primary: otherwise a booking would be validated against "main" capacity but
  // persisted under the bogus id (invisible to future capacity checks → an
  // overbooking vector). offeringOf coalesces only blank/missing → "main".
  if (offeringOf(input.offering) !== offeringId) {
    return { ok: false, error: "That offering is not available." };
  }

  const now = nowInTz(config.timezone);
  if (input.date < now.dateStr) return { ok: false, error: "That date has passed." };
  if (input.date > addDays(now.dateStr, config.bookingWindowDays))
    return { ok: false, error: "That date is too far ahead to book." };
  if (isClosed(config, input.date, offeringId))
    return { ok: false, error: "We are closed on that date." };

  const schedule = scheduleForOffering(offering, input.date);
  const svc = schedule.services.find((s) => s.id === input.service);
  if (!svc) return { ok: false, error: "That service is not available on this date." };
  if (isServiceDisabled(config, input.date, offeringId, svc.id))
    return { ok: false, error: "That service is no longer taking online bookings today." };
  if (!generateSlots(svc).includes(input.time))
    return { ok: false, error: "That time is not a valid slot." };
  if ((offering.blockedSlots[input.date] ?? []).includes(input.time))
    return { ok: false, error: "That time is no longer available." };
  if (input.date === now.dateStr && toMinutes(input.time) < now.minutes + config.leadMinutes)
    return { ok: false, error: "That time is too soon — please pick a later slot." };

  const candidateTurn = turnMinutesFor(config, offeringId, svc.id, input.date);
  const booked = bookedCoversForSlot(config, reservations, input.date, input.time, offeringId, svc.id, candidateTurn);
  const capacity = serviceSlotCapacity(svc, offeringId, tables);
  const remaining = capacity - booked;
  if (input.partySize > remaining) {
    if (remaining <= 0)
      return { ok: false, error: "That time is fully booked. Please choose another slot." };
    return {
      ok: false,
      error: `Only ${remaining} cover${remaining === 1 ? "" : "s"} left at that time. Please reduce your party size or choose a different slot.`,
    };
  }

  return { ok: true };
}
