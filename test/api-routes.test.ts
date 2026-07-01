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
  tenant: typeof import("@/app/api/tenant/route");
  lookup: typeof import("@/app/api/reservations/lookup/route");
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
    tenant: await import("@/app/api/tenant/route"),
    lookup: await import("@/app/api/reservations/lookup/route"),
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
  await pool.query("DELETE FROM app_events").catch(() => {});
  const { getTenantStore } = await import("@/lib/reservations/tenant-store");
  const { clearTenantCache } = await import("@/lib/reservations/tenant-context");
  const tenant = (await getTenantStore().getById(tenantId))!;
  await getTenantStore().updateSettings(tenantId, {
    ...tenant.settings,
    name: "Test Restaurant",
    autoConfirm: true,
    allowedOrigins: undefined,
  });
  clearTenantCache();

  sendConfirmationEmail.mockClear();
  // Only fake Date — mocking setImmediate/setTimeout breaks mysql2's async I/O.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-11T07:00:00Z")); // 09:00 Europe/Rome (summer)
});
afterEach(() => vi.useRealTimers());

/* ----------------------------- POST /api/reservations ----------------------------- */

describe("POST /api/reservations", () => {
  const valid = () => ({ date: "2026-06-12", time: "12:30", service: "lunch", partySize: 2, name: "Guest", email: "g@x.io", phone: "123456", _t: Date.now() - 2_000 });

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

    const { listAppEvents } = await import("@/lib/observability/app-event-store");
    const events = await listAppEvents({ tenantId, event: "public.booking.created" });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: "public.booking.created",
      surface: "public",
      tenantId,
      reservationId: stored[0].id,
      status: 201,
    });
  });

  it("does not send confirmation wording while autoConfirm=false leaves booking pending", async () => {
    const { getTenantStore } = await import("@/lib/reservations/tenant-store");
    const { clearTenantCache } = await import("@/lib/reservations/tenant-context");
    const ts = getTenantStore();
    const tenant = (await ts.getById(tenantId))!;
    await ts.updateSettings(tenantId, { ...tenant.settings, autoConfirm: false });
    clearTenantCache();

    const res = await routes.book.POST(req("/api/reservations", { method: "POST", body: valid() }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ok: true, emailSent: false });
    expect(sendConfirmationEmail).not.toHaveBeenCalled();
    const stored = await routes.store.getStore().forTenant(tenantId).listReservations({ date: "2026-06-12" });
    expect(stored[0].status).toBe("pending");
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

  it("returns neutral fake success for missing, invalid or implausible timing tokens", async () => {
    const variants = [
      { label: "missing", patch: {} },
      { label: "invalid", patch: { _t: "not-a-number" } },
      { label: "too-fast", patch: { _t: Date.now() } },
      { label: "future", patch: { _t: Date.now() + 10_000 } },
      { label: "stale", patch: { _t: Date.now() - 2 * 60 * 60_000 - 1 } },
    ];

    for (const { label, patch } of variants) {
      const body = { ...valid(), email: `${label}@x.io`, phone: `555${label.length}12345`, ...patch };
      if (label === "missing") delete (body as { _t?: number })._t;
      const res = await routes.book.POST(req("/api/reservations", { method: "POST", body }));
      expect(res.status, label).toBe(201);
      expect(await res.json(), label).toEqual({ ok: true, reference: "000000", emailSent: false });
    }

    const stored = await routes.store.getStore().forTenant(tenantId).listReservations({ date: "2026-06-12" });
    expect(stored).toHaveLength(0);
    expect(sendConfirmationEmail).not.toHaveBeenCalled();

    const { listAppEvents } = await import("@/lib/observability/app-event-store");
    const events = await listAppEvents({ tenantId, limit: 20 });
    expect(events.map((e) => e.event)).toEqual(expect.arrayContaining([
      "public.booking.fake_success.timing_invalid",
      "public.booking.fake_success.timing_too_fast",
      "public.booking.fake_success.timing_stale",
    ]));
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

/* ----------------------------- marketing-site integration ----------------------------- */

describe("public marketing-site integration", () => {
  const marketingOrigin = "https://bookings.example.com";
  const guest = () => ({
    date: "2026-06-12",
    time: "12:30",
    service: "lunch",
    partySize: 2,
    name: "Marketing Guest",
    email: "marketing.guest@example.com",
    phone: "+39 055 123456",
    _t: Date.now() - 2_000,
  });

  async function publicKeyForMarketingOrigin() {
    const { getTenantStore } = await import("@/lib/reservations/tenant-store");
    const { clearTenantCache } = await import("@/lib/reservations/tenant-context");
    const ts = getTenantStore();
    const tenant = (await ts.getById(tenantId))!;
    await ts.updateSettings(tenantId, {
      ...tenant.settings,
      name: tenant.name,
      allowedOrigins: [marketingOrigin.toLowerCase()],
    });
    clearTenantCache();
    return tenant.publicKey;
  }

  function marketingReq(path: string, init: Parameters<typeof req>[1] = {}) {
    return req(path, {
      ...init,
      headers: {
        host: "reservations.example.test",
        origin: marketingOrigin,
        ...(init.headers ?? {}),
      },
    });
  }

  function expectMarketingCors(res: Response) {
    expect(res.headers.get("access-control-allow-origin")).toBe(marketingOrigin);
    expect(res.headers.get("vary")).toContain("Origin");
  }

  it("supports the complete cross-origin booking widget flow by public tenant key", async () => {
    const publicKey = await publicKeyForMarketingOrigin();
    const tenantParam = `tenant=${encodeURIComponent(publicKey)}`;

    const brandingPreflight = await routes.tenant.OPTIONS(
      marketingReq(`/api/tenant?${tenantParam}`, {
        method: "OPTIONS",
        headers: { "access-control-request-method": "GET" },
      }),
    );
    expect(brandingPreflight.status).toBe(204);
    expectMarketingCors(brandingPreflight);

    const branding = await routes.tenant.GET(marketingReq(`/api/tenant?${tenantParam}`));
    expect(branding.status).toBe(200);
    expectMarketingCors(branding);
    expect(await branding.json()).toMatchObject({ name: "Test Restaurant" });

    const month = await routes.avail.GET(marketingReq(`/api/availability?month=2026-06&${tenantParam}`));
    expect(month.status).toBe(200);
    expectMarketingCors(month);
    const monthJson = await month.json();
    expect(monthJson.days).toHaveLength(30);
    expect(monthJson.offerings[0]).toMatchObject({ id: "main" });

    const bookingGuest = guest();

    const day = await routes.avail.GET(marketingReq(`/api/availability?date=${bookingGuest.date}&${tenantParam}`));
    expect(day.status).toBe(200);
    expectMarketingCors(day);
    const dayJson = await day.json();
    expect(dayJson.services[0].slots.some((slot: { time: string; available: boolean }) => slot.time === bookingGuest.time && slot.available)).toBe(true);

    const bookingPreflight = await routes.book.OPTIONS(
      marketingReq(`/api/reservations?${tenantParam}`, {
        method: "OPTIONS",
        headers: { "access-control-request-method": "POST" },
      }),
    );
    expect(bookingPreflight.status).toBe(204);
    expectMarketingCors(bookingPreflight);

    const booking = await routes.book.POST(
      marketingReq(`/api/reservations?${tenantParam}`, {
        method: "POST",
        body: bookingGuest,
      }),
    );
    expect(booking.status).toBe(201);
    expectMarketingCors(booking);
    expect(await booking.json()).toMatchObject({ ok: true, emailSent: true });

    const lookup = await routes.lookup.POST(
      marketingReq(`/api/reservations/lookup?${tenantParam}`, {
        method: "POST",
        body: { email: bookingGuest.email, phone: bookingGuest.phone },
      }),
    );
    expect(lookup.status).toBe(200);
    expectMarketingCors(lookup);
    const lookupJson = await lookup.json();
    expect(lookupJson.reservations).toHaveLength(1);
    expect(lookupJson.reservations[0]).toMatchObject({
      date: bookingGuest.date,
      time: bookingGuest.time,
      partySize: bookingGuest.partySize,
      name: bookingGuest.name,
      status: "confirmed",
    });
    expect(lookupJson.reservations[0].reference).toMatch(/^[A-Z0-9]{6}$/);
    expect(lookupJson.reservations[0].id).toBeUndefined();

    const blockedPreflight = await routes.avail.OPTIONS(
      req(`/api/availability?month=2026-06&${tenantParam}`, {
        method: "OPTIONS",
        headers: {
          host: "reservations.example.test",
          origin: "https://not-allowed.example.com",
          "access-control-request-method": "GET",
        },
      }),
    );
    expect(blockedPreflight.status).toBe(403);
  });
});

/* ----------------------------- lookup bot protection ----------------------------- */

describe("POST /api/reservations/lookup bot protection", () => {
  const contact = () => ({ email: "lookup-guest@example.com", phone: "+39 333 123 4567" });

  it("returns neutral success for a filled honeypot without consuming IP lookup quota", async () => {
    const ip = "203.0.113.40";
    for (let i = 0; i < 8; i++) {
      const bot = await routes.lookup.POST(req("/api/reservations/lookup", {
        method: "POST",
        ip,
        body: { ...contact(), _hp: "website" },
      }));
      expect(bot.status).toBe(200);
      expect(await bot.json()).toEqual({ reservations: [] });
    }

    const real = await routes.lookup.POST(req("/api/reservations/lookup", {
      method: "POST",
      ip,
      body: contact(),
    }));
    expect(real.status).toBe(200);
    expect(await real.json()).toEqual({ reservations: [] });
  });

  it("returns neutral success for too-fast timing without consuming IP lookup quota", async () => {
    const ip = "203.0.113.41";
    for (let i = 0; i < 8; i++) {
      const bot = await routes.lookup.POST(req("/api/reservations/lookup", {
        method: "POST",
        ip,
        body: { ...contact(), _t: Date.now() },
      }));
      expect(bot.status).toBe(200);
      expect(await bot.json()).toEqual({ reservations: [] });
    }

    const real = await routes.lookup.POST(req("/api/reservations/lookup", {
      method: "POST",
      ip,
      body: { ...contact(), _t: Date.now() - 2_000 },
    }));
    expect(real.status).toBe(200);
    expect(await real.json()).toEqual({ reservations: [] });
  });

  it("rate-limits repeated normalized email/phone lookup attempts across IPs", async () => {
    for (let i = 0; i < 5; i++) {
      const ok = await routes.lookup.POST(req("/api/reservations/lookup", {
        method: "POST",
        ip: `198.51.100.${i + 1}`,
        body: { email: " LOOKUP-GUEST@EXAMPLE.COM ", phone: i % 2 === 0 ? "+39 333 123 4567" : "0039-333-123-4567" },
      }));
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ reservations: [] });
    }

    const blocked = await routes.lookup.POST(req("/api/reservations/lookup", {
      method: "POST",
      ip: "198.51.100.99",
      body: { email: "lookup-guest@example.com", phone: "3331234567" },
    }));
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toMatch(/too many/i);
  });
});

/* ----------------------------- guest self-service lookup changes ----------------------------- */

describe("public reservation self-service", () => {
  const guest = () => ({ date: "2026-06-12", time: "12:30", service: "lunch", partySize: 2, name: "Guest", email: "guest-self@example.com", phone: "555123456", _t: Date.now() - 2_000 });

  async function createGuest() {
    const created = await routes.book.POST(req("/api/reservations", { method: "POST", body: guest() }));
    return (await created.json()).reference as string;
  }

  it("modifies an active reservation when email, phone and reference match", async () => {
    const reference = await createGuest();
    const res = await routes.lookup.PATCH(req("/api/reservations/lookup", {
      method: "PATCH",
      body: {
        email: guest().email,
        phone: guest().phone,
        reference,
        time: "13:30",
        partySize: 3,
        notes: "Updated online",
      },
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reservation).toMatchObject({ reference, time: "13:30", partySize: 3 });
    const stored = (await routes.store.getStore().forTenant(tenantId).findByContact(guest().email, guest().phone))[0];
    expect(stored.notes).toBe("Updated online");
    expect(stored.tableId).toBeUndefined();
  });

  it("cancels an active reservation instead of deleting it", async () => {
    const reference = await createGuest();
    const res = await routes.lookup.DELETE(req("/api/reservations/lookup", {
      method: "DELETE",
      body: { email: guest().email, phone: guest().phone, reference },
    }));
    expect(res.status).toBe(200);
    expect((await res.json()).reservation.status).toBe("cancelled");
    const stored = (await routes.store.getStore().forTenant(tenantId).findByContact(guest().email, guest().phone))[0];
    expect(stored.status).toBe("cancelled");
  });

  it("rejects self-service changes for the wrong contact", async () => {
    const reference = await createGuest();
    const res = await routes.lookup.PATCH(req("/api/reservations/lookup", {
      method: "PATCH",
      body: { email: "wrong@example.com", phone: guest().phone, reference, time: "13:30" },
    }));
    expect(res.status).toBe(404);
  });
});

/* ----------------------------- admin login / logout ----------------------------- */

describe("admin auth routes", () => {
  it("logs in with correct credentials and sets a verifiable session cookie", async () => {
    vi.useRealTimers();
    const res = await routes.login.POST(req("/api/admin/login", { method: "POST", body: { slug: "test-restaurant", username: "staff", password: "s3cret" } }));
    expect(res.status).toBe(200);
    const token = res.cookies.get(routes.auth.SESSION_COOKIE)?.value;
    expect(token).toBeTruthy();
    expect((await routes.auth.verifySession(token))?.u).toBe("staff");
  });
  it("404s when the login slug matches no tenant", async () => {
    const res = await routes.login.POST(req("/api/admin/login", { method: "POST", body: { slug: "does-not-exist", username: "staff", password: "s3cret" } }));
    expect(res.status).toBe(404);
    expect(res.cookies.get(routes.auth.SESSION_COOKIE)?.value).toBeFalsy();
  });
  it("400s on an invalid JSON login body", async () => {
    const res = await routes.login.POST(req("/api/admin/login", { method: "POST", body: "{bad", headers: { "content-type": "application/json" } }));
    expect(res.status).toBe(400);
  });
  it("rejects wrong credentials with 401 and no cookie", async () => {
    vi.useRealTimers();
    const res = await routes.login.POST(req("/api/admin/login", { method: "POST", body: { slug: "test-restaurant", username: "staff", password: "nope" } }));
    expect(res.status).toBe(401);
    expect(res.cookies.get(routes.auth.SESSION_COOKIE)?.value).toBeFalsy();
  });
  it("throttles repeated login attempts from one IP", async () => {
    vi.useRealTimers();
    const ip = "203.0.113.9";
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await routes.login.POST(req("/api/admin/login", { method: "POST", body: { slug: "test-restaurant", username: "x", password: "y" }, ip }));
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
  it("POST persists table assignment fields for manual bookings", async () => {
    const res = await routes.adminRes.POST(adminReq("/api/admin/reservations", {
      method: "POST",
      body: {
        date: "2026-06-12",
        time: "20:00",
        service: "dinner",
        name: "Walk In",
        partySize: 4,
        tableId: "table-1",
        tableLabel: "Patio 1",
      },
    }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.reservation.tableId).toBe("table-1");
    expect(json.reservation.tableLabel).toBe("Patio 1");
  });
  it("POST 400s when required fields are missing", async () => {
    const res = await routes.adminRes.POST(adminReq("/api/admin/reservations", { method: "POST", body: { date: "2026-06-12" } }));
    expect(res.status).toBe(400);
  });
  it("rejects cross-site admin mutations by Origin header", async () => {
    const res = await routes.adminRes.POST(adminReq("/api/admin/reservations", {
      method: "POST",
      headers: { origin: "https://evil.example.com", "sec-fetch-site": "cross-site" },
      body: { date: "2026-06-12", time: "20:00", service: "dinner", name: "X", partySize: 2 },
    }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/cross-site/i);
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
  it("lets the slug login page + login API through unauthenticated", async () => {
    const page = await routes.proxy.proxy(req("/admin/test-restaurant/login"));
    expect(page.status).toBe(200);
    expect(page.headers.get("X-Robots-Tag")).toContain("noindex");
    const api = await routes.proxy.proxy(req("/api/admin/login", { method: "POST" }));
    expect(api.status).toBe(200);
  });
  it("lets the bare /admin landing through unauthenticated", async () => {
    const res = await routes.proxy.proxy(req("/admin"));
    expect(res.status).toBe(200);
  });
  it("401s an unauthenticated admin API request", async () => {
    const res = await routes.proxy.proxy(req("/api/admin/reservations"));
    expect(res.status).toBe(401);
  });
  it("redirects an unauthenticated admin page to the tenant's login with a next param", async () => {
    const res = await routes.proxy.proxy(req("/admin/test-restaurant/reservations"));
    expect([307, 308]).toContain(res.status);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/admin/test-restaurant/login");
    expect(loc).toContain("next=%2Fadmin%2Ftest-restaurant%2Freservations");
  });
  it("allows access with a valid session cookie", async () => {
    const token = await routes.auth.createSession(tenantId, "staff");
    const res = await routes.proxy.proxy(req("/api/admin/reservations", { headers: { cookie: `${routes.auth.SESSION_COOKIE}=${token}` } }));
    expect(res.status).toBe(200);
  });
  it("rejects a tampered session cookie on an admin page", async () => {
    const res = await routes.proxy.proxy(req("/admin/test-restaurant/reservations", { headers: { cookie: `${routes.auth.SESSION_COOKIE}=forged.token` } }));
    expect([307, 308]).toContain(res.status);
  });
});
