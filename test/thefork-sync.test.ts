import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDB } from "mysql-memory-server";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getDayAvailability } from "@/lib/reservations/availability";
import { listAppEvents } from "@/lib/observability/app-event-store";
import { getStore, resetStoreCache } from "@/lib/reservations/store";
import { listTenantNotifications } from "@/lib/reservations/notification-store";
import { getTenantStore, resetTenantStore } from "@/lib/reservations/tenant-store";
import { hashPassword, templateSettings } from "@/lib/reservations/tenant";
import { getPool, resetPool } from "@/lib/reservations/mysql-pool";
import { listExternalReservationViews, saveTheForkIntegration } from "@/lib/reservations/thefork-store";
import { clearTheForkTokenCache } from "@/lib/reservations/thefork-client";
import { syncTheForkReservations } from "@/lib/reservations/thefork-sync";
import { reservationBus } from "@/lib/reservations/events";
import * as webhookRoute from "@/app/api/integrations/thefork/webhook/[tenantId]/route";
import { lunchService, makeConfig, openDay } from "./helpers/config";

type MySQLDB = Awaited<ReturnType<typeof createDB>>;

let db: MySQLDB;
let tenantId: string;
const restaurantUuid = "11111111-1111-4111-8111-111111111111";
const reservationUuid = "22222222-2222-4222-8222-222222222222";
let externalPartySize = 2;
let externalStatus: "RECORDED" | "CANCELED" | "NO_SHOW" | "REQUESTED" | "REFUSED" = "RECORDED";
let externalMealStatus: "PARTIALLY_ARRIVED" | "ARRIVED" | "SEATED" | "BILL" | "LEFT" | null = null;
let customerAvailable = true;
let webhookToken = "";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeAll(async () => {
  db = await createDB({ version: "8.4.x" });
  process.env.MYSQL_HOST = "127.0.0.1";
  process.env.MYSQL_PORT = String(db.port);
  process.env.MYSQL_USER = db.username;
  process.env.MYSQL_PASSWORD = "";
  process.env.MYSQL_DATABASE = db.dbName;
  process.env.SESSION_SECRET = "thefork-sync-test-secret";
});

afterAll(async () => {
  if (db) await db.stop();
  resetPool();
});

beforeEach(async () => {
  resetPool();
  resetStoreCache();
  resetTenantStore();
  clearTheForkTokenCache();
  tenantId = randomUUID();
  externalPartySize = 2;
  externalStatus = "RECORDED";
  externalMealStatus = null;
  customerAvailable = true;
  await getTenantStore().create({
    id: tenantId,
    slug: `thefork-${tenantId.slice(0, 8)}`,
    name: "TheFork Test",
    settings: templateSettings(),
    adminUsername: "staff",
    adminPasswordHash: hashPassword("password123"),
    hosts: [`${tenantId}.thefork.local`],
  });
  const store = getStore().forTenant(tenantId);
  await store.saveConfig(makeConfig({
    weekly: Object.fromEntries(
      Array.from({ length: 7 }, (_, day) => [day, openDay([lunchService({ interval: 30, capacity: 10 })])]),
    ),
  }));
  const integration = await saveTheForkIntegration(tenantId, {
    enabled: true,
    clientId: "client-id",
    clientSecret: "client-secret",
    restaurantUuid,
    rotateWebhookToken: true,
  });
  webhookToken = integration.webhookToken ?? "";

  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "https://auth.thefork.io/oauth/token") {
      return json({ access_token: "access-token", expires_in: 8600 });
    }
    if (url.includes("/manager/v1/reservations?")) {
      return json({ data: [reservationUuid], totalCount: 1, page: 1, limit: 100 });
    }
    if (url.endsWith(`/manager/v1/reservations/${reservationUuid}`)) {
      return json({
        reservationUuid,
        restaurantUuid,
        mealDate: "2026-07-10T12:30:00Z",
        mealStatus: externalMealStatus,
        partySize: externalPartySize,
        status: externalStatus,
        customerUuid: "tf-customer-1",
        customerNote: "Window if possible",
        customFields: { dietary: "No garlic" },
        reservationChannel: "thefork",
        updatedAt: `2026-06-11T10:00:0${externalPartySize}Z`,
      });
    }
    if (url.endsWith("/manager/v1/customers/tf-customer-1")) {
      if (!customerAvailable) return json({ error: "not found" }, 404);
      return json({
        customerUuid: "tf-customer-1",
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        phone: "+39 333 123 4567",
      });
    }
    return json({ error: "not found" }, 404);
  }));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  clearTheForkTokenCache();
  await getPool().end().catch(() => {});
  resetPool();
});

describe("TheFork one-way sync", () => {
  it("imports external reservations idempotently and counts them in availability", async () => {
    const first = await syncTheForkReservations(tenantId, {
      startDate: "2026-07-10",
      endDate: "2026-07-10",
      filterBy: "mealDate",
    });
    expect(first).toMatchObject({ imported: 1, updated: 0, skipped: 0, errors: 0 });

    const store = getStore().forTenant(tenantId);
    let reservations = await store.listReservations({ date: "2026-07-10" });
    expect(reservations).toHaveLength(1);
    expect(reservations[0]).toMatchObject({
      source: "thefork",
      name: "Ada Lovelace",
      partySize: 2,
      status: "confirmed",
      service: "lunch",
    });
    expect(reservations[0].notes).toContain("External source: TheFork");
    expect(reservations[0].notes).toContain("TheFork status: RECORDED");
    expect(reservations[0].notes).toContain("Window if possible");

    const external = await listExternalReservationViews(tenantId, [reservations[0].id]);
    expect(external.get(reservations[0].id)).toMatchObject({
      provider: "thefork",
      label: "TheFork",
      externalId: reservationUuid,
      externalStatus: "RECORDED",
    });

    const config = await store.getConfig();
    const availability = getDayAvailability(config, reservations, "2026-07-10", "main");
    expect(availability.services[0].slots.find((slot) => slot.time === "12:30")).toMatchObject({
      booked: 2,
      remaining: 8,
    });

    const second = await syncTheForkReservations(tenantId, {
      startDate: "2026-07-10",
      endDate: "2026-07-10",
      filterBy: "mealDate",
    });
    expect(second).toMatchObject({ imported: 0, updated: 0, skipped: 1, errors: 0 });
    const completedEvents = await listAppEvents({ tenantId, event: "external_sync.completed", limit: 10 });
    expect(completedEvents.some((event) =>
      event.metadata?.provider === "thefork" &&
      event.metadata?.imported === 1 &&
      event.metadata?.errors === 0
    )).toBe(true);
    reservations = await store.listReservations({ date: "2026-07-10" });
    expect(reservations).toHaveLength(1);

    externalPartySize = 4;
    const firstSyncRerun = await syncTheForkReservations(tenantId, {
      startDate: "2026-07-10",
      endDate: "2026-07-10",
      filterBy: "mealDate",
      skipExisting: true,
    });
    expect(firstSyncRerun).toMatchObject({ imported: 0, updated: 0, skipped: 1, errors: 0 });
    reservations = await store.listReservations({ date: "2026-07-10" });
    expect(reservations[0].partySize).toBe(2);

    const third = await syncTheForkReservations(tenantId, {
      startDate: "2026-07-10",
      endDate: "2026-07-10",
      filterBy: "mealDate",
    });
    expect(third).toMatchObject({ imported: 0, updated: 1, skipped: 0, errors: 0 });
    reservations = await store.listReservations({ date: "2026-07-10" });
    expect(reservations[0].partySize).toBe(4);
  });

  it("imports reservation events through the public webhook before acknowledging", async () => {
    const req = new NextRequest(`http://localhost/api/integrations/thefork/webhook/${tenantId}`, {
      method: "POST",
      body: JSON.stringify({
        entityType: "reservation",
        eventType: "reservationCreated",
        uuid: reservationUuid,
        restaurantUuid,
      }),
      headers: { "content-type": "application/json", authorization: `Bearer ${webhookToken}` },
    });

    const res = await webhookRoute.POST(req, { params: Promise.resolve({ tenantId }) });
    expect(res.status).toBe(200);

    const reservations = await getStore().forTenant(tenantId).listReservations({ date: "2026-07-10" });
    expect(reservations).toHaveLength(1);
    expect(reservations[0]).toMatchObject({ source: "thefork", name: "Ada Lovelace" });
    const webhookEvents = await listAppEvents({ tenantId, event: "external_sync.webhook_processed", limit: 10 });
    expect(webhookEvents[0]).toMatchObject({ level: "info", tenantId });
    expect(webhookEvents[0].metadata).toMatchObject({ provider: "thefork", externalId: reservationUuid, outcome: "created" });
  });

  it("keeps one refreshed TheFork notification across webhook status changes", async () => {
    const ctx = { params: Promise.resolve({ tenantId }) };
    const request = (eventType: string) => new NextRequest(`http://localhost/api/integrations/thefork/webhook/${tenantId}`, {
      method: "POST",
      body: JSON.stringify({
        entityType: "reservation",
        eventType,
        uuid: reservationUuid,
        restaurantUuid,
      }),
      headers: { "content-type": "application/json", authorization: `Bearer ${webhookToken}` },
    });

    expect((await webhookRoute.POST(request("reservationCreated"), ctx)).status).toBe(200);
    let notifications = await listTenantNotifications(tenantId);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      type: "reservation.created",
      title: "New TheFork reservation",
      source: "thefork",
      dedupeKey: expect.stringMatching(/^reservation\.external:thefork:/),
    });
    expect(notifications[0].metadata).toMatchObject({
      reservation: {
        name: "Ada Lovelace",
        status: "confirmed",
        source: "thefork",
      },
    });

    externalStatus = "CANCELED";
    expect((await webhookRoute.POST(request("reservationUpdated"), ctx)).status).toBe(200);

    notifications = await listTenantNotifications(tenantId);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      type: "reservation.updated",
      title: "TheFork reservation cancelled",
      body: "Ada Lovelace - 2 guests - 2026-07-10 12:30 - Status: Cancelled",
      source: "thefork",
    });
    expect(notifications[0].metadata).toMatchObject({
      reservation: {
        name: "Ada Lovelace",
        status: "cancelled",
        source: "thefork",
      },
    });
  });

  it("preserves TheFork guest identity on webhook updates when the customer API is unavailable", async () => {
    await syncTheForkReservations(tenantId, {
      startDate: "2026-07-10",
      endDate: "2026-07-10",
      filterBy: "mealDate",
    });

    customerAvailable = false;
    externalStatus = "CANCELED";
    const req = new NextRequest(`http://localhost/api/integrations/thefork/webhook/${tenantId}`, {
      method: "POST",
      body: JSON.stringify({
        entityType: "reservation",
        eventType: "reservationUpdated",
        uuid: reservationUuid,
        restaurantUuid,
      }),
      headers: { "content-type": "application/json", authorization: `Bearer ${webhookToken}` },
    });

    expect((await webhookRoute.POST(req, { params: Promise.resolve({ tenantId }) })).status).toBe(200);
    const reservations = await getStore().forTenant(tenantId).listReservations({ date: "2026-07-10" });
    expect(reservations).toHaveLength(1);
    expect(reservations[0]).toMatchObject({
      source: "thefork",
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+39 333 123 4567",
      status: "cancelled",
    });
  });

  it("can backfill without emitting staff notification events", async () => {
    const listener = vi.fn();
    reservationBus.on("reservation.created", listener);
    try {
      const result = await syncTheForkReservations(tenantId, {
        startDate: "2026-07-10",
        endDate: "2026-07-10",
        filterBy: "mealDate",
        emitEvents: false,
      });

      expect(result).toMatchObject({ imported: 1, updated: 0, skipped: 0, errors: 0 });
      expect(listener).not.toHaveBeenCalled();
    } finally {
      reservationBus.off("reservation.created", listener);
    }
  });

  it("stops cleanly when the sync deadline is reached", async () => {
    await expect(syncTheForkReservations(tenantId, {
      startDate: "2026-07-10",
      endDate: "2026-07-10",
      filterBy: "mealDate",
      skipExisting: true,
      deadlineAt: Date.now() - 1,
    })).rejects.toThrow(/timed out/i);

    await expect(getStore().forTenant(tenantId).listReservations({ date: "2026-07-10" })).resolves.toHaveLength(0);
  });

  it("accepts TheFork restaurant context from the CustomerId header", async () => {
    const req = new NextRequest(`http://localhost/api/integrations/thefork/webhook/${tenantId}`, {
      method: "POST",
      body: JSON.stringify({
        entityType: "reservation",
        eventType: "reservationCreated",
        uuid: reservationUuid,
      }),
      headers: { "content-type": "application/json", authorization: `Bearer ${webhookToken}`, customerid: restaurantUuid },
    });

    const res = await webhookRoute.POST(req, { params: Promise.resolve({ tenantId }) });
    expect(res.status).toBe(200);
    await expect(getStore().forTenant(tenantId).listReservations({ date: "2026-07-10" })).resolves.toHaveLength(1);
  });

  it("skips unsafe third-party reservation payloads without crashing", async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://auth.thefork.io/oauth/token") return json({ access_token: "access-token", expires_in: 8600 });
      if (url.includes("/manager/v1/reservations?")) {
        return json({ data: [reservationUuid], totalCount: 1, page: 1, limit: 100 });
      }
      if (url.endsWith(`/manager/v1/reservations/${reservationUuid}`)) {
        return json({
          reservationUuid,
          restaurantUuid,
          mealDate: "not-a-date",
          partySize: 2,
          status: "RECORDED",
          customerUuid: { bad: true },
        });
      }
      return json({ error: "not found" }, 404);
    });

    const result = await syncTheForkReservations(tenantId, {
      startDate: "2026-07-10",
      endDate: "2026-07-10",
      filterBy: "mealDate",
    });

    expect(result).toMatchObject({ imported: 0, updated: 0, skipped: 1, errors: 0 });
    await expect(getStore().forTenant(tenantId).listReservations({ date: "2026-07-10" })).resolves.toHaveLength(0);
  });

  it("rejects unauthenticated, malformed, oversized, or cross-restaurant webhook calls", async () => {
    const ctx = { params: Promise.resolve({ tenantId }) };

    const invalidTenant = await webhookRoute.POST(new NextRequest("http://localhost/api/integrations/thefork/webhook/not-a-tenant", {
      method: "POST",
      body: JSON.stringify({ entityType: "reservation", eventType: "reservationCreated", uuid: reservationUuid, restaurantUuid }),
      headers: { "content-type": "application/json", authorization: `Bearer ${webhookToken}` },
    }), { params: Promise.resolve({ tenantId: "not-a-tenant" }) });
    expect(invalidTenant.status).toBe(404);

    const noAuth = await webhookRoute.POST(new NextRequest(`http://localhost/api/integrations/thefork/webhook/${tenantId}`, {
      method: "POST",
      body: JSON.stringify({ entityType: "reservation", eventType: "reservationCreated", uuid: reservationUuid, restaurantUuid }),
      headers: { "content-type": "application/json" },
    }), ctx);
    expect(noAuth.status).toBe(401);

    const badType = await webhookRoute.POST(new NextRequest(`http://localhost/api/integrations/thefork/webhook/${tenantId}`, {
      method: "POST",
      body: "not-json",
      headers: { authorization: `Bearer ${webhookToken}`, "content-type": "text/plain" },
    }), ctx);
    expect(badType.status).toBe(400);

    const tooLarge = await webhookRoute.POST(new NextRequest(`http://localhost/api/integrations/thefork/webhook/${tenantId}`, {
      method: "POST",
      body: JSON.stringify({ payload: "x".repeat(20_000) }),
      headers: { authorization: `Bearer ${webhookToken}`, "content-type": "application/json" },
    }), ctx);
    expect(tooLarge.status).toBe(413);

    const mismatch = await webhookRoute.POST(new NextRequest(`http://localhost/api/integrations/thefork/webhook/${tenantId}`, {
      method: "POST",
      body: JSON.stringify({
        entityType: "reservation",
        eventType: "reservationCreated",
        uuid: reservationUuid,
        restaurantUuid: "33333333-3333-4333-8333-333333333333",
      }),
      headers: { authorization: `Bearer ${webhookToken}`, "content-type": "application/json" },
    }), ctx);
    expect(mismatch.status).toBe(403);

    const headerMismatch = await webhookRoute.POST(new NextRequest(`http://localhost/api/integrations/thefork/webhook/${tenantId}`, {
      method: "POST",
      body: JSON.stringify({
        entityType: "reservation",
        eventType: "reservationCreated",
        uuid: reservationUuid,
      }),
      headers: { authorization: `Bearer ${webhookToken}`, "content-type": "application/json", customerid: "33333333-3333-4333-8333-333333333333" },
    }), ctx);
    expect(headerMismatch.status).toBe(403);
  });
});
