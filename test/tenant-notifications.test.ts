import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDB } from "mysql-memory-server";

type MySQLDB = Awaited<ReturnType<typeof createDB>>;

let db: MySQLDB;
let poolMod: typeof import("@/lib/reservations/mysql-pool");
let store: typeof import("@/lib/reservations/notification-store");
let notifications: typeof import("@/lib/reservations/notifications");

beforeAll(async () => {
  db = await createDB({ version: "8.4.x" });
  process.env.MYSQL_HOST = "127.0.0.1";
  process.env.MYSQL_PORT = String(db.port);
  process.env.MYSQL_USER = db.username;
  process.env.MYSQL_PASSWORD = "";
  process.env.MYSQL_DATABASE = db.dbName;
  process.env.SESSION_SECRET = "notification-test-secret";

  poolMod = await import("@/lib/reservations/mysql-pool");
  store = await import("@/lib/reservations/notification-store");
  notifications = await import("@/lib/reservations/notifications");
}, 180_000);

afterAll(async () => {
  if (db) await db.stop();
});

beforeEach(async () => {
  await poolMod.getPool().query("DELETE FROM tenant_notifications").catch(() => {});
});

describe("tenant notifications", () => {
  it("creates unread notifications and deduplicates by tenant + dedupe key", async () => {
    const first = await store.createTenantNotification({
      tenantId: "tenant-a",
      type: "reservation.created",
      title: "New booking",
      source: "web",
      reservationId: "res-1",
      dedupeKey: "reservation.created:res-1",
      metadata: { reservation: { id: "res-1", name: "Jane" } },
    });
    const second = await store.createTenantNotification({
      tenantId: "tenant-a",
      type: "reservation.created",
      title: "New booking updated title",
      source: "web",
      reservationId: "res-1",
      dedupeKey: "reservation.created:res-1",
      metadata: { reservation: { id: "res-1", name: "Jane" } },
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.notification.id).toBe(first.notification.id);
    expect(await store.countUnreadTenantNotifications("tenant-a")).toBe(1);
    expect(await store.listTenantNotifications("tenant-a")).toHaveLength(1);
  });

  it("keeps reads, dismissals, and mark-all tenant scoped", async () => {
    const a = await store.createTenantNotification({
      tenantId: "tenant-a",
      type: "reservation.created",
      title: "Tenant A booking",
      source: "web",
      reservationId: "a-res",
      dedupeKey: "a-res",
    });
    await store.createTenantNotification({
      tenantId: "tenant-b",
      type: "reservation.created",
      title: "Tenant B booking",
      source: "web",
      reservationId: "b-res",
      dedupeKey: "b-res",
    });

    const unreadForB = await store.listTenantNotifications("tenant-b", { unreadOnly: true });
    expect(unreadForB.map((n) => n.reservationId)).toEqual(["b-res"]);

    const read = await store.markTenantNotificationRead("tenant-a", a.notification.id);
    expect(read?.readAt).toBeTruthy();
    expect(await store.countUnreadTenantNotifications("tenant-a")).toBe(0);
    expect(await store.countUnreadTenantNotifications("tenant-b")).toBe(1);

    const dismissed = await store.dismissTenantNotification("tenant-b", unreadForB[0].id);
    expect(dismissed?.readAt).toBeTruthy();
    expect(dismissed?.dismissedAt).toBeTruthy();
    expect(await store.countUnreadTenantNotifications("tenant-b")).toBe(0);
  });

  it("filters expired notifications out of list and unread counts", async () => {
    await store.createTenantNotification({
      tenantId: "tenant-a",
      type: "system.notice",
      title: "Expired",
      dedupeKey: "expired",
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    await store.createTenantNotification({
      tenantId: "tenant-a",
      type: "system.notice",
      title: "Active",
      dedupeKey: "active",
    });

    expect((await store.listTenantNotifications("tenant-a")).map((n) => n.title)).toEqual(["Active"]);
    expect(await store.countUnreadTenantNotifications("tenant-a")).toBe(1);
  });

  it("emits live events only for newly-created durable notifications", async () => {
    const emitted: unknown[] = [];
    const listener = (event: unknown) => emitted.push(event);
    notifications.notificationBus.on("notification.created", listener);
    try {
      await notifications.createAndEmitTenantNotification({
        tenantId: "tenant-a",
        type: "reservation.created",
        title: "New booking",
        source: "web",
        reservationId: "res-1",
        dedupeKey: "res-1",
      });
      await notifications.createAndEmitTenantNotification({
        tenantId: "tenant-a",
        type: "reservation.created",
        title: "New booking",
        source: "web",
        reservationId: "res-1",
        dedupeKey: "res-1",
      });
    } finally {
      notifications.notificationBus.off("notification.created", listener);
    }

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      tenantId: "tenant-a",
      notification: { reservationId: "res-1" },
    });
  });

  it("creates explicit external cancellation reservation notifications", async () => {
    const notice = await notifications.notifyReservationEvent({
      type: "reservation.updated",
      tenantId: "tenant-a",
      id: "res-cancelled",
      name: "Jane",
      partySize: 2,
      date: "2026-07-10",
      time: "20:00",
      service: "dinner",
      offering: "main",
      status: "cancelled",
      source: "thefork",
    });

    expect(notice).toMatchObject({
      tenantId: "tenant-a",
      type: "reservation.updated",
      severity: "warning",
      title: "TheFork reservation cancelled",
      body: "Jane - 2 guests - 2026-07-10 20:00 - Status: Cancelled",
      source: "thefork",
      reservationId: "res-cancelled",
      dedupeKey: "reservation.external:thefork:res-cancelled",
    });
    expect(notice?.metadata).toMatchObject({
      reservation: {
        id: "res-cancelled",
        status: "cancelled",
        source: "thefork",
      },
    });
  });

  it("keeps one refreshed notification per external reservation", async () => {
    await notifications.notifyReservationEvent({
      type: "reservation.created",
      tenantId: "tenant-a",
      id: "res-dish",
      name: "Lovelace, Ada",
      partySize: 2,
      date: "2026-07-10",
      time: "20:00",
      service: "dinner",
      offering: "main",
      status: "confirmed",
      source: "dish",
    });
    const updated = await notifications.notifyReservationEvent({
      type: "reservation.updated",
      tenantId: "tenant-a",
      id: "res-dish",
      name: "Ada Lovelace",
      partySize: 2,
      date: "2026-07-10",
      time: "20:00",
      service: "dinner",
      offering: "main",
      status: "completed",
      source: "dish",
    });

    const rows = await store.listTenantNotifications("tenant-a");
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(updated?.id);
    expect(rows[0]).toMatchObject({
      type: "reservation.updated",
      title: "DISH reservation completed",
      body: "Ada Lovelace - 2 guests - 2026-07-10 20:00 - Status: Completed",
      source: "dish",
      reservationId: "res-dish",
      dedupeKey: "reservation.external:dish:res-dish",
    });
    expect(rows[0].metadata).toMatchObject({
      reservation: {
        name: "Ada Lovelace",
        status: "completed",
      },
    });
  });
});
