import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDB } from "mysql-memory-server";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";

// Mock email so booking tests never touch SMTP and we can assert the wiring.
const sendConfirmationEmail = vi.hoisted(() => vi.fn(async () => ({ sent: true })));
vi.mock("@/lib/reservations/email", () => ({ sendConfirmationEmail }));

type MySQLDB = Awaited<ReturnType<typeof createDB>>;
let db: MySQLDB;
let tenantId: string;

// Route/handler + helper module handles, imported after env is configured.
let routes: {
  book: typeof import("@/app/api/reservations/route");
  avail: typeof import("@/app/api/availability/route");
  login: typeof import("@/app/api/admin/login/route");
  logout: typeof import("@/app/api/admin/logout/route");
  config: typeof import("@/app/api/admin/config/route");
  adminRes: typeof import("@/app/api/admin/reservations/route");
  adminResId: typeof import("@/app/api/admin/reservations/[id]/route");
  proxy: typeof import("@/proxy");
  store: typeof import("@/lib/reservations/store");
  auth: typeof import("@/lib/reservations/auth");
  pool: typeof import("@/lib/reservations/mysql-pool");
};

let ipCounter = 0;
const uniqueIp = () => `10.${Math.floor(ipCounter / 65536) % 256}.${Math.floor(ipCounter / 256) % 256}.${ipCounter++ % 256}`;

function req(url: string, init: { method?: string; body?: unknown; headers?: Record<string, string>; ip?: string } = {}) {
  // NextRequest does not auto-populate the Host header from the URL — set it
  // explicitly so hostOf(req) resolves to "localhost" and tenant lookup works.
  const headers: Record<string, string> = {
    host: "localhost",
    "x-forwarded-for": init.ip ?? uniqueIp(),
    ...(init.headers ?? {}),
  };
  let body: string | undefined;
  if (init.body !== undefined) {
    body = typeof init.body === "string" ? init.body : JSON.stringify(init.body);
    headers["content-type"] = "application/json";
    headers["content-length"] = String(Buffer.byteLength(body));
  }
  return new NextRequest(`http://localhost${url}`, { method: init.method ?? "GET", body, headers });
}

let adminCookie = "";
function adminReq(url: string, init: Parameters<typeof req>[1] = {}) {
  return req(url, { ...init, headers: { cookie: adminCookie, ...(init.headers ?? {}) } });
}

beforeAll(async () => {
  db = await createDB({ version: "8.4.x" });
  process.env.MYSQL_HOST = "127.0.0.1";
  process.env.MYSQL_PORT = String(db.port);
  process.env.MYSQL_USER = db.username;
  process.env.MYSQL_PASSWORD = "";
  process.env.MYSQL_DATABASE = db.dbName;
  process.env.SESSION_SECRET = "route-test-secret";

  routes = {
    book: await import("@/app/api/reservations/route"),
    avail: await import("@/app/api/availability/route"),
    login: await import("@/app/api/admin/login/route"),
    logout: await import("@/app/api/admin/logout/route"),
    config: await import("@/app/api/admin/config/route"),
    adminRes: await import("@/app/api/admin/reservations/route"),
    adminResId: await import("@/app/api/admin/reservations/[id]/route"),
    proxy: await import("@/proxy"),
    store: await import("@/lib/reservations/store"),
    auth: await import("@/lib/reservations/auth"),
    pool: await import("@/lib/reservations/mysql-pool"),
  };

  // Create a tenant mapped to "localhost" with known credentials.
  const { getTenantStore, resetTenantStore } = await import("@/lib/reservations/tenant-store");
  const { hashPassword, templateSettings } = await import("@/lib/reservations/tenant");
  resetTenantStore();
  const ts = getTenantStore();
  tenantId = randomUUID();
  await ts.create({
    id: tenantId,
    slug: "test-restaurant",
    name: "Test Restaurant",
    settings: templateSettings(),
    adminUsername: "staff",
    adminPasswordHash: hashPassword("s3cret"),
    hosts: ["localhost"],
  });

  adminCookie = `${routes.auth.SESSION_COOKIE}=${await routes.auth.createSession(tenantId, "staff")}`;
}, 180_000);

afterAll(async () => {
  if (db) await db.stop();
});

beforeEach(async () => {
  // Clean this tenant's reservations, config, and rate limits between tests.
  const pool = routes.pool.getPool();
  await pool.query("DELETE FROM reservations WHERE tenant_id = ?", [tenantId]);
  await pool.query("DELETE FROM app_config WHERE tenant_id = ?", [tenantId]);
  await pool.query("DELETE FROM rate_limits");

  sendConfirmationEmail.mockClear();
  // Only fake Date — mocking setImmediate/setTimeout breaks mysql2's async I/O.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-11T07:00:00Z")); // 09:00 Europe/Rome (summer)
});
afterEach(() => vi.useRealTimers());

/* ----------------------------- POST /api/reservations ----------------------------- */

describe("POST /api/reservations", () => {
  const valid = () => ({ date: "2026-06-12", time: "12:30", service: "lunch", partySize: 2, name: "Guest", email: "g@x.io", phone: "123456" });

  it("creates a confirmed booking and triggers the confirmation email", async () => {
    const res = await routes.book.POST(req("/api/reservations", { method: "POST", body: valid() }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.reference).toMatch(/^[A-Z0-9]{6}$/);
    expect(json.emailSent).toBe(true);
    expect(sendConfirmationEmail).toHaveBeenCalledOnce();

    const stored = await routes.store.getStore().forTenant(tenantId).listReservations({ date: "2026-06-12" });
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe("confirmed"); // autoConfirm
    expect(stored[0].source).toBe("web");
  });

  it("books with a legacy payload (no offering) and attributes it to 'main'", async () => {
    const res = await routes.book.POST(req("/api/reservations", { method: "POST", body: valid() }));
    expect(res.status).toBe(201);
    const stored = await routes.store.getStore().forTenant(tenantId).listReservations({ date: "2026-06-12" });
    expect(stored[0].offering).toBe("main");
  });

  it("persists optional occasion and notes when provided", async () => {
    const res = await routes.book.POST(req("/api/reservations", { method: "POST", body: { ...valid(), occasion: "Birthday", notes: "window seat" } }));
    expect(res.status).toBe(201);
    const stored = await routes.store.getStore().forTenant(tenantId).listReservations({ date: "2026-06-12" });
    expect(stored[0].occasion).toBe("Birthday");
    expect(stored[0].notes).toBe("window seat");
  });

  it("rejects a duplicate booking (same email/date/time) with 409", async () => {
    await routes.book.POST(req("/api/reservations", { method: "POST", body: valid() }));
    const res = await routes.book.POST(req("/api/reservations", { method: "POST", body: valid() }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already have a booking/i);
  });

  it("blocks MAX_ACTIVE when contact matched by phone even with a different email", async () => {
    vi.useRealTimers();
    // Seed two active future bookings directly via the store, using the same phone but different emails
    const s = routes.store.getStore().forTenant(tenantId);
    await s.createReservation({ date: "2026-06-20", time: "12:30", service: "lunch", partySize: 2, name: "A1", email: "a1@x.io", phone: "333111222" });
    await s.createReservation({ date: "2026-06-21", time: "12:30", service: "lunch", partySize: 2, name: "A2", email: "a2@x.io", phone: "333111222" });
    // Third booking via public API with same phone but yet another email → MAX_ACTIVE_PER_CONTACT
    const res = await routes.book.POST(req("/api/reservations", { method: "POST", body: { ...valid(), date: "2026-06-23", time: "12:30", email: "a3@x.io", phone: "333111222" } }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/maximum number of active/i);
  });

  it("rejects a booking on a closed day with 409", async () => {
    // 2026-06-14 is a Sunday (closed in the default config)
    const res = await routes.book.POST(req("/api/reservations", { method: "POST", body: { ...valid(), date: "2026-06-14" } }));
    expect(res.status).toBe(409);
  });

  it("rejects an invalid slot time with 409", async () => {
    const res = await routes.book.POST(req("/api/reservations", { method: "POST", body: { ...valid(), time: "12:17" } }));
    expect(res.status).toBe(409);
  });

  it("returns 400 on an invalid JSON body", async () => {
    const res = await routes.book.POST(req("/api/reservations", { method: "POST", body: "{not json", headers: { "content-type": "application/json" } }));
    expect(res.status).toBe(400);
  });

  it("returns 413 when the request body is too large", async () => {
    const big = { ...valid(), notes: "x".repeat(17_000) };
    const res = await routes.book.POST(req("/api/reservations", { method: "POST", body: big }));
    expect(res.status).toBe(413);
  });

  it("returns 429 after exceeding the per-IP rate limit", async () => {
    vi.useRealTimers(); // rate limiter uses real Date.now()
    const ip = "203.0.113.7";
    const codes: number[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await routes.book.POST(req("/api/reservations", { method: "POST", body: { ...valid(), email: `u${i}@x.io`, phone: `5550${i.toString().padStart(5, "0")}` }, ip }));
      codes.push(r.status);
    }
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
    expect(codes.slice(0, 8).every((c) => c !== 429)).toBe(true);
  });
});

/* ----------------------------- GET /api/availability ----------------------------- */

describe("GET /api/availability", () => {
  it("returns day slots for a date", async () => {
    const res = await routes.avail.GET(req("/api/availability?date=2026-06-12"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.date).toBe("2026-06-12");
    expect(json.services.length).toBeGreaterThan(0);
  });
  it("returns a month grid", async () => {
    const res = await routes.avail.GET(req("/api/availability?month=2026-06"));
    const json = await res.json();
    expect(json.days).toHaveLength(30);
    expect(json.bookingWindowDays).toBeGreaterThan(0);
  });
  it("400s on a malformed date and month", async () => {
    expect((await routes.avail.GET(req("/api/availability?date=nope"))).status).toBe(400);
    expect((await routes.avail.GET(req("/api/availability?month=2026-13"))).status).toBe(400);
    expect((await routes.avail.GET(req("/api/availability"))).status).toBe(400);
  });
  it("resolves the tenant by ?tenant=<publicKey>, independent of Host", async () => {
    const { getTenantStore } = await import("@/lib/reservations/tenant-store");
    const key = (await getTenantStore().getById(tenantId))!.publicKey;
    expect(key).toMatch(/^pk_/);
    // Explicit key + an unmapped host → still resolves (key wins).
    const viaKey = await routes.avail.GET(
      req(`/api/availability?month=2026-06&tenant=${key}`, { headers: { host: "unmapped.example.com" } }),
    );
    expect(viaKey.status).toBe(200);
    // Same unmapped host without a key → 404 (proves the key did the resolving).
    const viaHost = await routes.avail.GET(
      req("/api/availability?month=2026-06", { headers: { host: "unmapped.example.com" } }),
    );
    expect(viaHost.status).toBe(404);
  });
});

/* ----------------------------- admin login / logout ----------------------------- */

describe("admin auth routes", () => {
  it("logs in with correct credentials and sets a verifiable session cookie", async () => {
    vi.useRealTimers();
    const res = await routes.login.POST(req("/api/admin/login", { method: "POST", body: { username: "staff", password: "s3cret" } }));
    expect(res.status).toBe(200);
    const token = res.cookies.get(routes.auth.SESSION_COOKIE)?.value;
    expect(token).toBeTruthy();
    expect((await routes.auth.verifySession(token))?.u).toBe("staff");
  });
  it("400s on an invalid JSON login body", async () => {
    const res = await routes.login.POST(req("/api/admin/login", { method: "POST", body: "{bad", headers: { "content-type": "application/json" } }));
    expect(res.status).toBe(400);
  });
  it("rejects wrong credentials with 401 and no cookie", async () => {
    vi.useRealTimers();
    const res = await routes.login.POST(req("/api/admin/login", { method: "POST", body: { username: "staff", password: "nope" } }));
    expect(res.status).toBe(401);
    expect(res.cookies.get(routes.auth.SESSION_COOKIE)?.value).toBeFalsy();
  });
  it("throttles repeated login attempts from one IP", async () => {
    vi.useRealTimers();
    const ip = "203.0.113.9";
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await routes.login.POST(req("/api/admin/login", { method: "POST", body: { username: "x", password: "y" }, ip }));
      codes.push(r.status);
    }
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
  });
  it("clears the cookie on logout", async () => {
    const res = await routes.logout.POST();
    expect(res.status).toBe(200);
    expect(res.cookies.get(routes.auth.SESSION_COOKIE)?.value).toBe("");
  });
});

/* ----------------------------- admin config ----------------------------- */

describe("admin config routes", () => {
  it("GET returns the current config", async () => {
    const res = await routes.config.GET(adminReq("/api/admin/config"));
    const json = await res.json();
    expect(Object.keys(json.config.weekly)).toHaveLength(7);
  });
  it("PUT sanitises and persists the config", async () => {
    const cfg = (await (await routes.config.GET(adminReq("/api/admin/config"))).json()).config;
    cfg.bookingWindowDays = 99999; // will be clamped to 730
    cfg.dateOverrides = { "2026-12-25": { closed: true, services: [] } };
    const res = await routes.config.PUT(adminReq("/api/admin/config", { method: "PUT", body: { config: cfg } }));
    expect(res.status).toBe(200);
    const saved = (await res.json()).config;
    expect(saved.bookingWindowDays).toBe(730);
    expect(saved.dateOverrides["2026-12-25"]).toEqual({ closed: true, services: [] });
  });
  it("PUT 400s on a body without weekly", async () => {
    const res = await routes.config.PUT(adminReq("/api/admin/config", { method: "PUT", body: { config: { foo: 1 } } }));
    expect(res.status).toBe(400);
  });
  it("PUT 400s on invalid JSON", async () => {
    const res = await routes.config.PUT(adminReq("/api/admin/config", { method: "PUT", body: "{bad", headers: { "content-type": "application/json" } }));
    expect(res.status).toBe(400);
  });
});

/* ----------------------------- admin reservations ----------------------------- */

describe("admin reservations routes", () => {
  it("POST creates a manual booking (admin source, confirmed)", async () => {
    const res = await routes.adminRes.POST(adminReq("/api/admin/reservations", { method: "POST", body: { date: "2026-06-12", time: "20:00", service: "dinner", name: "Walk In", partySize: 4 } }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.reservation.source).toBe("admin");
    expect(json.reservation.status).toBe("confirmed");
    expect(json.reservation.reference).toMatch(/^[A-Z0-9]{6}$/);
  });
  it("POST 400s when required fields are missing", async () => {
    const res = await routes.adminRes.POST(adminReq("/api/admin/reservations", { method: "POST", body: { date: "2026-06-12" } }));
    expect(res.status).toBe(400);
  });
  it("GET lists reservations with a reference, filtered by date", async () => {
    await routes.adminRes.POST(adminReq("/api/admin/reservations", { method: "POST", body: { date: "2026-06-12", time: "20:00", service: "dinner", name: "A", partySize: 2 } }));
    await routes.adminRes.POST(adminReq("/api/admin/reservations", { method: "POST", body: { date: "2026-06-13", time: "20:00", service: "dinner", name: "B", partySize: 2 } }));
    const res = await routes.adminRes.GET(adminReq("/api/admin/reservations?date=2026-06-12"));
    const json = await res.json();
    expect(json.reservations).toHaveLength(1);
    expect(json.reservations[0].reference).toMatch(/^[A-Z0-9]{6}$/);
  });
  it("GET supports global q search across name/email/phone/reference", async () => {
    await routes.adminRes.POST(adminReq("/api/admin/reservations", { method: "POST", body: { date: "2026-06-12", time: "20:00", service: "dinner", name: "Zelda Fitzgerald", email: "z@x.io", partySize: 2 } }));
    const res = await routes.adminRes.GET(adminReq("/api/admin/reservations?q=zelda"));
    const json = await res.json();
    expect(json.reservations).toHaveLength(1);
    expect(json.reservations[0].name).toBe("Zelda Fitzgerald");
  });
  it("POST 400s on invalid JSON", async () => {
    const res = await routes.adminRes.POST(adminReq("/api/admin/reservations", { method: "POST", body: "{bad", headers: { "content-type": "application/json" } }));
    expect(res.status).toBe(400);
  });
  it("GET q search returns empty for no matches", async () => {
    await routes.adminRes.POST(adminReq("/api/admin/reservations", { method: "POST", body: { date: "2026-06-12", time: "20:00", service: "dinner", name: "A", partySize: 2 } }));
    const res = await routes.adminRes.GET(adminReq("/api/admin/reservations?q=nonexistent"));
    expect((await res.json()).reservations).toHaveLength(0);
  });
  it("PATCH 400s on invalid JSON", async () => {
    const res = await routes.adminResId.PATCH(
      adminReq("/api/admin/reservations/x", { method: "PATCH", body: "{bad", headers: { "content-type": "application/json" } }),
      { params: Promise.resolve({ id: "x" }) },
    );
    expect(res.status).toBe(400);
  });
  it("PATCH updates status, DELETE removes, both 404 on unknown id", async () => {
    const created = (await (await routes.adminRes.POST(adminReq("/api/admin/reservations", { method: "POST", body: { date: "2026-06-12", time: "20:00", service: "dinner", name: "C", partySize: 2 } }))).json()).reservation;

    const patched = await routes.adminResId.PATCH(
      adminReq(`/api/admin/reservations/${created.id}`, { method: "PATCH", body: { status: "seated" } }), { params: Promise.resolve({ id: created.id }) });
    expect(patched.status).toBe(200);
    expect((await patched.json()).reservation.status).toBe("seated");

    const badStatus = await routes.adminResId.PATCH(
      adminReq(`/api/admin/reservations/${created.id}`, { method: "PATCH", body: { status: "teleported" } }), { params: Promise.resolve({ id: created.id }) });
    expect(badStatus.status).toBe(400);

    const missing = await routes.adminResId.PATCH(
      adminReq("/api/admin/reservations/nope", { method: "PATCH", body: { status: "seated" } }), { params: Promise.resolve({ id: "nope" }) });
    expect(missing.status).toBe(404);

    const del = await routes.adminResId.DELETE(adminReq(`/api/admin/reservations/${created.id}`, { method: "DELETE" }), { params: Promise.resolve({ id: created.id }) });
    expect(del.status).toBe(200);
    const delAgain = await routes.adminResId.DELETE(adminReq(`/api/admin/reservations/${created.id}`, { method: "DELETE" }), { params: Promise.resolve({ id: created.id }) });
    expect(delAgain.status).toBe(404);
  });
});

/* ----------------------------- proxy (auth gate) ----------------------------- */

describe("proxy auth gate", () => {
  it("lets the login endpoints through unauthenticated", async () => {
    const res = await routes.proxy.proxy(req("/admin/login"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Robots-Tag")).toContain("noindex");
  });
  it("401s an unauthenticated admin API request", async () => {
    const res = await routes.proxy.proxy(req("/api/admin/reservations"));
    expect(res.status).toBe(401);
  });
  it("redirects an unauthenticated admin page to /admin/login with a next param", async () => {
    const res = await routes.proxy.proxy(req("/admin/reservations"));
    expect([307, 308]).toContain(res.status);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/admin/login");
    expect(loc).toContain("next=%2Fadmin%2Freservations");
  });
  it("allows access with a valid session cookie", async () => {
    const token = await routes.auth.createSession(tenantId, "staff");
    const res = await routes.proxy.proxy(req("/api/admin/reservations", { headers: { cookie: `${routes.auth.SESSION_COOKIE}=${token}` } }));
    expect(res.status).toBe(200);
  });
  it("rejects a tampered session cookie on an admin page", async () => {
    const res = await routes.proxy.proxy(req("/admin/reservations", { headers: { cookie: `${routes.auth.SESSION_COOKIE}=forged.token` } }));
    expect([307, 308]).toContain(res.status);
  });
});
