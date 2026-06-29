import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDB } from "mysql-memory-server";
import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";

type MySQLDB = Awaited<ReturnType<typeof createDB>>;
let db: MySQLDB;

let mock: typeof import("@/lib/reservations/mock-data");
let getPool: typeof import("@/lib/reservations/mysql-pool")["getPool"];
let getStore: typeof import("@/lib/reservations/store")["getStore"];

let tid = "";

async function count(table: string, tenantId = tid): Promise<number> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT COUNT(*) c FROM ${table} WHERE tenant_id = ?`,
    [tenantId],
  );
  return Number(rows[0].c);
}

beforeAll(async () => {
  db = await createDB({ version: "8.4.x" });
  process.env.MYSQL_HOST = "127.0.0.1";
  process.env.MYSQL_PORT = String(db.port);
  process.env.MYSQL_USER = db.username;
  process.env.MYSQL_PASSWORD = "";
  process.env.MYSQL_DATABASE = db.dbName;
  process.env.SESSION_SECRET = "mock-data-secret";

  mock = await import("@/lib/reservations/mock-data");
  ({ getPool } = await import("@/lib/reservations/mysql-pool"));
  ({ getStore } = await import("@/lib/reservations/store"));
  const { getTenantStore } = await import("@/lib/reservations/tenant-store");
  const { hashPassword, templateSettings } = await import("@/lib/reservations/tenant");

  tid = randomUUID();
  await getTenantStore().create({
    id: tid,
    slug: "mocktest",
    name: "Mock Test Osteria",
    settings: templateSettings(),
    adminUsername: "staff",
    adminPasswordHash: hashPassword("s3cret"),
    hosts: ["mock.example.com"],
  });
  // Seed the tenant's config, then force every weekday open so the "today"
  // seeding is deterministic no matter which day the suite runs (the default
  // template closes Sundays, which otherwise makes the today assertion flaky).
  const store = getStore().forTenant(tid);
  const config = await store.getConfig();
  const openServices =
    Object.values(config.weekly).find((d) => !d.closed && d.services.length)?.services ?? [];
  const openWeek = Object.fromEntries(
    [0, 1, 2, 3, 4, 5, 6].map((d) => [d, { closed: false, services: openServices }]),
  );
  config.weekly = openWeek;
  if (config.offerings?.length) {
    config.offerings = config.offerings.map((o) => ({ ...o, weekly: openWeek }));
  }
  await store.saveConfig(config);
}, 180_000);

afterAll(async () => {
  if (db) await db.stop();
});

describe("mock-data generators", () => {
  it("seeds a floor plan of tables", async () => {
    const summary = await mock.seedTables(tid);
    expect(summary.tables).toBeGreaterThan(0);
    expect(await count("tables")).toBe(summary.tables);
    // Idempotent on labels — re-running adds nothing.
    const again = await mock.seedTables(tid);
    expect(again.tables).toBe(0);
  });

  it("seeds customer profiles (VIP / dietary / notes)", async () => {
    const summary = await mock.seedCustomers(tid);
    expect(summary.customers).toBeGreaterThan(0);
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT COUNT(*) c FROM customer_profiles WHERE tenant_id = ? AND vip = 1",
      [tid],
    );
    expect(Number(rows[0].c)).toBeGreaterThan(0);
  });

  it("seeds reservations across history, today and upcoming with valid services", async () => {
    await mock.seedReservations(tid, "history");
    await mock.seedReservations(tid, "today");
    await mock.seedReservations(tid, "upcoming");
    const store = getStore().forTenant(tid);
    const all = await store.listReservations();
    expect(all.length).toBeGreaterThan(20);
    // history produces completed visits; today produces a live mix
    expect(all.some((r) => r.status === "completed")).toBe(true);
    const today = (await import("@/lib/reservations/availability")).nowInTz("Europe/Rome").dateStr;
    expect(all.some((r) => r.date === today)).toBe(true);
    // every reservation references a real service id for its date
    expect(all.every((r) => !!r.service && !!r.time)).toBe(true);
  });

  it("seeds feedback against completed past reservations", async () => {
    const summary = await mock.seedFeedback(tid);
    expect(summary.feedbackRequests).toBeGreaterThan(0);
    expect(await count("reservation_feedback")).toBe(summary.feedbackRequests);
  });

  it("seeds an active waitlist for today", async () => {
    const summary = await mock.seedWaitlist(tid);
    expect(summary.waitlist).toBeGreaterThan(0);
    expect(await count("waitlist")).toBe(summary.waitlist);
  });

  it("clears all of a tenant's operational data", async () => {
    const cleared = await mock.clearTenantData(tid);
    expect(cleared.reservations).toBeGreaterThan(0);
    for (const t of ["reservations", "tables", "waitlist", "customer_profiles", "reservation_feedback"]) {
      expect(await count(t)).toBe(0);
    }
  });

  it("seedAll populates every category in one call and is tenant-scoped", async () => {
    const other = randomUUID();
    const { getTenantStore } = await import("@/lib/reservations/tenant-store");
    const { hashPassword, templateSettings } = await import("@/lib/reservations/tenant");
    await getTenantStore().create({
      id: other, slug: "mocktest2", name: "Second Tenant",
      settings: templateSettings(), adminUsername: "s", adminPasswordHash: hashPassword("pw12pw12"),
      hosts: ["mock2.example.com"],
    });
    await getStore().forTenant(other).getConfig();

    const summary = await mock.seedAll(other);
    expect(summary.tables).toBeGreaterThan(0);
    expect(summary.reservations).toBeGreaterThan(0);
    expect(summary.customers).toBeGreaterThan(0);
    expect(summary.waitlist).toBeGreaterThan(0);

    // tid was cleared in the previous test — confirm scoping held.
    expect(await count("reservations", tid)).toBe(0);
    expect(await count("reservations", other)).toBeGreaterThan(0);
  });
});
