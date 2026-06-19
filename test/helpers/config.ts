import type { AvailabilityConfig, DaySchedule, ServiceWindow } from "@/lib/reservations/types";

/** A simple open day: one lunch service 12:00–14:00, hourly, capacity 10. */
export function lunchService(over: Partial<ServiceWindow> = {}): ServiceWindow {
  return { id: "lunch", label: "Lunch", start: "12:00", end: "14:00", interval: 60, capacity: 10, ...over };
}

export function openDay(services: ServiceWindow[] = [lunchService()]): DaySchedule {
  return { closed: false, services };
}

export const closedDay: DaySchedule = { closed: true, services: [] };

/**
 * Config that is open every weekday with the given day schedule, timezone UTC
 * so date/weekday reasoning in tests is unambiguous.
 */
export function makeConfig(over: Partial<AvailabilityConfig> = {}): AvailabilityConfig {
  const weekly: AvailabilityConfig["weekly"] = {};
  for (let d = 0; d < 7; d++) weekly[d] = openDay();
  return {
    timezone: "UTC",
    bookingWindowDays: 60,
    minPartySize: 1,
    maxPartySize: 12,
    leadMinutes: 0,
    weekly,
    closures: [],
    dateOverrides: {},
    blockedSlots: {},
    ...over,
  };
}
