import { beforeEach, describe, expect, it } from "vitest";
import type { ReservationStore } from "@/lib/reservations/store";
import type { NewReservationInput, Reservation } from "@/lib/reservations/types";

export function input(over: Partial<NewReservationInput> = {}): NewReservationInput {
  return {
    date: "2026-06-12",
    time: "13:00",
    service: "lunch",
    partySize: 2,
    name: "Guest",
    email: "guest@example.com",
    phone: "123",
    ...over,
  };
}

/** Capacity-style validator used by the concurrency test. */
function capacityValidator(time: string, cap: number, party: number) {
  return (existing: Reservation[]): string | null => {
    const booked = existing
      .filter((r) => r.time === time && r.status !== "cancelled" && r.status !== "no_show")
      .reduce((s, r) => s + r.partySize, 0);
    return booked + party > cap ? "full" : null;
  };
}

/**
 * Behavioural contract every ReservationStore must satisfy. Run against both the
 * JSON file store and the MySQL store to guarantee parity. `makeStore` must
 * return a store backed by a CLEAN, empty dataset on every call.
 */
export function runStoreContract(name: string, makeStore: () => Promise<ReservationStore>) {
  describe(`ReservationStore contract: ${name}`, () => {
    let store: ReservationStore;
    beforeEach(async () => {
      store = await makeStore();
    });

    it("seeds and returns a config", async () => {
      const cfg = await store.getConfig();
      expect(cfg.weekly).toBeTruthy();
      expect(Object.keys(cfg.weekly).length).toBe(7);
    });

    it("round-trips a saved config", async () => {
      const cfg = await store.getConfig();
      cfg.bookingWindowDays = 99;
      cfg.dateOverrides["2026-12-25"] = { closed: false, services: [] };
      await store.saveConfig(cfg);
      const read = await store.getConfig();
      expect(read.bookingWindowDays).toBe(99);
      expect(read.dateOverrides["2026-12-25"]).toEqual({ closed: false, services: [] });
    });

    it("creates and reads a reservation", async () => {
      const r = await store.createReservation(input());
      expect(r.id).toBeTruthy();
      expect(r.status).toBe("pending"); // web default
      const got = await store.getReservation(r.id);
      expect(got?.name).toBe("Guest");
    });

    it("defaults admin bookings to confirmed and trims/normalises fields", async () => {
      const r = await store.createReservation(
        input({ source: "admin", name: "  Bob  ", email: " bob@x.io ", occasion: "", notes: "  " }),
      );
      expect(r.status).toBe("confirmed");
      expect(r.name).toBe("Bob");
      expect(r.email).toBe("bob@x.io");
      expect(r.occasion).toBeUndefined();
      expect(r.notes).toBeUndefined();
    });

    it("returns null for a missing reservation", async () => {
      expect(await store.getReservation("does-not-exist")).toBeNull();
    });

    it("lists with date/from/to/status filters, sorted by date+time", async () => {
      await store.createReservation(input({ date: "2026-06-12", time: "13:00" }));
      await store.createReservation(input({ date: "2026-06-12", time: "12:00" }));
      await store.createReservation(input({ date: "2026-06-14", time: "20:00", status: "cancelled" }));

      const onDate = await store.listReservations({ date: "2026-06-12" });
      expect(onDate.map((r) => r.time)).toEqual(["12:00", "13:00"]); // sorted

      const range = await store.listReservations({ from: "2026-06-13", to: "2026-06-20" });
      expect(range).toHaveLength(1);

      const cancelled = await store.listReservations({ status: "cancelled" });
      expect(cancelled).toHaveLength(1);
      expect(cancelled[0].date).toBe("2026-06-14");
    });

    it("updates a reservation, preserving id/createdAt and bumping updatedAt", async () => {
      const r = await store.createReservation(input());
      const updated = await store.updateReservation(r.id, { status: "seated", partySize: 6 });
      expect(updated?.id).toBe(r.id);
      expect(updated?.status).toBe("seated");
      expect(updated?.partySize).toBe(6);
      expect(updated?.createdAt).toBe(r.createdAt);
      expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(r.updatedAt).getTime());
    });

    it("returns null when updating a missing reservation", async () => {
      expect(await store.updateReservation("nope", { status: "seated" })).toBeNull();
    });

    it("deletes a reservation", async () => {
      const r = await store.createReservation(input());
      expect(await store.deleteReservation(r.id)).toBe(true);
      expect(await store.getReservation(r.id)).toBeNull();
      expect(await store.deleteReservation(r.id)).toBe(false);
    });

    it("createReservationChecked persists when validation passes", async () => {
      const out = await store.createReservationChecked(input(), () => null);
      expect(out.reservation).toBeTruthy();
      expect(out.error).toBeUndefined();
      expect(await store.listReservations()).toHaveLength(1);
    });

    it("createReservationChecked refuses and persists nothing when validation fails", async () => {
      const out = await store.createReservationChecked(input(), () => "full");
      expect(out.error).toBe("full");
      expect(out.reservation).toBeUndefined();
      expect(await store.listReservations()).toHaveLength(0);
    });

    it("round-trips unicode / emoji through the store (utf8mb4)", async () => {
      const r = await store.createReservation(
        input({ name: "José 🍝", occasion: "Anniversaire 🎉", notes: 'naïve "quotes" — 日本語 — \\n' }),
      );
      const got = await store.getReservation(r.id);
      expect(got?.name).toBe("José 🍝");
      expect(got?.occasion).toBe("Anniversaire 🎉");
      expect(got?.notes).toBe('naïve "quotes" — 日本語 — \\n');
    });

    it("preserves long notes", async () => {
      const notes = "x".repeat(5000);
      const r = await store.createReservation(input({ notes }));
      expect((await store.getReservation(r.id))?.notes).toHaveLength(5000);
    });

    it("plain createReservation does not enforce capacity (only the checked variant does)", async () => {
      await store.createReservation(input({ time: "13:00", partySize: 50 }));
      await store.createReservation(input({ time: "13:00", partySize: 50 }));
      const all = await store.listReservations({ date: "2026-06-12" });
      expect(all.filter((r) => r.time === "13:00")).toHaveLength(2); // both persisted
    });

    it("loses no writes under many concurrent plain creates", async () => {
      const n = 20;
      await Promise.all(Array.from({ length: n }, (_, i) => store.createReservation(input({ name: `G${i}` }))));
      expect(await store.listReservations()).toHaveLength(n);
    });

    it("moves a booking to a new date/time on update", async () => {
      const r = await store.createReservation(input({ date: "2026-06-12", time: "13:00" }));
      await store.updateReservation(r.id, { date: "2026-06-20", time: "20:00" });
      expect(await store.listReservations({ date: "2026-06-12" })).toHaveLength(0);
      const moved = await store.listReservations({ date: "2026-06-20" });
      expect(moved).toHaveLength(1);
      expect(moved[0].time).toBe("20:00");
    });

    it("assigns distinct ids to each reservation", async () => {
      const ids = await Promise.all([0, 1, 2].map(() => store.createReservation(input()).then((r) => r.id)));
      expect(new Set(ids).size).toBe(3);
    });

    it("filters by from-only and to-only", async () => {
      await store.createReservation(input({ date: "2026-06-10" }));
      await store.createReservation(input({ date: "2026-06-15" }));
      await store.createReservation(input({ date: "2026-06-20" }));
      expect(await store.listReservations({ from: "2026-06-15" })).toHaveLength(2);
      expect(await store.listReservations({ to: "2026-06-15" })).toHaveLength(2);
      expect(await store.listReservations({ from: "2026-06-21" })).toHaveLength(0);
    });

    it("round-trips a richly-nested config (overrides, blocked slots, closures)", async () => {
      const cfg = await store.getConfig();
      cfg.closures = ["2026-12-25", "2026-01-01"];
      cfg.blockedSlots = { "2026-06-12": ["13:00", "13:30"], "2026-06-13": ["20:00"] };
      cfg.dateOverrides = {
        "2026-12-31": { closed: false, services: [{ id: "nye", label: "NYE", start: "20:00", end: "23:00", interval: 60, capacity: 40 }] },
        "2026-08-15": { closed: true, services: [] },
      };
      await store.saveConfig(cfg);
      const read = await store.getConfig();
      expect(read.closures).toEqual(cfg.closures);
      expect(read.blockedSlots).toEqual(cfg.blockedSlots);
      expect(read.dateOverrides).toEqual(cfg.dateOverrides);
    });

    it("enforces capacity atomically under concurrent bookings", async () => {
      const time = "13:00";
      const cap = 10;
      const party = 2;
      // 10 concurrent attempts of party 2 into a capacity-10 slot -> only 5 may win.
      const attempts = Array.from({ length: 10 }, () =>
        store.createReservationChecked(input({ time, partySize: party }), capacityValidator(time, cap, party)),
      );
      const results = await Promise.all(attempts);
      const wins = results.filter((r) => r.reservation).length;
      const fails = results.filter((r) => r.error).length;
      expect(wins).toBe(5);
      expect(fails).toBe(5);

      const booked = (await store.listReservations({ date: "2026-06-12" }))
        .filter((r) => r.time === time)
        .reduce((s, r) => s + r.partySize, 0);
      expect(booked).toBe(cap); // never oversold
    });

    it("never oversells under concurrent bookings of party size 3 into capacity 10", async () => {
      const time = "13:00";
      const attempts = Array.from({ length: 5 }, () =>
        store.createReservationChecked(input({ time, partySize: 3 }), capacityValidator(time, 10, 3)),
      );
      const results = await Promise.all(attempts);
      expect(results.filter((r) => r.reservation)).toHaveLength(3); // 3+3+3=9 fits, 4th (12) doesn't
      const booked = (await store.listReservations({ date: "2026-06-12" }))
        .filter((r) => r.time === time)
        .reduce((s, r) => s + r.partySize, 0);
      expect(booked).toBeLessThanOrEqual(10);
      expect(booked).toBe(9);
    });

    /* ---------------------------- offerings ---------------------------- */

    it("defaults a created reservation's offering to 'main' when omitted", async () => {
      const r = await store.createReservation(input());
      expect(r.offering).toBe("main");
      const read = await store.getReservation(r.id);
      expect(read?.offering).toBe("main");
    });

    it("persists and round-trips an explicit offering", async () => {
      const r = await store.createReservation(input({ offering: "cocktails" }));
      expect(r.offering).toBe("cocktails");
      const read = await store.getReservation(r.id);
      expect(read?.offering).toBe("cocktails");
    });

    it("can edit a reservation's offering", async () => {
      const r = await store.createReservation(input({ offering: "main" }));
      const updated = await store.updateReservation(r.id, { offering: "sushi" });
      expect(updated?.offering).toBe("sushi");
    });

    it("isolates capacity locks between offerings (different offerings book concurrently)", async () => {
      const time = "13:00";
      // Each offering has its own capacity-10 pool. A validator scoped to the
      // offering should let 5 party-2 bookings win in EACH offering (10 total).
      const validatorFor = (offering: string) => (existing: Reservation[]): string | null => {
        const booked = existing
          .filter((r) => r.time === time && (r.offering || "main") === offering && r.status !== "cancelled" && r.status !== "no_show")
          .reduce((s, r) => s + r.partySize, 0);
        return booked + 2 > 10 ? "full" : null;
      };
      const attempts = [
        ...Array.from({ length: 10 }, () =>
          store.createReservationChecked(input({ time, partySize: 2, offering: "main" }), validatorFor("main")),
        ),
        ...Array.from({ length: 10 }, () =>
          store.createReservationChecked(input({ time, partySize: 2, offering: "bar" }), validatorFor("bar")),
        ),
      ];
      const results = await Promise.all(attempts);
      expect(results.filter((r) => r.reservation)).toHaveLength(10); // 5 per offering
      const all = await store.listReservations({ date: "2026-06-12" });
      const byOffering = (o: string) =>
        all.filter((r) => r.time === time && (r.offering || "main") === o).reduce((s, r) => s + r.partySize, 0);
      expect(byOffering("main")).toBe(10);
      expect(byOffering("bar")).toBe(10);
    });
  });
}
