import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDB } from "mysql-memory-server";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";

type MySQLDB = Awaited<ReturnType<typeof createDB>>;
let db: MySQLDB;
let tenantId: string;

let tablesRoute: typeof import("@/app/api/admin/tables/route");
let tableIdRoute: typeof import("@/app/api/admin/tables/[id]/route");
let suggestRoute: typeof import("@/app/api/admin/reservations/[id]/table/route");
let resIdRoute: typeof import("@/app/api/admin/reservations/[id]/route");
let store: typeof import("@/lib/reservations/store");
let auth: typeof import("@/lib/reservations/auth");
let poolMod: typeof import("@/lib/reservations/mysql-pool");

let adminCookie = "";

function req(url: string, opts: { method?: string; body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: "localhost", "x-forwarded-for": "127.0.0.1" };
  if (opts.cookie) headers.cookie = opts.cookie;
  let body: string | undefined;
  if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers["content-type"] = "application/json";
    headers["content-length"] = String(Buffer.byteLength(body));
  }
  return new NextRequest(`http://localhost${url}`, { method: opts.method ?? "GET", headers, body });
}
const authed = (url: string, o: Parameters<typeof req>[1] = {}) => req(url, { ...o, cookie: adminCookie });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  db = await createDB({ version: "8.4.x" });
  process.env.MYSQL_HOST = "127.0.0.1";
  process.env.MYSQL_PORT = String(db.port);
  process.env.MYSQL_USER = db.username;
  process.env.MYSQL_PASSWORD = "";
  process.env.MYSQL_DATABASE = db.dbName;
  process.env.SESSION_SECRET = "tables-route-secret";

  auth = await import("@/lib/reservations/auth");
  poolMod = await import("@/lib/reservations/mysql-pool");
  store = await import("@/lib/reservations/store");
  tablesRoute = await import("@/app/api/admin/tables/route");
  tableIdRoute = await import("@/app/api/admin/tables/[id]/route");
  suggestRoute = await import("@/app/api/admin/reservations/[id]/table/route");
  resIdRoute = await import("@/app/api/admin/reservations/[id]/route");

  const { getTenantStore, resetTenantStore } = await import("@/lib/reservations/tenant-store");
  const { hashPassword, templateSettings } = await import("@/lib/reservations/tenant");
  const { ensureSchema } = await import("@/lib/reservations/mysql-schema");
  await ensureSchema();
  resetTenantStore();
  tenantId = randomUUID();
  await getTenantStore().create({
    id: tenantId,
    slug: "tables-test",
    name: "Tables Test",
    settings: templateSettings(),
    adminUsername: "staff",
    adminPasswordHash: hashPassword("secret1"),
    hosts: ["localhost"],
  });
  adminCookie = `${auth.SESSION_COOKIE}=${await auth.createSession(tenantId, "staff")}`;
}, 180_000);

afterAll(async () => {
  if (db) await db.stop();
});

beforeEach(async () => {
  const p = poolMod.getPool();
  await p.query("DELETE FROM reservations WHERE tenant_id = ?", [tenantId]);
  await p.query("DELETE FROM tables WHERE tenant_id = ?", [tenantId]);
});

async function createTable(body: Record<string, unknown>) {
  const res = await tablesRoute.POST(authed("/api/admin/tables", { method: "POST", body }));
  const json = await res.json();
  return { res, table: json.table };
}

async function booking(opts: { time: string; party?: number; status?: string } = { time: "20:00" }) {
  const s = store.getStore().forTenant(tenantId);
  return s.createReservation({
    date: "2026-06-12", time: opts.time, service: "dinner",
    partySize: opts.party ?? 2, name: "Guest", email: "g@x.io", phone: "1",
    status: (opts.status as never) ?? "confirmed",
  });
}

describe("auth", () => {
  it("401 on every tables endpoint without a session", async () => {
    expect((await tablesRoute.GET(req("/api/admin/tables"))).status).toBe(401);
    expect((await tablesRoute.POST(req("/api/admin/tables", { method: "POST", body: {} }))).status).toBe(401);
    expect((await tableIdRoute.PATCH(req("/api/admin/tables/x", { method: "PATCH", body: {} }), params("x"))).status).toBe(401);
    expect((await tableIdRoute.DELETE(req("/api/admin/tables/x", { method: "DELETE" }), params("x"))).status).toBe(401);
    expect((await suggestRoute.GET(req("/api/admin/reservations/x/table"), params("x"))).status).toBe(401);
  });
});

describe("POST /api/admin/tables (create)", () => {
  it("creates a table", async () => {
    const { res, table } = await createTable({ label: "12", capacity: 4, minParty: 2, zone: "Terrace", joinable: true });
    expect(res.status).toBe(201);
    expect(table.label).toBe("12");
    expect(table.capacity).toBe(4);
    expect(table.minParty).toBe(2);
    expect(table.zone).toBe("Terrace");
    expect(table.joinable).toBe(true);
    expect(table.active).toBe(true);
  });

  it("rejects a missing label", async () => {
    const res = await tablesRoute.POST(authed("/api/admin/tables", { method: "POST", body: { capacity: 4 } }));
    expect(res.status).toBe(400);
  });

  it("rejects capacity < 1", async () => {
    const res = await tablesRoute.POST(authed("/api/admin/tables", { method: "POST", body: { label: "X", capacity: 0 } }));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/admin/tables (list + floor)", () => {
  it("lists tables", async () => {
    await createTable({ label: "A", capacity: 2 });
    await createTable({ label: "B", capacity: 4 });
    const res = await tablesRoute.GET(authed("/api/admin/tables"));
    const json = await res.json();
    expect(json.tables).toHaveLength(2);
  });

  it("returns the day floor with ?date=", async () => {
    const { table } = await createTable({ label: "F1", capacity: 4 });
    const r = await booking({ time: "20:00" });
    await resIdRoute.PATCH(authed(`/api/admin/reservations/${r.id}`, { method: "PATCH", body: { tableId: table.id } }), params(r.id));
    const res = await tablesRoute.GET(authed("/api/admin/tables?date=2026-06-12"));
    const json = await res.json();
    expect(json.floor).toHaveLength(1);
    expect(json.floor[0].table.label).toBe("F1");
    expect(json.floor[0].reservations).toHaveLength(1);
  });
});

describe("PATCH/DELETE /api/admin/tables/[id]", () => {
  it("updates a table", async () => {
    const { table } = await createTable({ label: "9", capacity: 2 });
    const res = await tableIdRoute.PATCH(authed(`/api/admin/tables/${table.id}`, { method: "PATCH", body: { capacity: 6, zone: "Patio" } }), params(table.id));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.table.capacity).toBe(6);
    expect(json.table.zone).toBe("Patio");
  });

  it("404 on updating a missing table", async () => {
    const res = await tableIdRoute.PATCH(authed("/api/admin/tables/nope", { method: "PATCH", body: { capacity: 6 } }), params("nope"));
    expect(res.status).toBe(404);
  });

  it("soft-deletes (deactivates) a table", async () => {
    const { table } = await createTable({ label: "Z", capacity: 2 });
    const del = await tableIdRoute.DELETE(authed(`/api/admin/tables/${table.id}`, { method: "DELETE" }), params(table.id));
    expect(del.status).toBe(200);
    const list = await (await tablesRoute.GET(authed("/api/admin/tables"))).json();
    expect(list.tables.find((t: { id: string }) => t.id === table.id).active).toBe(false);
  });

  it("404 on deleting a missing table", async () => {
    const res = await tableIdRoute.DELETE(authed("/api/admin/tables/nope", { method: "DELETE" }), params("nope"));
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/admin/reservations/[id] — table assignment", () => {
  it("assigns a table and reflects it on the reservation", async () => {
    const { table } = await createTable({ label: "5", capacity: 4 });
    const r = await booking({ time: "20:00" });
    const res = await resIdRoute.PATCH(authed(`/api/admin/reservations/${r.id}`, { method: "PATCH", body: { tableId: table.id } }), params(r.id));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.reservation.tableId).toBe(table.id);
    expect(json.reservation.tableLabel).toBe("5");
  });

  it("409 when the table is already taken in an overlapping turn", async () => {
    const { table } = await createTable({ label: "5", capacity: 4 });
    const r1 = await booking({ time: "20:00" });
    const r2 = await booking({ time: "20:30" });
    await resIdRoute.PATCH(authed(`/api/admin/reservations/${r1.id}`, { method: "PATCH", body: { tableId: table.id } }), params(r1.id));
    const res = await resIdRoute.PATCH(authed(`/api/admin/reservations/${r2.id}`, { method: "PATCH", body: { tableId: table.id } }), params(r2.id));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/already taken/i);
  });

  it("unassigns with tableId null", async () => {
    const { table } = await createTable({ label: "5", capacity: 4 });
    const r = await booking({ time: "20:00" });
    await resIdRoute.PATCH(authed(`/api/admin/reservations/${r.id}`, { method: "PATCH", body: { tableId: table.id } }), params(r.id));
    const res = await resIdRoute.PATCH(authed(`/api/admin/reservations/${r.id}`, { method: "PATCH", body: { tableId: null } }), params(r.id));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.reservation.tableId).toBeUndefined();
  });

  it("assigns a table alongside other field edits in one PATCH", async () => {
    const { table } = await createTable({ label: "7", capacity: 6 });
    const r = await booking({ time: "20:00", party: 2 });
    const res = await resIdRoute.PATCH(authed(`/api/admin/reservations/${r.id}`, { method: "PATCH", body: { partySize: 5, tableId: table.id } }), params(r.id));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.reservation.partySize).toBe(5);
    expect(json.reservation.tableId).toBe(table.id);
  });
});

describe("GET /api/admin/reservations/[id]/table (suggest)", () => {
  it("suggests the smallest fitting free table", async () => {
    await createTable({ label: "big", capacity: 8 });
    const { table: small } = await createTable({ label: "small", capacity: 4 });
    const r = await booking({ time: "20:00", party: 3 });
    const res = await suggestRoute.GET(authed(`/api/admin/reservations/${r.id}/table`), params(r.id));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.table.id).toBe(small.id);
  });

  it("returns null when nothing fits", async () => {
    await createTable({ label: "tiny", capacity: 2 });
    const r = await booking({ time: "20:00", party: 6 });
    const res = await suggestRoute.GET(authed(`/api/admin/reservations/${r.id}/table`), params(r.id));
    const json = await res.json();
    expect(json.table).toBeNull();
  });

  it("404 for a missing reservation", async () => {
    const res = await suggestRoute.GET(authed("/api/admin/reservations/nope/table"), params("nope"));
    expect(res.status).toBe(404);
  });
});
