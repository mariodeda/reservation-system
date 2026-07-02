import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addDays,
  canBook,
  generateSlots,
  getDayAvailability,
  getMonthAvailability,
  isClosed,
  nowInTz,
  scheduleForDate,
  toMinutes,
} from "@/lib/reservations/availability";
import type { NewReservationInput, Reservation, RestaurantTable } from "@/lib/reservations/types";
import { closedDay, lunchService, makeConfig, openDay } from "./helpers/config";

const NOW = "2026-06-11T10:00:00Z"; // Thursday, 10:00 UTC

function res(over: Partial<Reservation> = {}): Reservation {
  return {
    id: "id",
    date: "2026-06-11",
    time: "13:00",
    offering: "main",
    service: "lunch",
    partySize: 2,
    name: "A",
    email: "a@b.com",
    phone: "1",
    status: "confirmed",
    source: "web",
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function table(over: Partial<RestaurantTable> = {}): RestaurantTable {
  return {
    id: "table-1",
    offering: null,
    label: "1",
    capacity: 4,
    minParty: 1,
    sortOrder: 0,
    joinable: false,
    active: true,
    createdAt: NOW,
    ...over,
  };
}

describe("toMinutes", () => {
  it("converts HH:MM to minutes-of-day", () => {
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("12:30")).toBe(750);
    expect(toMinutes("23:59")).toBe(1439);
  });
});

describe("generateSlots", () => {
  it("generates inclusive slots at the interval", () => {
    expect(generateSlots(lunchService())).toEqual(["12:00", "13:00", "14:00"]);
  });
  it("respects sub-hour intervals", () => {
    expect(generateSlots(lunchService({ interval: 30 }))).toEqual([
      "12:00", "12:30", "13:00", "13:30", "14:00",
    ]);
  });
  it("returns [] for non-positive interval", () => {
    expect(generateSlots(lunchService({ interval: 0 }))).toEqual([]);
    expect(generateSlots(lunchService({ interval: -30 }))).toEqual([]);
  });
  it("returns [] for non-numeric interval", () => {
    expect(generateSlots(lunchService({ interval: NaN }))).toEqual([]);
  });
  it("returns [] when start is after end", () => {
    expect(generateSlots(lunchService({ start: "14:00", end: "12:00" }))).toEqual([]);
  });
  it("returns [] for malformed times", () => {
    expect(generateSlots(lunchService({ start: "xx:yy" }))).toEqual([]);
  });
  it("caps run-away configs at 288 slots", () => {
    const slots = generateSlots(lunchService({ start: "00:00", end: "23:59", interval: 1 }));
    expect(slots.length).toBe(288);
  });
});

describe("addDays", () => {
  it("adds and subtracts days", () => {
    expect(addDays("2026-06-11", 1)).toBe("2026-06-12");
    expect(addDays("2026-06-11", -1)).toBe("2026-06-10");
  });
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-06-30", 1)).toBe("2026-07-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("handles leap years", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });
});

describe("nowInTz", () => {
  afterEach(() => vi.useRealTimers());
  it("reports date and minute-of-day in UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    expect(nowInTz("UTC")).toEqual({ dateStr: "2026-06-11", minutes: 600 });
  });
  it("shifts into the configured timezone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW)); // 10:00 UTC -> 12:00 Europe/Rome (summer, +2)
    expect(nowInTz("Europe/Rome")).toEqual({ dateStr: "2026-06-11", minutes: 720 });
  });
  it("rolls over the date across midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-11T23:30:00Z")); // -> 01:30 next day in Rome
    expect(nowInTz("Europe/Rome")).toEqual({ dateStr: "2026-06-12", minutes: 90 });
  });
  it("normalises hour 24 to 0 at midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-11T00:00:00Z"));
    expect(nowInTz("UTC").minutes).toBe(0);
  });
});

describe("scheduleForDate", () => {
  it("prefers a date override", () => {
    const special = openDay([lunchService({ id: "gala", label: "Gala" })]);
    const cfg = makeConfig({ dateOverrides: { "2026-06-11": special } });
    expect(scheduleForDate(cfg, "2026-06-11")).toBe(special);
  });
  it("falls back to the weekly schedule", () => {
    const cfg = makeConfig();
    const wd = new Date("2026-06-11T00:00:00Z").getUTCDay();
    expect(scheduleForDate(cfg, "2026-06-11")).toBe(cfg.weekly[wd]);
  });
  it("returns closed when the weekday is undefined", () => {
    const cfg = makeConfig();
    for (let d = 0; d < 7; d++) delete cfg.weekly[d];
    expect(scheduleForDate(cfg, "2026-06-11")).toEqual({ closed: true, services: [] });
  });
});

describe("isClosed", () => {
  it("is closed on a listed closure date", () => {
    expect(isClosed(makeConfig({ closures: ["2026-06-11"] }), "2026-06-11")).toBe(true);
  });
  it("is closed when the day is flagged closed", () => {
    const cfg = makeConfig({ dateOverrides: { "2026-06-11": closedDay } });
    expect(isClosed(cfg, "2026-06-11")).toBe(true);
  });
  it("is closed when the day has no services", () => {
    const cfg = makeConfig({ dateOverrides: { "2026-06-11": { closed: false, services: [] } } });
    expect(isClosed(cfg, "2026-06-11")).toBe(true);
  });
  it("is open on a normal service day", () => {
    expect(isClosed(makeConfig(), "2026-06-11")).toBe(false);
  });
});

describe("getDayAvailability", () => {
  afterEach(() => vi.useRealTimers());
  function setup() {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  }

  it("returns open slots with full capacity when nothing is booked", () => {
    setup();
    const day = getDayAvailability(makeConfig(), [], "2026-06-12");
    expect(day.closed).toBe(false);
    expect(day.services[0].slots).toHaveLength(3);
    expect(day.services[0].slots.every((s) => s.available && s.remaining === 10)).toBe(true);
  });

  it("counts active reservations against capacity, ignores cancelled/no_show", () => {
    setup();
    const reservations = [
      res({ date: "2026-06-12", time: "13:00", partySize: 4, status: "confirmed" }),
      res({ date: "2026-06-12", time: "13:00", partySize: 100, status: "cancelled" }),
      res({ date: "2026-06-12", time: "13:00", partySize: 100, status: "no_show" }),
    ];
    const day = getDayAvailability(makeConfig(), reservations, "2026-06-12");
    const slot = day.services[0].slots.find((s) => s.time === "13:00")!;
    expect(slot.booked).toBe(4);
    expect(slot.remaining).toBe(6);
    expect(slot.available).toBe(true);
  });

  it("marks a slot unavailable and the day full when capacity is exhausted", () => {
    setup();
    const cfg = makeConfig({
      weekly: weeklyAll(openDay([lunchService({ start: "12:00", end: "12:00", capacity: 4 })])),
    });
    const day = getDayAvailability(cfg, [res({ date: "2026-06-12", time: "12:00", partySize: 4 })], "2026-06-12");
    expect(day.services[0].slots[0].available).toBe(false);
    expect(day.full).toBe(true);
  });

  it("derives slot capacity from active tables when tables exist", () => {
    setup();
    const cfg = makeConfig({
      weekly: weeklyAll(openDay([lunchService({ start: "12:00", end: "12:00", capacity: 99 })])),
    });
    const day = getDayAvailability(cfg, [], "2026-06-12", undefined, [
      table({ id: "a", capacity: 4 }),
      table({ id: "b", capacity: 6 }),
      table({ id: "inactive", capacity: 100, active: false }),
    ]);
    expect(day.services[0].slots[0]).toMatchObject({
      capacity: 10,
      remaining: 10,
      available: true,
    });
  });

  it("uses only tables available to the requested offering", () => {
    setup();
    const cfg = makeConfig({
      offerings: [
        {
          id: "main",
          label: "Dining",
          weekly: weeklyAll(openDay([lunchService({ start: "12:00", end: "12:00", capacity: 99 })])),
          dateOverrides: {},
          blockedSlots: {},
        },
        {
          id: "bar",
          label: "Bar",
          weekly: weeklyAll(openDay([lunchService({ start: "12:00", end: "12:00", capacity: 99 })])),
          dateOverrides: {},
          blockedSlots: {},
        },
      ],
    });
    const tables = [
      table({ id: "shared", capacity: 2, offering: null }),
      table({ id: "main-only", capacity: 4, offering: "main" }),
      table({ id: "bar-only", capacity: 6, offering: "bar" }),
    ];
    const main = getDayAvailability(cfg, [], "2026-06-12", "main", tables);
    const bar = getDayAvailability(cfg, [], "2026-06-12", "bar", tables);
    expect(main.services[0].slots[0].capacity).toBe(6);
    expect(bar.services[0].slots[0].capacity).toBe(8);
  });

  it("does not advertise a slot when remaining covers are below the minimum party size", () => {
    setup();
    const cfg = makeConfig({
      minPartySize: 2,
      weekly: weeklyAll(openDay([lunchService({ start: "12:00", end: "12:00", capacity: 5 })])),
    });
    const day = getDayAvailability(cfg, [res({ date: "2026-06-12", time: "12:00", partySize: 4 })], "2026-06-12");
    expect(day.services[0].slots[0]).toMatchObject({
      booked: 4,
      remaining: 1,
      available: false,
    });
    expect(day.full).toBe(true);
  });

  it("respects blocked slots", () => {
    setup();
    const cfg = makeConfig({ blockedSlots: { "2026-06-12": ["13:00"] } });
    const day = getDayAvailability(cfg, [], "2026-06-12");
    expect(day.services[0].slots.find((s) => s.time === "13:00")!.available).toBe(false);
    expect(day.services[0].slots.find((s) => s.time === "12:00")!.available).toBe(true);
  });

  it("marks every slot in a manually disabled service unavailable", () => {
    setup();
    const cfg = makeConfig({ disabledServices: { "2026-06-12": { main: ["lunch"] } } });
    const day = getDayAvailability(cfg, [], "2026-06-12");
    expect(day.services[0].slots.every((s) => !s.available)).toBe(true);
    expect(day.full).toBe(true);
  });

  it("enforces lead time for same-day slots", () => {
    setup(); // now 10:00, lead 200min -> earliest bookable 13:20
    const cfg = makeConfig({ leadMinutes: 200 });
    const day = getDayAvailability(cfg, [], "2026-06-11");
    expect(day.services[0].slots.find((s) => s.time === "12:00")!.available).toBe(false);
    expect(day.services[0].slots.find((s) => s.time === "13:00")!.available).toBe(false);
    expect(day.services[0].slots.find((s) => s.time === "14:00")!.available).toBe(true);
  });

  it("returns past=true with no services for a past date", () => {
    setup();
    const day = getDayAvailability(makeConfig(), [], "2026-06-10");
    expect(day.past).toBe(true);
    expect(day.services).toEqual([]);
  });

  it("returns no services beyond the booking window", () => {
    setup();
    const cfg = makeConfig({ bookingWindowDays: 5 });
    const day = getDayAvailability(cfg, [], "2026-06-30");
    expect(day.services).toEqual([]);
  });

  it("applies date overrides", () => {
    setup();
    const cfg = makeConfig({
      dateOverrides: { "2026-06-12": openDay([lunchService({ id: "gala", label: "Gala", start: "19:00", end: "19:00" })]) },
    });
    const day = getDayAvailability(cfg, [], "2026-06-12");
    expect(day.services[0].label).toBe("Gala");
    expect(day.services[0].slots.map((s) => s.time)).toEqual(["19:00"]);
  });
});

describe("getMonthAvailability", () => {
  afterEach(() => vi.useRealTimers());
  it("classifies each day as past/closed/open and respects the window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const cfg = makeConfig({ bookingWindowDays: 10, closures: ["2026-06-15"] });
    const days = getMonthAvailability(cfg, [], 2026, 6);
    const byDate = Object.fromEntries(days.map((d) => [d.date, d.status]));
    expect(byDate["2026-06-10"]).toBe("past");
    expect(byDate["2026-06-12"]).toBe("open");
    expect(byDate["2026-06-15"]).toBe("closed"); // explicit closure
    expect(byDate["2026-06-30"]).toBe("closed"); // beyond 10-day window
    expect(days).toHaveLength(30);
  });
  it("marks a fully-booked day as full", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const cfg = makeConfig({
      weekly: weeklyAll(openDay([lunchService({ start: "12:00", end: "12:00", capacity: 2 })])),
    });
    const days = getMonthAvailability(cfg, [res({ date: "2026-06-12", time: "12:00", partySize: 2 })], 2026, 6);
    expect(days.find((d) => d.date === "2026-06-12")!.status).toBe("full");
  });

  it("marks a day full when every remaining slot is below the minimum party size", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const cfg = makeConfig({
      minPartySize: 2,
      weekly: weeklyAll(openDay([lunchService({ start: "12:00", end: "12:00", capacity: 5 })])),
    });
    const days = getMonthAvailability(cfg, [res({ date: "2026-06-12", time: "12:00", partySize: 4 })], 2026, 6);
    expect(days.find((d) => d.date === "2026-06-12")!.status).toBe("full");
  });
});

describe("canBook", () => {
  afterEach(() => vi.useRealTimers());
  function input(over: Partial<NewReservationInput> = {}): NewReservationInput {
    return {
      date: "2026-06-12",
      time: "13:00",
      service: "lunch",
      partySize: 2,
      name: "Guest",
      email: "guest@example.com",
      phone: "123456",
      ...over,
    };
  }
  function setup() {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  }

  it("accepts a valid booking", () => {
    setup();
    expect(canBook(makeConfig(), [], input())).toEqual({ ok: true });
  });
  it("rejects an invalid date", () => {
    setup();
    expect(canBook(makeConfig(), [], input({ date: "nope" })).ok).toBe(false);
  });
  it("rejects an invalid time", () => {
    setup();
    expect(canBook(makeConfig(), [], input({ time: "9am" })).ok).toBe(false);
  });
  it("requires a name", () => {
    setup();
    expect(canBook(makeConfig(), [], input({ name: "  " })).ok).toBe(false);
  });
  it("requires a valid email", () => {
    setup();
    expect(canBook(makeConfig(), [], input({ email: "bad" })).ok).toBe(false);
    expect(canBook(makeConfig(), [], input({ email: undefined as unknown as string })).ok).toBe(false);
  });
  it("enforces min and max party size", () => {
    setup();
    const cfg = makeConfig({ minPartySize: 2, maxPartySize: 8 });
    expect(canBook(cfg, [], input({ partySize: 1 })).ok).toBe(false);
    expect(canBook(cfg, [], input({ partySize: 9 })).ok).toBe(false);
    expect(canBook(cfg, [], input({ partySize: 2.5 })).ok).toBe(false);
  });
  it("rejects past and too-far-ahead dates", () => {
    setup();
    expect(canBook(makeConfig(), [], input({ date: "2026-06-10" })).ok).toBe(false);
    expect(canBook(makeConfig({ bookingWindowDays: 5 }), [], input({ date: "2026-06-30" })).ok).toBe(false);
  });
  it("rejects closed dates", () => {
    setup();
    expect(canBook(makeConfig({ closures: ["2026-06-12"] }), [], input()).ok).toBe(false);
  });
  it("rejects an unknown service", () => {
    setup();
    expect(canBook(makeConfig(), [], input({ service: "brunch" })).ok).toBe(false);
  });
  it("rejects a time that is not a generated slot", () => {
    setup();
    expect(canBook(makeConfig(), [], input({ time: "13:15" })).ok).toBe(false);
  });
  it("rejects a blocked slot", () => {
    setup();
    expect(canBook(makeConfig({ blockedSlots: { "2026-06-12": ["13:00"] } }), [], input()).ok).toBe(false);
  });
  it("rejects a manually disabled service", () => {
    setup();
    const check = canBook(makeConfig({ disabledServices: { "2026-06-12": { main: ["lunch"] } } }), [], input());
    expect(check.ok).toBe(false);
    expect(check.error).toMatch(/no longer taking online bookings/i);
  });
  it("rejects a same-day slot inside the lead window", () => {
    setup();
    expect(canBook(makeConfig({ leadMinutes: 200 }), [], input({ date: "2026-06-11", time: "12:00" })).ok).toBe(false);
  });
  it("rejects when the slot would exceed capacity", () => {
    setup();
    const cfg = makeConfig({ weekly: weeklyAll(openDay([lunchService({ capacity: 4 })])) });
    const existing = [res({ date: "2026-06-12", time: "13:00", partySize: 3 })];
    expect(canBook(cfg, existing, input({ partySize: 2 })).ok).toBe(false);
    expect(canBook(cfg, existing, input({ partySize: 1 })).ok).toBe(true);
  });

  it("validates booking capacity against active tables when tables exist", () => {
    setup();
    const cfg = makeConfig({ weekly: weeklyAll(openDay([lunchService({ capacity: 99 })])) });
    const existing = [res({ date: "2026-06-12", time: "13:00", partySize: 3 })];
    const tables = [table({ capacity: 4 })];
    expect(canBook(cfg, existing, input({ partySize: 2 }), tables).ok).toBe(false);
    expect(canBook(cfg, existing, input({ partySize: 1 }), tables).ok).toBe(true);
  });
});

function weeklyAll(day: ReturnType<typeof openDay>) {
  const weekly: Record<number, ReturnType<typeof openDay>> = {};
  for (let d = 0; d < 7; d++) weekly[d] = day;
  return weekly;
}
