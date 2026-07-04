import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDB } from "mysql-memory-server";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { listAppEvents } from "@/lib/observability/app-event-store";
import { getDayAvailability } from "@/lib/reservations/availability";
import { buildDishLoginBody, DishClient, parseDishReservationDetail, parseDishReservationList } from "@/lib/reservations/dish-client";
import { saveDishIntegration } from "@/lib/reservations/dish-store";
import { runDishSyncCron, syncDishReservations } from "@/lib/reservations/dish-sync";
import { createPlatformSession, PLATFORM_COOKIE } from "@/lib/reservations/platform-auth";
import { listExternalReservationViews } from "@/lib/reservations/thefork-store";
import { getPool, resetPool } from "@/lib/reservations/mysql-pool";
import { getStore, resetStoreCache } from "@/lib/reservations/store";
import { hashPassword, templateSettings } from "@/lib/reservations/tenant";
import { getTenantStore, resetTenantStore } from "@/lib/reservations/tenant-store";
import { lunchService, makeConfig, openDay } from "./helpers/config";
import * as dishSyncRoute from "@/app/api/platform/tenants/[id]/dish/sync/route";

type MySQLDB = Awaited<ReturnType<typeof createDB>>;

let db: MySQLDB;
let tenantId: string;
let externalPartySize = 3;

function listHtml(status = "CONFIRMED") {
  return `
    <html><body>
      <div data-reservation-id="dish-res-1"
        data-reservation-status="${status}"
        data-reservation-origin="Google"
        data-reservation-email="ada@example.com"
        data-reservation-start-date="2026-07-10T12:30:00Z"
        data-edit-url="/reservation/dish-res-1">
        12:30 PM Ada Lovelace ${externalPartySize} guest(s) "Window if possible" (Reservation Note)
      </div>
    </body></html>
  `;
}

function detailHtml() {
  return `
    <html><body>
      Status CONFIRMED
      '#' Guests ${externalPartySize}
      Date 10/07/2026 12:30 PM - 2:00 PM
      Source Google
      Occasion Birthday
      Created 10/07/2026 9:00 AM
      Last name Lovelace
      First name Ada
      Phone +39 333 123 4567
      Email ada@example.com
      Visits 4
      Reservation notes Detail note
      Internal guest information Prefers the window
      Allergies Peanuts
      Diet Vegetarian
    </body></html>
  `;
}

beforeAll(async () => {
  db = await createDB({ version: "8.4.x" });
  process.env.MYSQL_HOST = "127.0.0.1";
  process.env.MYSQL_PORT = String(db.port);
  process.env.MYSQL_USER = db.username;
  process.env.MYSQL_PASSWORD = "";
  process.env.MYSQL_DATABASE = db.dbName;
  process.env.SESSION_SECRET = "dish-sync-test-secret";
});

afterAll(async () => {
  if (db) await db.stop();
  resetPool();
});

beforeEach(async () => {
  resetPool();
  resetStoreCache();
  resetTenantStore();
  tenantId = randomUUID();
  externalPartySize = 3;
  await getTenantStore().create({
    id: tenantId,
    slug: `dish-${tenantId.slice(0, 8)}`,
    name: "DISH Test",
    settings: templateSettings(),
    adminUsername: "staff",
    adminPasswordHash: hashPassword("password123"),
    hosts: [`${tenantId}.dish.local`],
  });
  const store = getStore().forTenant(tenantId);
  await store.saveConfig(makeConfig({
    weekly: Object.fromEntries(
      Array.from({ length: 7 }, (_, day) => [day, openDay([lunchService({ interval: 30, capacity: 10 })])]),
    ),
  }));
  await saveDishIntegration(tenantId, {
    enabled: true,
    email: "manager@example.com",
    password: "secret",
  });
  vi.spyOn(DishClient.prototype, "login").mockResolvedValue();
  vi.spyOn(DishClient.prototype, "fetchReservationsHtml").mockResolvedValue(listHtml());
  vi.spyOn(DishClient.prototype, "fetchReservationDetailHtml").mockResolvedValue(detailHtml());
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await getPool().end().catch(() => {});
  resetPool();
});

describe("DISH HTML sync", () => {
  it("parses DISH list and detail HTML", () => {
    const items = parseDishReservationList(listHtml());
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      externalId: "dish-res-1",
      status: "CONFIRMED",
      origin: "Google",
      name: "Ada Lovelace",
      partySize: 3,
    });

    expect(parseDishReservationDetail(detailHtml(), "dish-res-1")).toMatchObject({
      externalId: "dish-res-1",
      name: "Ada Lovelace",
      partySize: 3,
      phone: "+39 333 123 4567",
      email: "ada@example.com",
      occasion: "Birthday",
      visits: "4",
      internalGuestInformation: "Prefers the window",
      allergies: "Peanuts",
      diet: "Vegetarian",
    });
  });

  it("removes DISH responsive contact labels from scraped guest names", () => {
    const html = `
      <html><body>
        <div data-reservation-id="dish-res-2"
          data-reservation-status="CONFIRMED"
          data-reservation-origin="DISH"
          data-reservation-start-date="2026-07-10T19:30:00Z"
          data-edit-url="/reservation/dish-res-2">
          7:30 PM "Ph o ne Em a il" Bonino Dragonetti 2 guest(s)
        </div>
        <div data-reservation-id="dish-res-3"
          data-reservation-status="CONFIRMED"
          data-reservation-origin="DISH"
          data-reservation-start-date="2026-07-10T20:00:00Z"
          data-edit-url="/reservation/dish-res-3">
          8:00 PM Matthias Ph o ne Em a il Schal 4 guest(s)
        </div>
      </body></html>
    `;

    const items = parseDishReservationList(html);
    expect(items.map((item) => item.name)).toEqual(["Bonino Dragonetti", "Matthias Schal"]);
  });

  it("removes DISH contact labels from detail-derived names", () => {
    const detail = `
      <html><body>
        Status CONFIRMED
        '#' Guests 2
        Date 10/07/2026 7:30 PM - 9:30 PM
        Last name Bonino Dragonetti
        First name "Ph o ne Em a il"
      </body></html>
    `;

    expect(parseDishReservationDetail(detail, "dish-res-2").name).toBe("Bonino Dragonetti");
  });

  it("builds the DISH SSO email login body like the browser form submit", () => {
    const html = `
      <form>
        <input class="final-username" name="username" type="hidden" />
        <input class="is-mobile" name="is_mobile" type="hidden" />
        <input class="country-code" name="country_code" type="hidden" />
        <input name="login" id="kc-login" type="submit" value="Log In" />
      </form>
    `;
    const body = buildDishLoginBody(html, " manager@example.com ", "secret");

    expect(body.get("username")).toBe("manager@example.com");
    expect(body.get("password")).toBe("secret");
    expect(body.get("login")).toBe("Log In");
    expect(body.has("is_mobile")).toBe(false);
    expect(body.get("country_code")).toBe("");
  });

  it("rejects redirected DISH reservation pages instead of treating them as empty", async () => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", {
      status: 302,
      headers: { location: "https://sso.dish.co/auth/realms/HD-SSO/login" },
    })));

    const client = new DishClient({
      tenantId,
      enabled: true,
      email: "manager@example.com",
      password: "secret",
      passwordSet: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await expect(client.fetchReservationsHtml("2026-07-10")).rejects.toThrow(/DISH reservations request redirected.*login\/session is not valid/i);
  });

  it("scopes DISH reservation requests with the configured establishment id", async () => {
    vi.restoreAllMocks();
    const fetchMock = vi.fn(async () => new Response(listHtml(), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new DishClient({
      tenantId,
      enabled: true,
      email: "manager@example.com",
      password: "secret",
      passwordSet: true,
      establishmentId: "cfa9d0f8-5c36-4f0f-b5f5-481267693e49",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await client.fetchReservationsHtml("2026-07-10");
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit?]>;
    expect(String(calls[0][0])).toContain("est=cfa9d0f8-5c36-4f0f-b5f5-481267693e49");
  });

  it("imports DISH reservations idempotently and counts their covers in availability", async () => {
    const first = await syncDishReservations(tenantId, {
      startDate: "2026-07-10",
      endDate: "2026-07-10",
    });
    expect(first).toMatchObject({ imported: 1, updated: 0, skipped: 0, errors: 0, daysFetched: 1, parsedItems: 1, emptyDays: 0 });

    const store = getStore().forTenant(tenantId);
    let reservations = await store.listReservations({ date: "2026-07-10" });
    expect(reservations).toHaveLength(1);
    expect(reservations[0]).toMatchObject({
      source: "dish",
      name: "Ada Lovelace",
      partySize: 3,
      status: "confirmed",
      service: "lunch",
    });
    expect(reservations[0].notes).toContain("External source: DISH");
    expect(reservations[0].notes).toContain("DISH origin: Google");
    expect(reservations[0].notes).toContain("DISH source: Google");
    expect(reservations[0].notes).toContain("DISH visits: 4");
    expect(reservations[0].notes).toContain("Internal guest information: Prefers the window");
    expect(reservations[0].notes).toContain("Allergies: Peanuts");
    expect(reservations[0].notes).toContain("Diet: Vegetarian");
    expect(reservations[0].occasion).toBe("Birthday");

    const external = await listExternalReservationViews(tenantId, [reservations[0].id]);
    expect(external.get(reservations[0].id)).toMatchObject({
      provider: "dish",
      label: "DISH",
      externalId: "dish-res-1",
      externalStatus: "CONFIRMED",
      externalMealStatus: "Google",
    });

    const availability = getDayAvailability(await store.getConfig(), reservations, "2026-07-10", "main");
    expect(availability.services[0].slots.find((slot) => slot.time === "12:30")).toMatchObject({
      booked: 3,
      remaining: 7,
    });

    const second = await syncDishReservations(tenantId, {
      startDate: "2026-07-10",
      endDate: "2026-07-10",
      skipExisting: true,
    });
    expect(second).toMatchObject({ imported: 0, updated: 0, skipped: 1, errors: 0 });
    const completedEvents = await listAppEvents({ tenantId, event: "external_sync.completed", limit: 10 });
    expect(completedEvents.some((event) =>
      event.metadata?.provider === "dish" &&
      event.metadata?.imported === 1 &&
      event.metadata?.errors === 0
    )).toBe(true);

    externalPartySize = 5;
    vi.mocked(DishClient.prototype.fetchReservationsHtml).mockResolvedValue(listHtml());
    vi.mocked(DishClient.prototype.fetchReservationDetailHtml).mockResolvedValue(detailHtml());
    const third = await syncDishReservations(tenantId, {
      startDate: "2026-07-10",
      endDate: "2026-07-10",
      detailMode: "always",
    });
    expect(third).toMatchObject({ imported: 0, updated: 1, skipped: 0, errors: 0 });
    reservations = await store.listReservations({ date: "2026-07-10" });
    expect(reservations[0].partySize).toBe(5);
  });

  it.each(["CANCELLED_BY_USER", "REJECTED"])("updates existing DISH %s bookings to cancelled and releases availability", async (externalStatus) => {
    await syncDishReservations(tenantId, {
      startDate: "2026-07-10",
      endDate: "2026-07-10",
    });

    vi.mocked(DishClient.prototype.fetchReservationsHtml).mockResolvedValue(listHtml(externalStatus));
    vi.mocked(DishClient.prototype.fetchReservationDetailHtml).mockResolvedValue(detailHtml());
    const update = await syncDishReservations(tenantId, {
      startDate: "2026-07-10",
      endDate: "2026-07-10",
      detailMode: "always",
    });

    expect(update).toMatchObject({ imported: 0, updated: 1, skipped: 0, errors: 0 });
    const store = getStore().forTenant(tenantId);
    const reservations = await store.listReservations({ date: "2026-07-10" });
    expect(reservations[0].status).toBe("cancelled");

    const availability = getDayAvailability(await store.getConfig(), reservations, "2026-07-10", "main");
    expect(availability.services[0].slots.find((slot) => slot.time === "12:30")).toMatchObject({
      booked: 0,
      remaining: 10,
    });

    const external = await listExternalReservationViews(tenantId, [reservations[0].id]);
    expect(external.get(reservations[0].id)?.externalStatus).toBe(externalStatus);
  });

  it("updates existing DISH status from the list without wiping detail-only fields", async () => {
    await syncDishReservations(tenantId, {
      startDate: "2026-07-10",
      endDate: "2026-07-10",
    });

    const store = getStore().forTenant(tenantId);
    const before = (await store.listReservations({ date: "2026-07-10" }))[0];
    expect(before.notes).toContain("Internal guest information: Prefers the window");
    expect(before.phone).toBe("+39 333 123 4567");

    vi.mocked(DishClient.prototype.fetchReservationsHtml).mockResolvedValue(listHtml("CANCELLED"));
    vi.mocked(DishClient.prototype.fetchReservationDetailHtml).mockClear();
    const update = await syncDishReservations(tenantId, {
      startDate: "2026-07-10",
      endDate: "2026-07-10",
      detailMode: "new",
    });

    expect(update).toMatchObject({ imported: 0, updated: 1, skipped: 0, errors: 0 });
    expect(DishClient.prototype.fetchReservationDetailHtml).not.toHaveBeenCalled();
    const after = (await store.listReservations({ date: "2026-07-10" }))[0];
    expect(after.status).toBe("cancelled");
    expect(after.notes).toContain("Internal guest information: Prefers the window");
    expect(after.phone).toBe("+39 333 123 4567");
  });

  it("platform history60 mode backfills in bounded batches without tenant notifications", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-10T09:00:00Z"));
    const fetchList = vi.mocked(DishClient.prototype.fetchReservationsHtml);
      fetchList.mockImplementation(async (date) => (date === "2026-05-12" ? listHtml() : "<html><body></body></html>"));

    try {
      const req = new NextRequest(`http://platform.local/api/platform/tenants/${tenantId}/dish/sync`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${PLATFORM_COOKIE}=${await createPlatformSession("ops")}`,
        },
        body: JSON.stringify({ mode: "history60", batchDays: 7 }),
      });
      const res = await dishSyncRoute.POST(req, { params: Promise.resolve({ id: tenantId }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.range).toMatchObject({
        startDate: "2026-05-12",
        endDate: "2026-05-18",
        mode: "history60",
        totalStartDate: "2026-05-12",
        totalEndDate: "2026-07-10",
        nextStartDate: "2026-05-19",
        complete: false,
      });
      expect(json.result).toMatchObject({ imported: 1, updated: 0, skipped: 0, errors: 0, daysFetched: 7, parsedItems: 1, emptyDays: 6 });
      expect(fetchList).toHaveBeenCalledTimes(7);
      expect(fetchList).toHaveBeenNthCalledWith(1, "2026-05-12");
      expect(fetchList).toHaveBeenLastCalledWith("2026-05-18");
    } finally {
      vi.useRealTimers();
    }
  });

  it("cron syncs enabled DISH tenants across the rolling booking-window lookahead", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-10T09:00:00Z"));
    const fetchList = vi.mocked(DishClient.prototype.fetchReservationsHtml);
    fetchList.mockImplementation(async (date) => (date === "2026-07-10" ? listHtml() : "<html><body></body></html>"));
    try {
      const results = await runDishSyncCron();
      const result = results.find((r) => r.tenantId === tenantId);
      expect(result).toMatchObject({
        tenantId,
        ok: true,
        startDate: "2026-07-10",
        endDate: "2026-07-24",
        imported: 1,
        daysFetched: 15,
        errors: 0,
      });
      expect(fetchList).toHaveBeenCalledWith("2026-07-10");
      expect(fetchList).toHaveBeenCalledWith("2026-07-24");
    } finally {
      vi.useRealTimers();
    }
  });
});
