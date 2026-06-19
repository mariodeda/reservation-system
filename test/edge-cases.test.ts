import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canBook,
  generateSlots,
  getDayAvailability,
  getMonthAvailability,
  normalizeEmail,
  normalizePhone,
  nowInTz,
} from "@/lib/reservations/availability";
import { createSession, verifySession } from "@/lib/reservations/auth";
import { hashPassword, templateSettings, verifyTenantLogin, type Tenant } from "@/lib/reservations/tenant";
import { buildEmailVars, renderTemplate, type EmailVars } from "@/lib/reservations/email";
import { sanitizeConfig } from "@/lib/reservations/sanitize-config";
import { clientIp } from "@/lib/reservations/rate-limit";
import type { NewReservationInput, Reservation } from "@/lib/reservations/types";
import { lunchService, makeConfig, openDay } from "./helpers/config";

const NOW = "2026-06-11T10:00:00Z"; // 10:00 UTC -> minutes 600

function res(over: Partial<Reservation> = {}): Reservation {
  return {
    id: "id", date: "2026-06-12", time: "13:00", offering: "main", service: "lunch", partySize: 2,
    name: "A", email: "a@b.com", phone: "1", status: "confirmed", source: "web",
    createdAt: NOW, updatedAt: NOW, ...over,
  };
}

/* ----------------------------- availability ----------------------------- */

describe("generateSlots edge cases", () => {
  it("includes the end only when a step lands exactly on it", () => {
    expect(generateSlots(lunchService({ start: "12:00", end: "12:45", interval: 30 }))).toEqual(["12:00", "12:30"]);
    expect(generateSlots(lunchService({ start: "12:00", end: "13:00", interval: 30 }))).toEqual(["12:00", "12:30", "13:00"]);
  });
  it("yields a single slot when the interval exceeds the window", () => {
    expect(generateSlots(lunchService({ start: "12:00", end: "12:15", interval: 30 }))).toEqual(["12:00"]);
  });
  it("floors fractional intervals", () => {
    expect(generateSlots(lunchService({ start: "12:00", end: "13:00", interval: 30.9 }))).toEqual(["12:00", "12:30", "13:00"]);
  });
  it("returns a single slot when start equals end", () => {
    expect(generateSlots(lunchService({ start: "12:00", end: "12:00" }))).toEqual(["12:00"]);
  });
});

describe("nowInTz across DST", () => {
  afterEach(() => vi.useRealTimers());
  it("uses the winter offset (+1) for Europe/Rome", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:00:00Z")); // CET = +1 -> 11:00
    expect(nowInTz("Europe/Rome")).toEqual({ dateStr: "2026-01-15", minutes: 660 });
  });
  it("uses the summer offset (+2) for Europe/Rome", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T10:00:00Z")); // CEST = +2 -> 12:00
    expect(nowInTz("Europe/Rome")).toEqual({ dateStr: "2026-07-15", minutes: 720 });
  });
});

describe("getDayAvailability multi-service & boundaries", () => {
  afterEach(() => vi.useRealTimers());
  const setup = () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  };

  it("is not full when one service still has space", () => {
    setup();
    const cfg = makeConfig({
      weekly: weeklyAll(openDay([
        lunchService({ id: "lunch", start: "12:00", end: "12:00", capacity: 4 }),
        lunchService({ id: "dinner", start: "19:00", end: "19:00", capacity: 10 }),
      ])),
    });
    const day = getDayAvailability(cfg, [res({ date: "2026-06-12", time: "12:00", partySize: 4 })], "2026-06-12");
    expect(day.services.find((s) => s.id === "lunch")!.slots[0].available).toBe(false);
    expect(day.services.find((s) => s.id === "dinner")!.slots[0].available).toBe(true);
    expect(day.full).toBe(false);
  });

  it("shares capacity across services that offer the same clock time", () => {
    setup();
    const cfg = makeConfig({
      weekly: weeklyAll(openDay([
        lunchService({ id: "a", start: "13:00", end: "13:00", capacity: 10 }),
        lunchService({ id: "b", start: "13:00", end: "13:00", capacity: 10 }),
      ])),
    });
    const day = getDayAvailability(cfg, [res({ date: "2026-06-12", time: "13:00", partySize: 6 })], "2026-06-12");
    // one booking at 13:00 counts against BOTH services (bookedCovers is date+time only)
    expect(day.services.find((s) => s.id === "a")!.slots[0].booked).toBe(6);
    expect(day.services.find((s) => s.id === "b")!.slots[0].booked).toBe(6);
  });

  it("treats a service that generates no slots as a vacuously-full service", () => {
    setup();
    const cfg = makeConfig({ weekly: weeklyAll(openDay([lunchService({ interval: 0 })])) });
    const day = getDayAvailability(cfg, [], "2026-06-12");
    expect(day.services[0].slots).toEqual([]);
    expect(day.full).toBe(true);
  });

  it("treats the lead-time threshold as inclusive (>= now+lead is bookable)", () => {
    setup(); // now 10:00 (600)
    const cfg = makeConfig({ leadMinutes: 60, weekly: weeklyAll(openDay([lunchService({ start: "11:00", end: "12:00", interval: 60 })])) });
    const day = getDayAvailability(cfg, [], "2026-06-11");
    expect(day.services[0].slots.find((s) => s.time === "11:00")!.available).toBe(true); // exactly at boundary
    const cfg2 = makeConfig({ leadMinutes: 61, weekly: weeklyAll(openDay([lunchService({ start: "11:00", end: "12:00", interval: 60 })])) });
    const day2 = getDayAvailability(cfg2, [], "2026-06-11");
    expect(day2.services[0].slots.find((s) => s.time === "11:00")!.available).toBe(false); // one minute inside
  });

  it("allows the last day of the booking window but not the day after", () => {
    setup();
    const cfg = makeConfig({ bookingWindowDays: 10 }); // window end = 2026-06-21
    expect(getDayAvailability(cfg, [], "2026-06-21").services.length).toBeGreaterThan(0);
    expect(getDayAvailability(cfg, [], "2026-06-22").services).toEqual([]);
  });
});

describe("getMonthAvailability day counts", () => {
  afterEach(() => vi.useRealTimers());
  it("returns the right number of days for short, long, leap and past months", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    expect(getMonthAvailability(makeConfig(), [], 2027, 2)).toHaveLength(28); // Feb non-leap
    expect(getMonthAvailability(makeConfig(), [], 2028, 2)).toHaveLength(29); // Feb leap
    const may = getMonthAvailability(makeConfig(), [], 2026, 5); // fully in the past
    expect(may).toHaveLength(31);
    expect(may.every((d) => d.status === "past")).toBe(true);
  });
});

describe("canBook capacity boundary", () => {
  afterEach(() => vi.useRealTimers());
  function input(over: Partial<NewReservationInput> = {}): NewReservationInput {
    return { date: "2026-06-12", time: "13:00", service: "lunch", partySize: 2, name: "G", email: "g@x.io", phone: "123456", ...over };
  }
  it("accepts a party that exactly fills remaining capacity, rejects one over", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const cfg = makeConfig({ weekly: weeklyAll(openDay([lunchService({ capacity: 10 })])) });
    const existing = [res({ date: "2026-06-12", time: "13:00", partySize: 8 })];
    expect(canBook(cfg, existing, input({ partySize: 2 })).ok).toBe(true);
    expect(canBook(cfg, existing, input({ partySize: 3 })).ok).toBe(false);
  });
});

/* --------------------------------- auth --------------------------------- */

describe("auth edge cases", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });
  it("tolerates a trailing extra segment (it is ignored; signature still binds payload)", async () => {
    vi.stubEnv("SESSION_SECRET", "s");
    const token = await createSession("default", "staff");
    // payload.sig.extra -> destructuring keeps payload+sig, so it still verifies.
    expect((await verifySession(`${token}.extra`))?.u).toBe("staff");
    // ...but a forged payload with any signature is still rejected.
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "attacker", exp: Date.now() + 1e6 }))
      .toString("base64").replace(/=+$/, "");
    expect(await verifySession(`${forged}.${sig}.extra`)).toBeNull();
  });
  it("round-trips a unicode username through the b64url codec", async () => {
    vi.stubEnv("SESSION_SECRET", "s");
    const token = await createSession("default", "José 🍝 日本語");
    expect((await verifySession(token))?.u).toBe("José 🍝 日本語");
  });
  it("rejects credentials of differing length without leaking via timing", () => {
    const t: Tenant = {
      id: "t1", slug: "t1", name: "T1", status: "active", publicKey: "pk_test",
      settings: templateSettings(), adminUsername: "staff",
      adminPasswordHash: hashPassword("longpassword"),
      createdAt: new Date(0).toISOString(),
    };
    expect(verifyTenantLogin(t, "staff", "short")).toBe(false);
    expect(verifyTenantLogin(t, "st", "longpassword")).toBe(false);
  });
});

/* -------------------------------- email --------------------------------- */

const baseVars: EmailVars = {
  guestName: "Jane", restaurantName: "O", date: "d", time: "t", service: "s",
  partySize: "2", occasion: "", notes: "", reference: "R", contactPhone: "p",
  contactEmail: "e", siteUrl: "u",
};

describe("renderTemplate edge cases", () => {
  it("leaves placeholders with non-word chars untouched", () => {
    expect(renderTemplate("a {{first-name}} b", baseVars)).toBe("a {{first-name}} b");
  });
  it("does not interpret $ sequences in substituted values", () => {
    expect(renderTemplate("hi {{guestName}}", { ...baseVars, guestName: "$& $1 $$" })).toBe("hi $& $1 $$");
  });
  it("handles an unterminated placeholder literally", () => {
    expect(renderTemplate("a {{guestName b", baseVars)).toBe("a {{guestName b");
  });
});

describe("buildEmailVars edge cases", () => {
  it("formats a leap day correctly", () => {
    const v = buildEmailVars({
      id: "x", date: "2024-02-29", time: "20:00", offering: "main", service: "dinner", partySize: 2,
      name: "N", email: "n@x.io", phone: "1", status: "confirmed", source: "web",
      createdAt: NOW, updatedAt: NOW,
    }, {
      id: "t1", slug: "t1", name: "T1", status: "active", publicKey: "pk_test",
      settings: templateSettings(), adminUsername: "staff",
      adminPasswordHash: hashPassword("x"),
      createdAt: new Date(0).toISOString(),
    });
    expect(v.date).toBe("Thursday, February 29, 2024");
  });
});

/* ----------------------------- sanitizeConfig ---------------------------- */

describe("sanitizeConfig extreme inputs", () => {
  it("falls back to defaults for Infinity/NaN numbers", () => {
    const cfg = sanitizeConfig({
      bookingWindowDays: Infinity,
      leadMinutes: NaN,
      weekly: { 0: { closed: false, services: [{ interval: Infinity, capacity: Infinity } as never] } },
    });
    expect(cfg.bookingWindowDays).toBe(60);
    expect(cfg.leadMinutes).toBe(0);
    expect(cfg.weekly[0].services[0].interval).toBe(30);
    expect(cfg.weekly[0].services[0].capacity).toBe(20);
  });
  it("ignores non-array closures and non-object collections", () => {
    const cfg = sanitizeConfig({
      closures: "2026-06-11" as unknown as string[],
      blockedSlots: [] as unknown as Record<string, string[]>,
      dateOverrides: 5 as unknown as Record<string, never>,
    });
    expect(cfg.closures).toEqual([]);
    expect(cfg.blockedSlots).toEqual({});
    expect(cfg.dateOverrides).toEqual({});
  });
  it("ignores weekday keys outside 0-6", () => {
    const cfg = sanitizeConfig({ weekly: { 7: { closed: false, services: [] }, 9: { closed: false, services: [] } } as never });
    expect(Object.keys(cfg.weekly).sort()).toEqual(["0", "1", "2", "3", "4", "5", "6"]);
  });
  it("caps closures at 1000 entries", () => {
    // 1100 sequential, guaranteed-distinct valid dates -> slice to 1000 after dedupe.
    const distinct = Array.from({ length: 1100 }, (_, i) =>
      new Date(Date.UTC(2000, 0, 1 + i)).toISOString().slice(0, 10),
    );
    expect(new Set(distinct).size).toBe(1100); // sanity: all distinct
    expect(sanitizeConfig({ closures: distinct }).closures.length).toBe(1000);
  });
});

/* ------------------------------ rate limit ------------------------------ */

describe("normalizeEmail", () => {
  it("lowercases and trims whitespace", () => {
    expect(normalizeEmail("  GUEST@EXAMPLE.COM  ")).toBe("guest@example.com");
    expect(normalizeEmail("Jane@X.IO")).toBe("jane@x.io");
  });
  it("returns empty string for empty input", () => {
    expect(normalizeEmail("")).toBe("");
  });
  it("leaves already-normalised email unchanged", () => {
    expect(normalizeEmail("a@b.com")).toBe("a@b.com");
  });
});

describe("normalizePhone", () => {
  it("strips non-digits and keeps the last 9", () => {
    expect(normalizePhone("+39 333 123 4567")).toBe("331234567");
    expect(normalizePhone("0039-333-1234567")).toBe("331234567");
  });
  it("returns all digits unchanged when fewer than 9", () => {
    expect(normalizePhone("12345")).toBe("12345");
    expect(normalizePhone("+1-800")).toBe("1800");
  });
  it("returns empty string for empty or digit-free input", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone("abc")).toBe("");
  });
  it("handles exactly 9 digits", () => {
    expect(normalizePhone("123456789")).toBe("123456789");
  });
});

describe("clientIp edge cases", () => {
  it("skips an empty x-forwarded-for and uses x-real-ip", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "", "x-real-ip": "9.9.9.9" } });
    expect(clientIp(req)).toBe("9.9.9.9");
  });
  it("trims whitespace around the first forwarded entry", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "  5.5.5.5  , 6.6.6.6" } });
    expect(clientIp(req)).toBe("5.5.5.5");
  });
});

function weeklyAll(day: ReturnType<typeof openDay>) {
  const weekly: Record<number, ReturnType<typeof openDay>> = {};
  for (let d = 0; d < 7; d++) weekly[d] = day;
  return weekly;
}
