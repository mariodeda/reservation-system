import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDB } from "mysql-memory-server";
import type { AvailabilityConfig } from "@/lib/reservations/types";

type MysqlStoreModule = typeof import("@/lib/reservations/mysql-store");
type WaitlistModule = typeof import("@/lib/reservations/waitlist-store");
type TableModule = typeof import("@/lib/reservations/table-store");
type PoolModule = typeof import("@/lib/reservations/mysql-pool");
type MySQLDB = Awaited<ReturnType<typeof createDB>>;

let db: MySQLDB;
let MySqlStore: MysqlStoreModule["MySqlStore"];
let WaitlistStore: WaitlistModule["WaitlistStore"];
let TableStore: TableModule["TableStore"];
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
  ({ WaitlistStore } = await import("@/lib/reservations/waitlist-store"));
  ({ TableStore } = await import("@/lib/reservations/table-store"));
  ({ getPool } = await import("@/lib/reservations/mysql-pool"));
}, 180_000);

afterAll(async () => {
  if (db) await db.stop();
});

const TENANT = "default";
const TODAY = (): string => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date()).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
};

beforeEach(async () => {
  const store = new MySqlStore(TENANT);
  config = await store.getConfig();
  await getPool().query("DELETE FROM reservations");
  await getPool().query("DELETE FROM tables");
  await getPool().query("DELETE FROM waitlist");
});

function wl() {
  return new WaitlistStore(TENANT);
}

describe("WaitlistStore CRUD", () => {
  it("adds, lists and filters active entries", async () => {
    const store = wl();
    const date = TODAY();
    await store.addEntry({ date, name: "Rossi", partySize: 2 }, config);
    const left = await store.addEntry({ date, name: "Bianchi", partySize: 4 }, config);
    await store.updateEntry(left.id, { status: "left" });

    expect(await store.listWaitlist(date)).toHaveLength(2);
    const active = await store.listWaitlist(date, { activeOnly: true });
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe("Rossi");
  });

  it("deletes an entry", async () => {
    const store = wl();
    const date = TODAY();
    const e = await store.addEntry({ date, name: "Temp", partySize: 2 }, config);
    expect(await store.deleteEntry(e.id)).toBe(true);
    expect(await store.getEntry(e.id)).toBeNull();
    expect(await store.deleteEntry("no-such-id")).toBe(false);
  });

  it("edits party size and notes via updateEntry", async () => {
    const store = wl();
    const date = TODAY();
    const e = await store.addEntry({ date, name: "Edit", partySize: 2 }, config);
    const updated = await store.updateEntry(e.id, { partySize: 5, notes: "high chair" });
    expect(updated?.partySize).toBe(5);
    expect(updated?.notes).toBe("high chair");
  });

  it("quotes a heuristic wait and stamps notified_at on notify", async () => {
    const store = wl();
    const ts = new TableStore(TENANT);
    await ts.createTable({ label: "1", capacity: 4 });
    const date = TODAY();

    const first = await store.addEntry({ date, name: "A", partySize: 2 }, config);
    expect(first.quotedWaitMin).toBe(0); // no one ahead → 0
    const second = await store.addEntry({ date, name: "B", partySize: 2 }, config);
    expect(second.quotedWaitMin).toBeGreaterThan(0); // one party ahead

    const notified = await store.updateEntry(first.id, { status: "notified" });
    expect(notified?.status).toBe("notified");
    expect(notified?.notifiedAt).toBeTruthy();
  });
});

describe("seatFromWaitlist", () => {
  it("creates a seated reservation and links it back", async () => {
    const store = wl();
    const date = TODAY();
    const entry = await store.addEntry({ date, name: "Verdi", partySize: 2, notes: "window" }, config);

    const result = await store.seatFromWaitlist(entry.id, { time: "20:00", service: "dinner" }, config);
    expect(result.error).toBeUndefined();
    expect(result.reservation?.status).toBe("seated");
    expect(result.reservation?.name).toBe("Verdi");
    expect(result.reservation?.source).toBe("admin");

    const after = await store.getEntry(entry.id);
    expect(after?.status).toBe("seated");
    expect(after?.seatedReservationId).toBe(result.reservation?.id);
  });

  it("assigns a table when given and rejects a re-seat", async () => {
    const store = wl();
    const ts = new TableStore(TENANT);
    const date = TODAY();
    const table = await ts.createTable({ label: "9", capacity: 4 });
    const entry = await store.addEntry({ date, name: "Neri", partySize: 2 }, config);

    const seated = await store.seatFromWaitlist(entry.id, { time: "20:00", service: "dinner", tableId: table.id }, config);
    expect(seated.tableWarning).toBeUndefined();
    const [rows] = await getPool().query("SELECT table_id FROM reservations WHERE id = ?", [seated.reservation!.id]);
    expect((rows as { table_id: string }[])[0].table_id).toBe(table.id);

    const again = await store.seatFromWaitlist(entry.id, { time: "20:30", service: "dinner" }, config);
    expect(again.error).toMatch(/no longer waiting/i);
  });

  it("seats with a warning when the chosen table is taken", async () => {
    const store = wl();
    const ts = new TableStore(TENANT);
    const date = TODAY();
    const table = await ts.createTable({ label: "3", capacity: 4 });

    const e1 = await store.addEntry({ date, name: "First", partySize: 2 }, config);
    await store.seatFromWaitlist(e1.id, { time: "20:00", service: "dinner", tableId: table.id }, config);

    const e2 = await store.addEntry({ date, name: "Second", partySize: 2 }, config);
    const r2 = await store.seatFromWaitlist(e2.id, { time: "20:30", service: "dinner", tableId: table.id }, config);
    expect(r2.reservation).toBeTruthy(); // still seated
    expect(r2.tableWarning).toMatch(/already taken/i);
  });
});
