import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDB } from "mysql-memory-server";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";

type MySQLDB = Awaited<ReturnType<typeof createDB>>;
let db: MySQLDB;
let tenantId: string;

let wlRoute: typeof import("@/app/api/admin/waitlist/route");
let wlIdRoute: typeof import("@/app/api/admin/waitlist/[id]/route");
let seatRoute: typeof import("@/app/api/admin/waitlist/[id]/seat/route");
let tableStore: typeof import("@/lib/reservations/table-store");
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
const DATE = "2026-06-12";

beforeAll(async () => {
  db = await createDB({ version: "8.4.x" });
  process.env.MYSQL_HOST = "127.0.0.1";
  process.env.MYSQL_PORT = String(db.port);
  process.env.MYSQL_USER = db.username;
  process.env.MYSQL_PASSWORD = "";
  process.env.MYSQL_DATABASE = db.dbName;
  process.env.SESSION_SECRET = "waitlist-route-secret";

  auth = await import("@/lib/reservations/auth");
  poolMod = await import("@/lib/reservations/mysql-pool");
  store = await import("@/lib/reservations/store");
  tableStore = await import("@/lib/reservations/table-store");
  wlRoute = await import("@/app/api/admin/waitlist/route");
  wlIdRoute = await import("@/app/api/admin/waitlist/[id]/route");
  seatRoute = await import("@/app/api/admin/waitlist/[id]/seat/route");

  const { getTenantStore, resetTenantStore } = await import("@/lib/reservations/tenant-store");
  const { hashPassword, templateSettings } = await import("@/lib/reservations/tenant");
  const { ensureSchema } = await import("@/lib/reservations/mysql-schema");
  await ensureSchema();
  resetTenantStore();
  tenantId = randomUUID();
  await getTenantStore().create({
    id: tenantId,
    slug: "waitlist-test",
    name: "Waitlist Test",
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
  await p.query("DELETE FROM waitlist WHERE tenant_id = ?", [tenantId]);
  await p.query("DELETE FROM tables WHERE tenant_id = ?", [tenantId]);
});

async function add(body: Record<string, unknown>) {
  const res = await wlRoute.POST(authed("/api/admin/waitlist", { method: "POST", body: { date: DATE, ...body } }));
  const json = await res.json();
  return { res, entry: json.entry };
}

describe("auth", () => {
  it("401 without a session", async () => {
    expect((await wlRoute.GET(req(`/api/admin/waitlist?date=${DATE}`))).status).toBe(401);
    expect((await wlRoute.POST(req("/api/admin/waitlist", { method: "POST", body: {} }))).status).toBe(401);
    expect((await wlIdRoute.PATCH(req("/api/admin/waitlist/x", { method: "PATCH", body: {} }), params("x"))).status).toBe(401);
    expect((await wlIdRoute.DELETE(req("/api/admin/waitlist/x", { method: "DELETE" }), params("x"))).status).toBe(401);
    expect((await seatRoute.POST(req("/api/admin/waitlist/x/seat", { method: "POST" }), params("x"))).status).toBe(401);
  });
});

describe("POST /api/admin/waitlist (add)", () => {
  it("adds a party and quotes a wait", async () => {
    const { res, entry } = await add({ name: "Rossi", partySize: 3, phone: "555" });
    expect(res.status).toBe(201);
    expect(entry.name).toBe("Rossi");
    expect(entry.partySize).toBe(3);
    expect(entry.status).toBe("waiting");
    expect(entry.quotedWaitMin).toBeTypeOf("number");
  });

  it("400 without a name", async () => {
    const res = await wlRoute.POST(authed("/api/admin/waitlist", { method: "POST", body: { date: DATE, partySize: 2 } }));
    expect(res.status).toBe(400);
  });

  it("400 without a valid date", async () => {
    const res = await wlRoute.POST(authed("/api/admin/waitlist", { method: "POST", body: { name: "X", partySize: 2 } }));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/admin/waitlist", () => {
  it("400 without a valid date", async () => {
    expect((await wlRoute.GET(authed("/api/admin/waitlist"))).status).toBe(400);
    expect((await wlRoute.GET(authed("/api/admin/waitlist?date=bad"))).status).toBe(400);
  });

  it("lists entries and filters to active with ?active=1", async () => {
    await add({ name: "A", partySize: 2 });
    const { entry: b } = await add({ name: "B", partySize: 2 });
    await wlIdRoute.PATCH(authed(`/api/admin/waitlist/${b.id}`, { method: "PATCH", body: { status: "left" } }), params(b.id));

    const all = await (await wlRoute.GET(authed(`/api/admin/waitlist?date=${DATE}`))).json();
    expect(all.waitlist).toHaveLength(2);
    const active = await (await wlRoute.GET(authed(`/api/admin/waitlist?date=${DATE}&active=1`))).json();
    expect(active.waitlist).toHaveLength(1);
    expect(active.waitlist[0].name).toBe("A");
  });
});

describe("PATCH/DELETE /api/admin/waitlist/[id]", () => {
  it("changes status (notify)", async () => {
    const { entry } = await add({ name: "A", partySize: 2 });
    const res = await wlIdRoute.PATCH(authed(`/api/admin/waitlist/${entry.id}`, { method: "PATCH", body: { status: "notified" } }), params(entry.id));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.entry.status).toBe("notified");
    expect(json.entry.notifiedAt).toBeTruthy();
  });

  it("400 on an invalid status", async () => {
    const { entry } = await add({ name: "A", partySize: 2 });
    const res = await wlIdRoute.PATCH(authed(`/api/admin/waitlist/${entry.id}`, { method: "PATCH", body: { status: "bogus" } }), params(entry.id));
    expect(res.status).toBe(400);
  });

  it("404 for a missing entry", async () => {
    const res = await wlIdRoute.PATCH(authed("/api/admin/waitlist/nope", { method: "PATCH", body: { status: "left" } }), params("nope"));
    expect(res.status).toBe(404);
  });

  it("deletes an entry", async () => {
    const { entry } = await add({ name: "A", partySize: 2 });
    const del = await wlIdRoute.DELETE(authed(`/api/admin/waitlist/${entry.id}`, { method: "DELETE" }), params(entry.id));
    expect(del.status).toBe(200);
    const list = await (await wlRoute.GET(authed(`/api/admin/waitlist?date=${DATE}`))).json();
    expect(list.waitlist).toHaveLength(0);
  });

  it("404 deleting a missing entry", async () => {
    const res = await wlIdRoute.DELETE(authed("/api/admin/waitlist/nope", { method: "DELETE" }), params("nope"));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/admin/waitlist/[id]/seat", () => {
  it("seats a party — creates a seated reservation and marks the entry seated", async () => {
    const { entry } = await add({ name: "Verdi", partySize: 2 });
    const res = await seatRoute.POST(authed(`/api/admin/waitlist/${entry.id}/seat`, { method: "POST", body: { time: "20:00", service: "dinner" } }), params(entry.id));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.reservation.status).toBe("seated");
    expect(json.reservation.reference).toBeTruthy();

    const list = await (await wlRoute.GET(authed(`/api/admin/waitlist?date=${DATE}&active=1`))).json();
    expect(list.waitlist).toHaveLength(0); // no longer active
  });

  it("seats with a table assignment", async () => {
    const ts = new tableStore.TableStore(tenantId);
    const table = await ts.createTable({ label: "9", capacity: 4 });
    const { entry } = await add({ name: "Neri", partySize: 2 });
    const res = await seatRoute.POST(authed(`/api/admin/waitlist/${entry.id}/seat`, { method: "POST", body: { time: "20:00", service: "dinner", tableId: table.id } }), params(entry.id));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.tableWarning).toBeUndefined();
    expect(json.reservation.tableId).toBe(table.id);
  });

  it("defaults time/service when omitted", async () => {
    const { entry } = await add({ name: "Bianchi", partySize: 2 });
    const res = await seatRoute.POST(authed(`/api/admin/waitlist/${entry.id}/seat`, { method: "POST" }), params(entry.id));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.reservation.time).toMatch(/^\d{2}:\d{2}$/);
    expect(json.reservation.service).toBeTruthy();
  });

  it("409 when re-seating an already-seated party", async () => {
    const { entry } = await add({ name: "Gialli", partySize: 2 });
    await seatRoute.POST(authed(`/api/admin/waitlist/${entry.id}/seat`, { method: "POST", body: { time: "20:00", service: "dinner" } }), params(entry.id));
    const res = await seatRoute.POST(authed(`/api/admin/waitlist/${entry.id}/seat`, { method: "POST", body: { time: "20:30", service: "dinner" } }), params(entry.id));
    expect(res.status).toBe(409);
  });

  it("404 for a missing entry", async () => {
    const res = await seatRoute.POST(authed("/api/admin/waitlist/nope/seat", { method: "POST" }), params("nope"));
    expect(res.status).toBe(404);
  });
});
