import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDB } from "mysql-memory-server";
import type { ReservationStore } from "@/lib/reservations/store";
import { runStoreContract } from "./helpers/store-contract";

type MysqlStoreModule = typeof import("@/lib/reservations/mysql-store");
type PoolModule = typeof import("@/lib/reservations/mysql-pool");
type MySQLDB = Awaited<ReturnType<typeof createDB>>;

let db: MySQLDB;
let MySqlStore: MysqlStoreModule["MySqlStore"];
let getPool: PoolModule["getPool"];

beforeAll(async () => {
  db = await createDB({ version: "8.4.x" });
  process.env.MYSQL_HOST = "127.0.0.1";
  process.env.MYSQL_PORT = String(db.port);
  process.env.MYSQL_USER = db.username;
  process.env.MYSQL_PASSWORD = "";
  process.env.MYSQL_DATABASE = db.dbName;
  // Import AFTER env is set so the shared pool connects to the in-memory server.
  ({ MySqlStore } = await import("@/lib/reservations/mysql-store"));
  ({ getPool } = await import("@/lib/reservations/mysql-pool"));
}, 180_000);

afterAll(async () => {
  if (db) await db.stop();
});

async function makeStore(): Promise<ReservationStore> {
  const store = new MySqlStore("default");
  await store.getConfig(); // ensure schema exists (+ seeds availability)
  await getPool().query("DELETE FROM reservations");
  await getPool().query("DELETE FROM app_config"); // clear seed for a clean slate
  return store;
}

runStoreContract("MySqlStore", makeStore);

describe("MySqlStore specifics", () => {
  it("persists config as JSON in app_config and reads it back across instances", async () => {
    const a = await makeStore();
    const cfg = await a.getConfig();
    cfg.minPartySize = 3;
    cfg.maxPartySize = 9;
    await a.saveConfig(cfg);

    const b = new MySqlStore("default");
    const read = await b.getConfig();
    expect(read.minPartySize).toBe(3);
    expect(read.maxPartySize).toBe(9);

    const [rows] = await getPool().query("SELECT v FROM app_config WHERE k = 'availability'");
    expect((rows as unknown[]).length).toBe(1);
  });

  it("stores optional fields as NULL and surfaces them as undefined", async () => {
    const store = await makeStore();
    const r = await store.createReservation({
      date: "2026-06-12", time: "13:00", service: "lunch", partySize: 2,
      name: "NoExtras", email: "n@x.io", phone: "1",
    });
    const got = await store.getReservation(r.id);
    expect(got?.occasion).toBeUndefined();
    expect(got?.notes).toBeUndefined();
  });

  it("sanitizes raw reservation_origin values when reading reservations", async () => {
    const store = await makeStore();
    const r = await store.createReservation({
      date: "2026-06-12", time: "13:00", service: "lunch", partySize: 2,
      name: "Origin", email: "origin@x.io", phone: "1", reservationOrigin: "instagram",
    });
    await getPool().query("UPDATE reservations SET reservation_origin = ? WHERE id = ?", ["raw-referrer-url", r.id]);

    const got = await store.getReservation(r.id);
    expect(got?.reservationOrigin).toBeUndefined();
  });
});

describe("MySQL-backed rate limiter (shared store)", () => {
  it("blocks after the limit and persists the counter in rate_limits", async () => {
    const { rateLimit } = await import("@/lib/reservations/rate-limit");
    const key = `test:${Date.now()}`;
    const results: boolean[] = [];
    for (let i = 0; i < 5; i++) results.push(await rateLimit(key, 3, 60_000));
    expect(results).toEqual([true, true, true, false, false]);

    const [rows] = await getPool().query("SELECT count FROM rate_limits WHERE k = ?", [key]);
    expect(Number((rows as { count: number }[])[0].count)).toBe(5);
  });

  it("resets the window after it elapses", async () => {
    const { rateLimit } = await import("@/lib/reservations/rate-limit");
    const key = `reset:${Date.now()}`;
    expect(await rateLimit(key, 1, 800)).toBe(true);
    expect(await rateLimit(key, 1, 800)).toBe(false);
    await new Promise((r) => setTimeout(r, 900));
    expect(await rateLimit(key, 1, 800)).toBe(true);
  });
});
