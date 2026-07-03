import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDB } from "mysql-memory-server";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { listAppEvents } from "@/lib/observability/app-event-store";
import { getDayAvailability } from "@/lib/reservations/availability";
import { DishClient, parseDishReservationDetail, parseDishReservationList } from "@/lib/reservations/dish-client";
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
      Created 10/07/2026 9:00 AM
      Last name Lovelace
      First name Ada
      Phone +39 333 123 4567
      Email ada@example.com
      Reservation notes Detail note
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
    });
  });

  it("imports DISH reservations idempotently and counts their covers in availability", async () => {
    const first = await syncDishReservations(tenantId, {
      startDate: "2026-07-10",
      endDate: "2026-07-10",
    });
    expect(first).toMatchObject({ imported: 1, updated: 0, skipped: 0, errors: 0 });

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

  it("platform history60 mode backfills the last 60 calendar days without tenant notifications", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-10T09:00:00Z"));
    const fetchList = vi.mocked(DishClient.prototype.fetchReservationsHtml);
    fetchList.mockImplementation(async (date) => (date === "2026-07-10" ? listHtml() : "<html><body></body></html>"));

    try {
      const req = new NextRequest(`http://platform.local/api/platform/tenants/${tenantId}/dish/sync`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${PLATFORM_COOKIE}=${await createPlatformSession("ops")}`,
        },
        body: JSON.stringify({ mode: "history60" }),
      });
      const res = await dishSyncRoute.POST(req, { params: Promise.resolve({ id: tenantId }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.range).toEqual({ startDate: "2026-05-12", endDate: "2026-07-10", mode: "history60" });
      expect(json.result).toMatchObject({ imported: 1, updated: 0, skipped: 0, errors: 0 });
      expect(fetchList).toHaveBeenCalledTimes(60);
      expect(fetchList).toHaveBeenNthCalledWith(1, "2026-05-12");
      expect(fetchList).toHaveBeenLastCalledWith("2026-07-10");
    } finally {
      vi.useRealTimers();
    }
  });

  it("cron syncs enabled DISH tenants for today and tomorrow", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-10T09:00:00Z"));
    const fetchList = vi.mocked(DishClient.prototype.fetchReservationsHtml);
    try {
      const results = await runDishSyncCron();
      const result = results.find((r) => r.tenantId === tenantId);
      expect(result).toMatchObject({
        tenantId,
        ok: true,
        startDate: "2026-07-10",
        endDate: "2026-07-11",
        imported: 1,
        errors: 0,
      });
      expect(fetchList).toHaveBeenCalledWith("2026-07-10");
      expect(fetchList).toHaveBeenCalledWith("2026-07-11");
    } finally {
      vi.useRealTimers();
    }
  });
});
