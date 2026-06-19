import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDB } from "mysql-memory-server";
import type { AvailabilityConfig } from "@/lib/reservations/types";

type MysqlStoreModule = typeof import("@/lib/reservations/mysql-store");
type TableStoreModule = typeof import("@/lib/reservations/table-store");
type PoolModule = typeof import("@/lib/reservations/mysql-pool");
type MySQLDB = Awaited<ReturnType<typeof createDB>>;

let db: MySQLDB;
let MySqlStore: MysqlStoreModule["MySqlStore"];
let TableStore: TableStoreModule["TableStore"];
let getPool: PoolModule["getPool"];
let config: AvailabilityConfig;

beforeAll(async () => {
  db = await createDB({ version: "8.4.x" });
  process.env.MYSQL_HOST = "127.0.0.1";
  process.env.MYSQL_PORT = String(db.port);
  process.env.MYSQL_USER = db.username;
  process.env.MYSQL_PASSWORD = "";
  process.env.MYSQL_DATABASE = db.dbName;
  ({ MySqlStore } = await import("@/lib/reservations/mysql-store"));
  ({ TableStore } = await import("@/lib/reservations/table-store"));
  ({ getPool } = await import("@/lib/reservations/mysql-pool"));
}, 180_000);

afterAll(async () => {
  if (db) await db.stop();
});

const TENANT = "default";

beforeEach(async () => {
  const store = new MySqlStore(TENANT);
  config = await store.getConfig(); // ensures schema + seeds availability
  await getPool().query("DELETE FROM reservations");
  await getPool().query("DELETE FROM tables");
});

function tableStore() {
  return new TableStore(TENANT);
}

async function booking(opts: { time: string; party: number; service?: string; status?: string }) {
  const store = new MySqlStore(TENANT);
  return store.createReservation({
    date: "2026-06-12",
    time: opts.time,
    service: opts.service ?? "lunch",
    partySize: opts.party,
    name: "Guest",
    email: "g@x.io",
    phone: "1234567",
    status: (opts.status as never) ?? "confirmed",
  });
}

describe("TableStore CRUD", () => {
  it("creates, lists, updates and soft-deletes tables", async () => {
    const ts = tableStore();
    const t = await ts.createTable({ label: "12", capacity: 4 });
    expect(t.active).toBe(true);
    expect(t.minParty).toBe(1);

    let all = await ts.listTables();
    expect(all).toHaveLength(1);

    await ts.updateTable(t.id, { capacity: 6, zone: "Terrace" });
    const got = await ts.getTable(t.id);
    expect(got?.capacity).toBe(6);
    expect(got?.zone).toBe("Terrace");

    await ts.deleteTable(t.id);
    all = await ts.listTables({ activeOnly: true });
    expect(all).toHaveLength(0);
    // still present (history) when activeOnly is off
    expect(await ts.listTables()).toHaveLength(1);
  });

  it("offering filter matches bound tables and NULL-bound (any) tables", async () => {
    const ts = tableStore();
    await ts.createTable({ label: "A", capacity: 2, offering: "sushi" });
    await ts.createTable({ label: "B", capacity: 2, offering: null });
    const forMain = await ts.listTables({ offering: "main" });
    expect(forMain.map((t) => t.label).sort()).toEqual(["B"]); // sushi-bound excluded
  });
});

describe("assignTable conflict detection", () => {
  it("assigns a free table and blocks an overlapping turn", async () => {
    const ts = tableStore();
    const t = await ts.createTable({ label: "5", capacity: 4 });
    const r1 = await booking({ time: "12:00", party: 2 });
    const r2 = await booking({ time: "13:00", party: 2 }); // within default 120m turn

    const ok = await ts.assignTable(r1.id, t.id, config);
    expect(ok.error).toBeUndefined();

    const clash = await ts.assignTable(r2.id, t.id, config);
    expect(clash.error).toMatch(/already taken/i);
  });

  it("allows a non-overlapping booking on the same table", async () => {
    const ts = tableStore();
    const t = await ts.createTable({ label: "5", capacity: 4 });
    const r1 = await booking({ time: "12:00", party: 2 });
    const r2 = await booking({ time: "14:30", party: 2 }); // past the 120m turn

    await ts.assignTable(r1.id, t.id, config);
    const ok = await ts.assignTable(r2.id, t.id, config);
    expect(ok.error).toBeUndefined();
  });

  it("unassigns with null and rejects offering-mismatched tables", async () => {
    const ts = tableStore();
    const sushi = await ts.createTable({ label: "S1", capacity: 4, offering: "sushi" });
    const r1 = await booking({ time: "12:00", party: 2 }); // offering defaults to main

    const mismatch = await ts.assignTable(r1.id, sushi.id, config);
    expect(mismatch.error).toMatch(/not available for this offering/i);

    const main = await ts.createTable({ label: "M1", capacity: 4 });
    await ts.assignTable(r1.id, main.id, config);
    const cleared = await ts.assignTable(r1.id, null, config);
    expect(cleared.error).toBeUndefined();
    const [rows] = await getPool().query("SELECT table_id FROM reservations WHERE id = ?", [r1.id]);
    expect((rows as { table_id: string | null }[])[0].table_id).toBeNull();
  });

  it("rejects assignment to an inactive (deactivated) table", async () => {
    const ts = tableStore();
    const t = await ts.createTable({ label: "8", capacity: 4 });
    await ts.deleteTable(t.id); // soft-delete
    const r = await booking({ time: "12:00", party: 2 });
    const res = await ts.assignTable(r.id, t.id, config);
    expect(res.error).toMatch(/does not exist/i);
  });

  it("rejects assignment for a missing reservation", async () => {
    const ts = tableStore();
    const t = await ts.createTable({ label: "8", capacity: 4 });
    const res = await ts.assignTable("no-such-reservation", t.id, config);
    expect(res.error).toMatch(/not found/i);
  });

  it("cancelled bookings do not block a table", async () => {
    const ts = tableStore();
    const t = await ts.createTable({ label: "7", capacity: 4 });
    const r1 = await booking({ time: "12:00", party: 2, status: "cancelled" });
    const r2 = await booking({ time: "12:00", party: 2 });
    await ts.assignTable(r1.id, t.id, config); // cancelled still "assigned" but inactive status
    const ok = await ts.assignTable(r2.id, t.id, config);
    expect(ok.error).toBeUndefined();
  });
});

describe("suggestTable", () => {
  it("picks the smallest fitting free table", async () => {
    const ts = tableStore();
    await ts.createTable({ label: "big", capacity: 8 });
    const small = await ts.createTable({ label: "small", capacity: 4 });
    const r = await booking({ time: "12:00", party: 3 });
    const suggestion = await ts.suggestTable(
      { date: r.date, time: r.time, offering: r.offering, service: r.service, partySize: r.partySize },
      config,
    );
    expect(suggestion?.id).toBe(small.id);
  });

  it("respects minParty — won't seat a small party at a large min-party table", async () => {
    const ts = tableStore();
    const big = await ts.createTable({ label: "big", capacity: 8, minParty: 5 });
    const small = await ts.createTable({ label: "small", capacity: 4, minParty: 1 });
    const r3 = await booking({ time: "12:00", party: 3 });
    const s3 = await ts.suggestTable(
      { date: r3.date, time: r3.time, offering: r3.offering, service: r3.service, partySize: r3.partySize },
      config,
    );
    expect(s3?.id).toBe(small.id); // big excluded (minParty 5 > 3)

    const r6 = await booking({ time: "15:00", party: 6 });
    const s6 = await ts.suggestTable(
      { date: r6.date, time: r6.time, offering: r6.offering, service: r6.service, partySize: r6.partySize },
      config,
    );
    expect(s6?.id).toBe(big.id); // small too small (cap 4 < 6)
  });

  it("skips tables that are too small or already taken", async () => {
    const ts = tableStore();
    const tiny = await ts.createTable({ label: "tiny", capacity: 2 });
    const four = await ts.createTable({ label: "four", capacity: 4 });
    const r1 = await booking({ time: "12:00", party: 4 });
    await ts.assignTable(r1.id, four.id, config);
    const r2 = await booking({ time: "12:30", party: 4 });
    const suggestion = await ts.suggestTable(
      { date: r2.date, time: r2.time, offering: r2.offering, service: r2.service, partySize: r2.partySize },
      config,
    );
    // tiny is too small, four is taken (overlapping) → nothing fits
    expect(suggestion).toBeNull();
    void tiny;
  });
});

describe("listTablesWithDayState", () => {
  it("marks free vs reserved tables", async () => {
    const ts = tableStore();
    const a = await ts.createTable({ label: "A", capacity: 4 });
    await ts.createTable({ label: "B", capacity: 4 });
    const r = await booking({ time: "12:00", party: 2 });
    await ts.assignTable(r.id, a.id, config);

    const floor = await ts.listTablesWithDayState("2026-06-12", config);
    const byLabel = Object.fromEntries(floor.map((f) => [f.table.label, f]));
    expect(byLabel["A"].state).toBe("reserved");
    expect(byLabel["A"].reservations).toHaveLength(1);
    expect(byLabel["B"].state).toBe("free");
  });

  it("marks a table 'seated' when a seated party's turn covers now (today)", async () => {
    const ts = tableStore();
    const t = await ts.createTable({ label: "Now", capacity: 4 });

    // today + current time in the config timezone
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: config.timezone, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false,
      }).formatToParts(new Date()).map((x) => [x.type, x.value]),
    );
    const today = `${parts.year}-${parts.month}-${parts.day}`;
    const hh = String(Number(parts.hour) % 24).padStart(2, "0");
    const time = `${hh}:${parts.minute}`;

    const mysql = new MySqlStore(TENANT);
    const r = await mysql.createReservation({
      date: today, time, service: "dinner", partySize: 2,
      name: "SeatedNow", email: "s@x.io", phone: "1", status: "seated",
    });
    await ts.assignTable(r.id, t.id, config);

    const floor = await ts.listTablesWithDayState(today, config);
    expect(floor.find((f) => f.table.label === "Now")?.state).toBe("seated");
  });
});
