import { describe, expect, it } from "vitest";
import {
  clamp,
  isDate,
  isTime,
  sanitizeConfig,
  sanitizeDay,
  sanitizeService,
} from "@/lib/reservations/sanitize-config";

describe("validators", () => {
  it("isTime accepts HH:MM 24h only", () => {
    expect(isTime("00:00")).toBe(true);
    expect(isTime("23:59")).toBe(true);
    expect(isTime("24:00")).toBe(false);
    expect(isTime("12:60")).toBe(false);
    expect(isTime("9:00")).toBe(false);
    expect(isTime(900)).toBe(false);
  });
  it("isDate accepts YYYY-MM-DD shape", () => {
    expect(isDate("2026-06-11")).toBe(true);
    expect(isDate("2026-6-1")).toBe(false);
    expect(isDate("nope")).toBe(false);
  });
  it("clamp bounds and falls back on non-numbers", () => {
    expect(clamp(5, 1, 10, 3)).toBe(5);
    expect(clamp(-5, 1, 10, 3)).toBe(1);
    expect(clamp(50, 1, 10, 3)).toBe(10);
    expect(clamp("x", 1, 10, 3)).toBe(3);
    expect(clamp(5.9, 1, 10, 3)).toBe(5); // truncates
  });
});

describe("sanitizeService", () => {
  it("clamps numbers and defaults invalid times/strings", () => {
    const s = sanitizeService({ interval: 9999, capacity: -10, start: "bad", end: "25:00" }, 2);
    expect(s.interval).toBe(240);
    expect(s.capacity).toBe(0);
    expect(s.start).toBe("12:00");
    expect(s.end).toBe("22:00");
    expect(s.id).toBe("service-2");
    expect(s.label).toBe("Service");
  });
  it("keeps valid values and truncates long strings", () => {
    const s = sanitizeService({ id: "x".repeat(80), label: "y".repeat(80), start: "10:00", end: "11:30", interval: 15, capacity: 50 }, 0);
    expect(s.id).toHaveLength(40);
    expect(s.label).toHaveLength(60);
    expect(s.start).toBe("10:00");
    expect(s.interval).toBe(15);
  });
  it("omits turnMinutes unless explicitly set, and clamps when present", () => {
    expect(sanitizeService({ interval: 30, capacity: 10 }, 0).turnMinutes).toBeUndefined();
    expect(sanitizeService({ interval: 30, capacity: 10, turnMinutes: 90 }, 0).turnMinutes).toBe(90);
    expect(sanitizeService({ interval: 30, capacity: 10, turnMinutes: 5 }, 0).turnMinutes).toBe(15); // clamped up
    expect(sanitizeService({ interval: 30, capacity: 10, turnMinutes: 99999 }, 0).turnMinutes).toBe(1440); // clamped down
  });
});

describe("sanitizeDay", () => {
  it("coerces closed and caps services at 8", () => {
    const services = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}` }));
    const day = sanitizeDay({ closed: 1 as unknown as boolean, services } as Parameters<typeof sanitizeDay>[0]);
    expect(day.closed).toBe(true);
    expect(day.services).toHaveLength(8);
  });
  it("handles missing/!array services", () => {
    expect(sanitizeDay(undefined)).toEqual({ closed: false, services: [] });
    expect(sanitizeDay({ services: "x" as unknown as [] }).services).toEqual([]);
  });
});

describe("sanitizeConfig", () => {
  it("always fills all 7 weekdays", () => {
    const cfg = sanitizeConfig({ weekly: {} });
    expect(Object.keys(cfg.weekly).sort()).toEqual(["0", "1", "2", "3", "4", "5", "6"]);
  });
  it("clamps booking rules and keeps max >= min", () => {
    const cfg = sanitizeConfig({ minPartySize: 5, maxPartySize: 2, bookingWindowDays: 9999, leadMinutes: -10 });
    expect(cfg.minPartySize).toBe(5);
    expect(cfg.maxPartySize).toBe(5); // raised to min
    expect(cfg.bookingWindowDays).toBe(730);
    expect(cfg.leadMinutes).toBe(0);
  });
  it("defaults timezone when blank", () => {
    expect(sanitizeConfig({ timezone: "" }).timezone).toBe("Europe/Rome");
    expect(sanitizeConfig({ timezone: "UTC" }).timezone).toBe("UTC");
  });
  it("filters non-date strings and dedupes closures (shape-level)", () => {
    const cfg = sanitizeConfig({ closures: ["2026-06-11", "2026-06-11", "nonsense"] });
    expect(cfg.closures).toEqual(["2026-06-11"]);
  });
  it("validates blockedSlots keys, times, dedupes, drops empties", () => {
    const cfg = sanitizeConfig({
      blockedSlots: {
        "2026-06-11": ["13:00", "13:00", "bad"],
        "bad-date": ["12:00"],
        "2026-06-12": ["nope"],
      } as unknown as Record<string, string[]>,
    });
    expect(cfg.blockedSlots["2026-06-11"]).toEqual(["13:00"]);
    expect(cfg.blockedSlots["bad-date"]).toBeUndefined();
    expect(cfg.blockedSlots["2026-06-12"]).toBeUndefined();
  });
  it("sanitizes dateOverrides and drops invalid date keys", () => {
    const cfg = sanitizeConfig({
      dateOverrides: {
        "2026-12-25": { closed: false, services: [{ id: "gala", interval: 1, capacity: 5, start: "19:00", end: "21:00", label: "Gala" }] },
        "bad": { closed: true, services: [] },
      } as unknown as Record<string, never>,
    });
    expect(cfg.dateOverrides["2026-12-25"].services[0].interval).toBe(5); // clamped up from 1
    expect(cfg.dateOverrides["bad"]).toBeUndefined();
  });
  it("omits config turnMinutes unless set, and clamps when present", () => {
    expect(sanitizeConfig({}).turnMinutes).toBeUndefined();
    expect(sanitizeConfig({ turnMinutes: 90 }).turnMinutes).toBe(90);
    expect(sanitizeConfig({ turnMinutes: 5 }).turnMinutes).toBe(15); // clamped up
    expect(sanitizeConfig({ turnMinutes: 99999 }).turnMinutes).toBe(1440); // clamped down
  });
  it("provides defaults for an empty config", () => {
    const cfg = sanitizeConfig({});
    expect(cfg.bookingWindowDays).toBe(60);
    expect(cfg.minPartySize).toBe(1);
    expect(cfg.maxPartySize).toBe(12);
    expect(cfg.closures).toEqual([]);
    expect(cfg.blockedSlots).toEqual({});
    expect(cfg.dateOverrides).toEqual({});
  });
});
