import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getOfferings,
  getOffering,
  offeringOf,
  offeringServiceMap,
  isMultiOffering,
} from "@/lib/reservations/offerings";
import { sanitizeConfig } from "@/lib/reservations/sanitize-config";
import { canBook, getDayAvailability, getMonthAvailability } from "@/lib/reservations/availability";
import {
  type AvailabilityConfig,
  DEFAULT_OFFERING_ID,
  type NewReservationInput,
  type Offering,
  type Reservation,
} from "@/lib/reservations/types";
import { makeConfig, lunchService, openDay, closedDay } from "./helpers/config";

const NOW = "2026-06-11T10:00:00Z"; // Thursday, 10:00 UTC

function offering(id: string, label: string, capacity = 10): Offering {
  const weekly: Offering["weekly"] = {};
  for (let d = 0; d < 7; d++) {
    weekly[d] = { closed: false, services: [lunchService({ capacity })] };
  }
  return { id, label, weekly, dateOverrides: {}, blockedSlots: {} };
}

function res(over: Partial<Reservation> = {}): Reservation {
  return {
    id: Math.random().toString(36).slice(2),
    date: "2026-06-11",
    time: "13:00",
    offering: "main",
    service: "lunch",
    partySize: 2,
    name: "A",
    email: "a@b.com",
    phone: "123456789",
    status: "confirmed",
    source: "web",
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function bookInput(over: Partial<NewReservationInput> = {}): NewReservationInput {
  return {
    date: "2026-06-11",
    time: "13:00",
    service: "lunch",
    partySize: 2,
    name: "Guest",
    email: "g@x.io",
    phone: "123456789",
    ...over,
  };
}

describe("offerings normalization", () => {
  it("synthesizes a single 'main' offering from a legacy config", () => {
    const config = makeConfig();
    const offs = getOfferings(config, "Osteria");
    expect(offs).toHaveLength(1);
    expect(offs[0].id).toBe(DEFAULT_OFFERING_ID);
    expect(offs[0].label).toBe("Osteria");
    expect(offs[0].weekly).toBe(config.weekly); // references the top-level schedule
    expect(isMultiOffering(config)).toBe(false);
  });

  it("returns the explicit offerings array when present", () => {
    const config = makeConfig({ offerings: [offering("main", "Restaurant"), offering("bar", "Cocktails")] });
    expect(getOfferings(config)).toHaveLength(2);
    expect(isMultiOffering(config)).toBe(true);
  });

  it("getOffering coalesces missing/empty/unknown ids to the primary offering", () => {
    const config = makeConfig({ offerings: [offering("main", "Restaurant"), offering("bar", "Cocktails")] });
    expect(getOffering(config).id).toBe("main");
    expect(getOffering(config, "").id).toBe("main");
    expect(getOffering(config, null).id).toBe("main");
    expect(getOffering(config, "nope").id).toBe("main");
    expect(getOffering(config, "bar").id).toBe("bar");
  });

  it("forces the primary offering id to 'main' even if a stored config says otherwise (read-time defense)", () => {
    // Simulates a config written by a path that bypassed sanitizeConfig.
    const config = makeConfig({ offerings: [offering("legacy", "Restaurant"), offering("bar", "Cocktails")] });
    const offs = getOfferings(config);
    expect(offs[0].id).toBe(DEFAULT_OFFERING_ID);
    expect(offs[0].label).toBe("Restaurant"); // label preserved
    expect(offs[1].id).toBe("bar");
  });

  it("offeringOf normalizes blanks to 'main'", () => {
    expect(offeringOf(undefined)).toBe("main");
    expect(offeringOf("")).toBe("main");
    expect(offeringOf("sushi")).toBe("sushi");
  });

  it("offeringServiceMap groups services per offering", () => {
    const config = makeConfig({ offerings: [offering("main", "Restaurant"), offering("bar", "Cocktails")] });
    const map = offeringServiceMap(config);
    expect(map.map((o) => o.id)).toEqual(["main", "bar"]);
    expect(map[0].services).toEqual([{ id: "lunch", label: "Lunch", labelEn: "Lunch", labelIt: "Pranzo" }]);
  });
});

describe("sanitizeConfig — offerings", () => {
  it("legacy config gains a canonical offerings array with primary id 'main'", () => {
    const out = sanitizeConfig(makeConfig());
    expect(out.offerings).toBeTruthy();
    expect(out.offerings![0].id).toBe(DEFAULT_OFFERING_ID);
    // top-level mirrors offerings[0]
    expect(out.weekly).toEqual(out.offerings![0].weekly);
  });

  it("is idempotent and never renames/duplicates the primary", () => {
    const once = sanitizeConfig(makeConfig());
    const twice = sanitizeConfig(once);
    expect(twice).toEqual(once);
    expect(twice.offerings!.filter((o) => o.id === "main")).toHaveLength(1);
  });

  it("forces index-0 id to 'main' even if the input names it otherwise", () => {
    const out = sanitizeConfig(makeConfig({ offerings: [offering("dining", "Dining"), offering("bar", "Cocktails")] }));
    expect(out.offerings![0].id).toBe("main");
    expect(out.offerings![1].id).toBe("bar");
  });

  it("dedupes colliding offering ids", () => {
    const out = sanitizeConfig(
      makeConfig({ offerings: [offering("main", "A"), offering("bar", "B"), offering("bar", "C")] }),
    );
    const ids = out.offerings!.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length); // all unique
  });

  it("caps the number of offerings", () => {
    const many = Array.from({ length: 30 }, (_, i) => offering(`o${i}`, `O${i}`));
    const out = sanitizeConfig(makeConfig({ offerings: many }));
    expect(out.offerings!.length).toBeLessThanOrEqual(12);
  });

  it("falls back to a default label when an offering name is blank/whitespace", () => {
    const a = offering("main", "");
    const b = offering("bar", "   ");
    const out = sanitizeConfig(makeConfig({ offerings: [a, b] }));
    expect(out.offerings![0].label).toBe("Dining");
    expect(out.offerings![1].label).toBe("Offering 2");
  });
});

describe("availability — single-offering unchanged", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });
  afterEach(() => vi.useRealTimers());

  it("omitting offeringId is identical to passing 'main'", () => {
    const config = makeConfig();
    const reservations = [res({ time: "13:00", partySize: 4 })];
    const a = getDayAvailability(config, reservations, "2026-06-11");
    const b = getDayAvailability(config, reservations, "2026-06-11", "main");
    expect(a).toEqual(b);
  });

  it("counts legacy reservations (offering defaulted) against 'main'", () => {
    const config = makeConfig({ weekly: weeklyWith(lunchService({ capacity: 10 })) });
    // a reservation whose offering is missing must still consume 'main' capacity
    const legacy = res({ time: "13:00", partySize: 6 });
    delete (legacy as Partial<Reservation>).offering;
    const day = getDayAvailability(config, [legacy], "2026-06-11", "main");
    const slot = day.services[0].slots.find((s) => s.time === "13:00")!;
    expect(slot.booked).toBe(6);
    expect(slot.remaining).toBe(4);
  });
});

describe("availability — multi-offering capacity isolation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });
  afterEach(() => vi.useRealTimers());

  const config = (): AvailabilityConfig =>
    makeConfig({ offerings: [offering("main", "Restaurant", 10), offering("bar", "Cocktails", 10)] });

  it("a booking in one offering does not consume another offering's capacity", () => {
    const reservations = [res({ offering: "main", time: "13:00", partySize: 10 })];
    const mainDay = getDayAvailability(config(), reservations, "2026-06-11", "main");
    const barDay = getDayAvailability(config(), reservations, "2026-06-11", "bar");
    expect(mainDay.services[0].slots.find((s) => s.time === "13:00")!.remaining).toBe(0);
    expect(barDay.services[0].slots.find((s) => s.time === "13:00")!.remaining).toBe(10);
  });

  it("canBook rejects the full offering but accepts the other", () => {
    const reservations = [res({ offering: "main", time: "13:00", partySize: 10 })];
    const full = canBook(config(), reservations, bookInput({ offering: "main", time: "13:00", partySize: 1 }));
    const other = canBook(config(), reservations, bookInput({ offering: "bar", time: "13:00", partySize: 1 }));
    expect(full.ok).toBe(false);
    expect(other.ok).toBe(true);
  });

  it("canBook rejects an unknown offering id (no silent fallback to 'main')", () => {
    const check = canBook(config(), [], bookInput({ offering: "ghost", time: "13:00", partySize: 1 }));
    expect(check.ok).toBe(false);
    expect(check.error).toMatch(/offering is not available/i);
  });

  it("canBook still accepts an omitted offering (legacy payload → 'main')", () => {
    const check = canBook(config(), [], bookInput({ time: "13:00", partySize: 2 }));
    expect(check.ok).toBe(true);
  });

  it("month aggregation: a day open in any offering is 'open'", () => {
    // main fully booked at its only slot, bar wide open
    const offMain = offering("main", "Restaurant", 2);
    // single-slot day so filling it makes the offering 'full'
    offMain.weekly = weeklyWith(lunchService({ start: "13:00", end: "13:00", capacity: 2 }));
    const offBar = offering("bar", "Cocktails", 10);
    const cfg = makeConfig({ offerings: [offMain, offBar] });
    const reservations = [res({ offering: "main", time: "13:00", partySize: 2 })];
    const days = getMonthAvailability(cfg, reservations, 2026, 6);
    const d = days.find((x) => x.date === "2026-06-11")!;
    expect(d.status).toBe("open"); // bar still open
    // and scoped to 'main' alone it's full
    const mainOnly = getMonthAvailability(cfg, reservations, 2026, 6, "main").find((x) => x.date === "2026-06-11")!;
    expect(mainOnly.status).toBe("full");
  });
});

function weeklyWith(...services: ReturnType<typeof lunchService>[]): AvailabilityConfig["weekly"] {
  const weekly: AvailabilityConfig["weekly"] = {};
  for (let d = 0; d < 7; d++) weekly[d] = { closed: false, services };
  return weekly;
}

void closedDay;
void openDay;
