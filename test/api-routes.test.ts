import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDB } from "mysql-memory-server";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";

// Mock email so booking tests never touch SMTP and we can assert the wiring.
const sendConfirmationEmail = vi.hoisted(() => vi.fn(async () => ({ sent: true })));
const sendCancellationEmail = vi.hoisted(() => vi.fn(async () => ({ sent: true })));
vi.mock("@/lib/reservations/email", () => ({ sendConfirmationEmail, sendCancellationEmail }));

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
  adminAvail: typeof import("@/app/api/admin/availability/route");
  config: typeof import("@/app/api/admin/config/route");
  slotBlocks: typeof import("@/app/api/admin/slot-blocks/route");
  slotCapacity: typeof import("@/app/api/admin/slot-capacity/route");
  capacitySettings: typeof import("@/app/api/admin/settings/capacity/route");
  todayControls: typeof import("@/app/api/admin/today-booking-controls/route");
  adminRes: typeof import("@/app/api/admin/reservations/route");
  adminResId: typeof import("@/app/api/admin/reservations/[id]/route");
  adminNotifications: typeof import("@/app/api/admin/notifications/route");
  adminNotificationId: typeof import("@/app/api/admin/notifications/[id]/route");
  proxy: typeof import("@/proxy");
  store: typeof import("@/lib/reservations/store");
  auth: typeof import("@/lib/reservations/auth");
  pool: typeof import("@/lib/reservations/mysql-pool");
  notificationStore: typeof import("@/lib/reservations/notification-store");
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
    adminAvail: await import("@/app/api/admin/availability/route"),
    config: await import("@/app/api/admin/config/route"),
    slotBlocks: await import("@/app/api/admin/slot-blocks/route"),
    slotCapacity: await import("@/app/api/admin/slot-capacity/route"),
    capacitySettings: await import("@/app/api/admin/settings/capacity/route"),
    todayControls: await import("@/app/api/admin/today-booking-controls/route"),
    adminRes: await import("@/app/api/admin/reservations/route"),
    adminResId: await import("@/app/api/admin/reservations/[id]/route"),
    adminNotifications: await import("@/app/api/admin/notifications/route"),
    adminNotificationId: await import("@/app/api/admin/notifications/[id]/route"),
    proxy: await import("@/proxy"),
    store: await import("@/lib/reservations/store"),
    auth: await import("@/lib/reservations/auth"),
    pool: await import("@/lib/reservations/mysql-pool"),
    notificationStore: await import("@/lib/reservations/notification-store"),
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
  await pool.query("DELETE FROM external_reservation_links WHERE tenant_id = ?", [tenantId]).catch(() => {});
  await pool.query("DELETE FROM tenant_thefork_integrations WHERE tenant_id = ?", [tenantId]).catch(() => {});
  await pool.query("DELETE FROM tenant_dish_integrations WHERE tenant_id = ?", [tenantId]).catch(() => {});
  await pool.query("DELETE FROM tenant_notifications WHERE tenant_id = ?", [tenantId]).catch(() => {});
  await pool.query("DELETE FROM reservations WHERE tenant_id = ?", [tenantId]);
  await pool.query("DELETE FROM tables WHERE tenant_id = ?", [tenantId]);
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
  sendCancellationEmail.mockClear();
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

  it("validates public bookings against manual slot capacity instead of table seats", async () => {
    const { getTableStore } = await import("@/lib/reservations/table-store");
    await getTableStore(tenantId).createTable({ label: "A", capacity: 50 });
    const store = routes.store.getStore().forTenant(tenantId);
    await store.saveConfig({
      ...(await store.getConfig()),
      capacityMode: "manual",
      slotCapacityOverrides: {
        "2026-06-12": { main: { lunch: { "12:30": 1 } } },
      },
    });

    const res = await routes.book.POST(req("/api/reservations", {
      method: "POST",
      body: { ...valid(), partySize: 2 },
    }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/only 1 cover left/i);
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
    expect(json.services[0]).toMatchObject({ id: "lunch", label: "Lunch", labelEn: "Lunch", labelIt: "Pranzo" });
    expect(json.reservationPolicy.maxPartySize).toBe(12);
  });
  it("derives public slot capacity from active tables when configured", async () => {
    const { getTableStore } = await import("@/lib/reservations/table-store");
    const tables = getTableStore(tenantId);
    await tables.createTable({ label: "A", capacity: 4 });
    await tables.createTable({ label: "B", capacity: 6 });

    const res = await routes.avail.GET(req("/api/availability?date=2026-06-12"));
    expect(res.status).toBe(200);
    const json = await res.json();
    const slot = json.services[0].slots.find((s: { time: string }) => s.time === "12:30");
    expect(slot).toMatchObject({ capacity: 10, remaining: 10, available: true });
  });
  it("uses manual slot capacity overrides in the public day availability API even when tables exist", async () => {
    const { getTableStore } = await import("@/lib/reservations/table-store");
    await getTableStore(tenantId).createTable({ label: "A", capacity: 50 });
    const store = routes.store.getStore().forTenant(tenantId);
    await store.saveConfig({
      ...(await store.getConfig()),
      capacityMode: "manual",
      slotCapacityOverrides: {
        "2026-06-12": { main: { lunch: { "12:30": 6 } } },
      },
    });

    const res = await routes.avail.GET(req("/api/availability?date=2026-06-12"));
    expect(res.status).toBe(200);
    const json = await res.json();
    const slot = json.services[0].slots.find((s: { time: string }) => s.time === "12:30");
    expect(json.capacityMode).toBe("manual");
    expect(slot).toMatchObject({ capacity: 6, remaining: 6, available: true });
  });
  it("uses manual forward capacity overrides in the public month availability API", async () => {
    const store = routes.store.getStore().forTenant(tenantId);
    const config = await store.getConfig();
    const singleSlotDay = {
      closed: false,
      services: [{ id: "lunch", label: "Lunch", start: "12:30", end: "12:30", interval: 30, capacity: 20 }],
    };
    const nextConfig = {
      ...config,
      capacityMode: "manual" as const,
      minPartySize: 1,
      dateOverrides: { ...config.dateOverrides, "2026-06-12": singleSlotDay },
      forwardSlotCapacityOverrides: {
        main: { lunch: { "12:30": [{ effectiveFrom: "2026-06-12", capacity: 0 }] } },
      },
    };
    if (nextConfig.offerings?.[0]) {
      nextConfig.offerings = nextConfig.offerings.map((offering, index) =>
        index === 0
          ? { ...offering, dateOverrides: { ...offering.dateOverrides, "2026-06-12": singleSlotDay } }
          : offering,
      );
    }
    await store.saveConfig({
      ...nextConfig,
    });

    const res = await routes.avail.GET(req("/api/availability?month=2026-06"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.days.find((d: { date: string }) => d.date === "2026-06-12")).toMatchObject({ status: "full" });

    const day = await routes.avail.GET(req("/api/availability?date=2026-06-12"));
    const dayJson = await day.json();
    expect(dayJson.services[0].slots.find((s: { time: string }) => s.time === "12:30")).toMatchObject({
      capacity: 0,
      available: false,
      unavailableReason: "capacity",
    });
  });
  it("returns a month grid", async () => {
    const res = await routes.avail.GET(req("/api/availability?month=2026-06"));
    const json = await res.json();
    expect(json.days).toHaveLength(30);
    expect(json.bookingWindowDays).toBeGreaterThan(0);
    expect(json.reservationPolicy.maxPartySize).toBe(12);
  });
  it("returns public offerings with reservation policy from config", async () => {
    const store = routes.store.getStore().forTenant(tenantId);
    const config = await store.getConfig();
    await store.saveConfig({ ...config, maxPartySize: 20 });

    const res = await routes.avail.GET(req("/api/availability?offerings=1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.offerings[0]).toMatchObject({ id: "main" });
    expect(json.offerings[0].services[0]).toMatchObject({ id: "lunch", labelEn: "Lunch", labelIt: "Pranzo" });
    expect(json.reservationPolicy).toEqual({ maxPartySize: 20 });
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

    const store = routes.store.getStore().forTenant(tenantId);
    const config = await store.getConfig();
    await store.saveConfig({ ...config, maxPartySize: 20 });

    const branding = await routes.tenant.GET(marketingReq(`/api/tenant?${tenantParam}`));
    expect(branding.status).toBe(200);
    expectMarketingCors(branding);
    expect(await branding.json()).toMatchObject({
      name: "Test Restaurant",
      reservationPolicy: { maxPartySize: 20 },
    });

    const month = await routes.avail.GET(marketingReq(`/api/availability?month=2026-06&${tenantParam}`));
    expect(month.status).toBe(200);
    expectMarketingCors(month);
    const monthJson = await month.json();
    expect(monthJson.days).toHaveLength(30);
    expect(monthJson.offerings[0]).toMatchObject({ id: "main" });
    expect(monthJson.reservationPolicy).toEqual({ maxPartySize: 20 });

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
      serviceLabelEn: "Lunch",
      serviceLabelIt: "Pranzo",
    });
    expect(lookupJson.reservations[0].reference).toMatch(/^[A-Z0-9]{6}$/);
    expect(lookupJson.reservations[0].id).toBeUndefined();

    const cancelPreflight = await routes.lookup.OPTIONS(
      marketingReq(`/api/reservations/lookup?${tenantParam}`, {
        method: "OPTIONS",
        headers: { "access-control-request-method": "DELETE" },
      }),
    );
    expect(cancelPreflight.status).toBe(204);
    expectMarketingCors(cancelPreflight);

    const cancel = await routes.lookup.DELETE(
      marketingReq(`/api/reservations/lookup?${tenantParam}`, {
        method: "DELETE",
        body: {
          email: bookingGuest.email,
          phone: bookingGuest.phone,
          reference: lookupJson.reservations[0].reference,
        },
      }),
    );
    expect(cancel.status).toBe(200);
    expectMarketingCors(cancel);
    const cancelJson = await cancel.json();
    expect(cancelJson).toMatchObject({
      ok: true,
      reservation: {
        reference: lookupJson.reservations[0].reference,
        status: "cancelled",
      },
    });
    expect(cancelJson.reservation.id).toBeUndefined();
    const stored = (await store.findByContact(bookingGuest.email, bookingGuest.phone))[0];
    expect(stored.status).toBe("cancelled");
    const notifications = await routes.notificationStore.listTenantNotifications(tenantId, { limit: 5 });
    const cancelNotification = notifications.find((n) => n.title === "Online reservation cancelled");
    expect(cancelNotification).toMatchObject({
      type: "reservation.updated",
      severity: "warning",
      title: "Online reservation cancelled",
      source: "web",
      reservationId: stored.id,
      reference: lookupJson.reservations[0].reference,
    });
    const { listAppEvents } = await import("@/lib/observability/app-event-store");
    const cancelEvents = await listAppEvents({ tenantId, event: "public.lookup.cancelled", limit: 5 });
    expect(cancelEvents[0]).toMatchObject({
      event: "public.lookup.cancelled",
      surface: "public",
      actorType: "guest",
      reservationId: stored.id,
      reference: lookupJson.reservations[0].reference,
      status: 200,
    });

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
    expect(sendCancellationEmail).toHaveBeenCalledOnce();
    expect(sendCancellationEmail).toHaveBeenCalledWith(expect.objectContaining({ id: stored.id, status: "cancelled" }), expect.anything(), undefined, expect.anything());
  });

  it("rate-limits repeated cancellation attempts by normalized contact and reference", async () => {
    const reference = await createGuest();
    for (let i = 0; i < 5; i++) {
      const attempt = await routes.lookup.DELETE(req("/api/reservations/lookup", {
        method: "DELETE",
        body: {
          email: " GUEST-SELF@EXAMPLE.COM ",
          phone: "555 123 456",
          reference,
        },
      }));
      expect([200, 409]).toContain(attempt.status);
    }

    const blocked = await routes.lookup.DELETE(req("/api/reservations/lookup", {
      method: "DELETE",
      body: {
        email: guest().email,
        phone: guest().phone,
        reference,
      },
    }));
    expect(blocked.status).toBe(429);
    await expect(blocked.json()).resolves.toMatchObject({ error: expect.stringMatching(/too many requests/i) });
  });

  it("rejects self-service changes for the wrong contact", async () => {
    const reference = await createGuest();
    const res = await routes.lookup.PATCH(req("/api/reservations/lookup", {
      method: "PATCH",
      body: { email: "wrong@example.com", phone: guest().phone, reference, time: "13:30" },
    }));
    expect(res.status).toBe(404);
  });

  it("does not expose external imports through guest self-service lookup", async () => {
    await routes.store.getStore().forTenant(tenantId).createReservation({
      date: "2026-06-12",
      time: "12:30",
      service: "lunch",
      partySize: 2,
      name: "TheFork Guest",
      email: guest().email,
      phone: guest().phone,
      source: "thefork",
      status: "confirmed",
    });
    await routes.store.getStore().forTenant(tenantId).createReservation({
      date: "2026-06-12",
      time: "13:00",
      service: "lunch",
      partySize: 2,
      name: "DISH Guest",
      email: guest().email,
      phone: guest().phone,
      source: "dish",
      status: "confirmed",
    });

    const res = await routes.lookup.POST(req("/api/reservations/lookup", {
      method: "POST",
      body: { email: guest().email, phone: guest().phone, _t: Date.now() - 2_000 },
    }));

    expect(res.status).toBe(200);
    expect((await res.json()).reservations).toEqual([]);
  });

  it("rejects admin edits to external imported reservations", async () => {
    const imported = await routes.store.getStore().forTenant(tenantId).createReservation({
      date: "2026-06-12",
      time: "12:30",
      service: "lunch",
      partySize: 2,
      name: "TheFork Guest",
      email: guest().email,
      phone: guest().phone,
      source: "dish",
      status: "confirmed",
    });

    const res = await routes.adminResId.PATCH(
      adminReq(`/api/admin/reservations/${imported.id}`, { method: "PATCH", body: { status: "seated" } }),
      { params: Promise.resolve({ id: imported.id }) },
    );

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/External reservations are read-only/i);
  });

  it("allows staff to assign a local table to a TheFork-imported reservation", async () => {
    const { getTableStore } = await import("@/lib/reservations/table-store");
    const { reservationBus } = await import("@/lib/reservations/events");
    const table = await getTableStore(tenantId).createTable({ label: "Patio 1", capacity: 4 });
    const imported = await routes.store.getStore().forTenant(tenantId).createReservation({
      date: "2026-06-12",
      time: "12:30",
      service: "lunch",
      partySize: 2,
      name: "TheFork Guest",
      email: guest().email,
      phone: guest().phone,
      source: "thefork",
      status: "confirmed",
    });
    const event = new Promise<{ source: string }>((resolve) => {
      reservationBus.once("reservation.updated", resolve);
    });

    const res = await routes.adminResId.PATCH(
      adminReq(`/api/admin/reservations/${imported.id}`, { method: "PATCH", body: { tableId: table.id } }),
      { params: Promise.resolve({ id: imported.id }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reservation).toMatchObject({ source: "thefork", tableId: table.id, tableLabel: "Patio 1" });
    await expect(event).resolves.toMatchObject({ source: "admin" });
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
    expect(res.cookies.get(routes.auth.IMPERSONATION_COOKIE)?.value).toBe("");
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
  it("PUT rejects mismatched Origin when Fetch Metadata is absent", async () => {
    const cfg = (await (await routes.config.GET(adminReq("/api/admin/config"))).json()).config;
    const res = await routes.config.PUT(adminReq("/api/admin/config", {
      method: "PUT",
      headers: { origin: "https://evil.example.com" },
      body: { config: cfg },
    }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/cross-site/i);
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

describe("admin capacity settings", () => {
  it("reads and updates the tenant capacity mode", async () => {
    const before = await routes.capacitySettings.GET(adminReq("/api/admin/settings/capacity"));
    expect(before.status).toBe(200);
    expect(await before.json()).toEqual({ capacityMode: "tables" });

    const patched = await routes.capacitySettings.PATCH(adminReq("/api/admin/settings/capacity", {
      method: "PATCH",
      body: { capacityMode: "manual" },
    }));
    expect(patched.status).toBe(200);
    expect(await patched.json()).toEqual({ capacityMode: "manual" });
    expect((await routes.store.getStore().forTenant(tenantId).getConfig()).capacityMode).toBe("manual");
  });

  it("rejects invalid capacity modes", async () => {
    const res = await routes.capacitySettings.PATCH(adminReq("/api/admin/settings/capacity", {
      method: "PATCH",
      body: { capacityMode: "hybrid" },
    }));
    expect(res.status).toBe(400);
  });
});

describe("admin today booking controls", () => {
  it("lists today's services and toggles a service-level booking stop", async () => {
    const before = await routes.todayControls.GET(adminReq("/api/admin/today-booking-controls"));
    expect(before.status).toBe(200);
    const beforeJson = await before.json();
    expect(beforeJson.date).toBe("2026-06-11");
    const lunch = beforeJson.services.find((s: { service: string }) => s.service === "lunch");
    expect(lunch).toMatchObject({ disabled: false, cutoffPassed: false, serviceLabel: "Lunch", serviceLabelEn: "Lunch", serviceLabelIt: "Pranzo" });

    const patched = await routes.todayControls.PATCH(adminReq("/api/admin/today-booking-controls", {
      method: "PATCH",
      body: { offering: "main", service: "lunch", disabled: true },
    }));
    expect(patched.status).toBe(200);
    const patchedJson = await patched.json();
    expect(patchedJson.services.find((s: { service: string }) => s.service === "lunch").disabled).toBe(true);

    const config = (await routes.store.getStore().forTenant(tenantId).getConfig());
    expect(config.disabledServices?.["2026-06-11"]?.main).toContain("lunch");
  });

  it("does not remove manually blocked individual slots when re-enabling a stopped service", async () => {
    const store = routes.store.getStore().forTenant(tenantId);
    const config = await store.getConfig();
    await store.saveConfig({
      ...config,
      blockedSlots: { "2026-06-11": ["12:00"] },
      disabledServices: { "2026-06-11": { main: ["lunch"] } },
    });

    const res = await routes.todayControls.PATCH(adminReq("/api/admin/today-booking-controls", {
      method: "PATCH",
      body: { offering: "main", service: "lunch", disabled: false },
    }));
    expect(res.status).toBe(200);
    const saved = await store.getConfig();
    expect(saved.disabledServices?.["2026-06-11"]?.main).toBeUndefined();
    expect(saved.blockedSlots["2026-06-11"]).toEqual(["12:00"]);
  });
});

describe("admin slot blocks", () => {
  it("toggles one public booking slot without blocking neighboring slots", async () => {
    const blocked = await routes.slotBlocks.PATCH(adminReq("/api/admin/slot-blocks", {
      method: "PATCH",
      body: { date: "2026-06-12", offering: "main", time: "12:30", blocked: true },
    }));
    expect(blocked.status).toBe(200);
    expect(await blocked.json()).toMatchObject({
      ok: true,
      date: "2026-06-12",
      offering: "main",
      time: "12:30",
      blocked: true,
      blockedSlots: ["12:30"],
    });

    const day = await routes.avail.GET(req("/api/availability?date=2026-06-12"));
    expect(day.status).toBe(200);
    const lunch = (await day.json()).services.find((s: { id: string }) => s.id === "lunch");
    expect(lunch.slots.find((s: { time: string }) => s.time === "12:00")).toMatchObject({ available: true });
    expect(lunch.slots.find((s: { time: string }) => s.time === "12:30")).toMatchObject({
      available: false,
      unavailableReason: "blocked",
    });

    const resumed = await routes.slotBlocks.PATCH(adminReq("/api/admin/slot-blocks", {
      method: "PATCH",
      body: { date: "2026-06-12", offering: "main", time: "12:30", blocked: false },
    }));
    expect(resumed.status).toBe(200);
    expect(await resumed.json()).toMatchObject({ blocked: false, blockedSlots: [] });
    const saved = await routes.store.getStore().forTenant(tenantId).getConfig();
    expect(saved.blockedSlots["2026-06-12"]).toBeUndefined();
  });

  it("rejects times that are not generated slots", async () => {
    const res = await routes.slotBlocks.PATCH(adminReq("/api/admin/slot-blocks", {
      method: "PATCH",
      body: { date: "2026-06-12", offering: "main", time: "12:17", blocked: true },
    }));
    expect(res.status).toBe(404);
  });
});

describe("admin slot capacity", () => {
  it("rejects slot capacity updates unless manual capacity mode is enabled", async () => {
    const res = await routes.slotCapacity.PATCH(adminReq("/api/admin/slot-capacity", {
      method: "PATCH",
      body: { date: "2026-06-12", offering: "main", service: "lunch", time: "12:30", capacity: 14, scope: "date" },
    }));
    expect(res.status).toBe(409);
  });

  it("sets a one-day slot capacity override", async () => {
    const store = routes.store.getStore().forTenant(tenantId);
    await store.saveConfig({ ...(await store.getConfig()), capacityMode: "manual" });

    const res = await routes.slotCapacity.PATCH(adminReq("/api/admin/slot-capacity", {
      method: "PATCH",
      body: { date: "2026-06-12", offering: "main", service: "lunch", time: "12:30", capacity: 14, scope: "date" },
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, capacity: 14, scope: "date" });
    const saved = await store.getConfig();
    expect(saved.slotCapacityOverrides?.["2026-06-12"].main.lunch["12:30"]).toBe(14);

    const day = await routes.adminAvail.GET(adminReq("/api/admin/availability?date=2026-06-12"));
    const lunch = (await day.json()).services.find((s: { id: string }) => s.id === "lunch");
    expect(lunch.slots.find((s: { time: string }) => s.time === "12:30")).toMatchObject({ capacity: 14 });
  });

  it("sets a forward slot capacity override from the selected date onward", async () => {
    const store = routes.store.getStore().forTenant(tenantId);
    await store.saveConfig({ ...(await store.getConfig()), capacityMode: "manual" });

    const res = await routes.slotCapacity.PATCH(adminReq("/api/admin/slot-capacity", {
      method: "PATCH",
      body: { date: "2026-06-12", offering: "main", service: "lunch", time: "12:30", capacity: 16, scope: "future" },
    }));
    expect(res.status).toBe(200);
    const saved = await store.getConfig();
    expect(saved.forwardSlotCapacityOverrides?.main.lunch["12:30"]).toEqual([
      { effectiveFrom: "2026-06-12", capacity: 16 },
    ]);

    const before = await routes.adminAvail.GET(adminReq("/api/admin/availability?date=2026-06-11"));
    const after = await routes.adminAvail.GET(adminReq("/api/admin/availability?date=2026-06-12"));
    const beforeLunch = (await before.json()).services.find((s: { id: string }) => s.id === "lunch");
    const afterLunch = (await after.json()).services.find((s: { id: string }) => s.id === "lunch");
    expect(beforeLunch.slots.find((s: { time: string }) => s.time === "12:30")).toMatchObject({ capacity: 20 });
    expect(afterLunch.slots.find((s: { time: string }) => s.time === "12:30")).toMatchObject({ capacity: 16 });
  });
});

/* ----------------------------- admin availability ----------------------------- */

describe("admin availability routes", () => {
  it("uses the admin session tenant instead of public host resolution", async () => {
    const res = await routes.adminAvail.GET(
      adminReq("/api/admin/availability?date=2026-06-12", {
        headers: { host: "unmapped-admin.example.com" },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.date).toBe("2026-06-12");
    expect(json.services.length).toBeGreaterThan(0);
  });

  it("returns 400 for invalid admin availability params", async () => {
    expect((await routes.adminAvail.GET(adminReq("/api/admin/availability?date=nope"))).status).toBe(400);
    expect((await routes.adminAvail.GET(adminReq("/api/admin/availability?month=2026-13"))).status).toBe(400);
    expect((await routes.adminAvail.GET(adminReq("/api/admin/availability"))).status).toBe(400);
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
  it("PATCH updates status, DELETE removes editable reservations, both 404 on unknown id", async () => {
    const created = (await (await routes.adminRes.POST(adminReq("/api/admin/reservations", { method: "POST", body: { date: "2026-06-12", time: "20:00", service: "dinner", name: "C", partySize: 2 } }))).json()).reservation;

    const patched = await routes.adminResId.PATCH(
      adminReq(`/api/admin/reservations/${created.id}`, { method: "PATCH", body: { status: "seated" } }), { params: Promise.resolve({ id: created.id }) });
    expect(patched.status).toBe(200);
    expect((await patched.json()).reservation.status).toBe("seated");

    const seatedEdit = await routes.adminResId.PATCH(
      adminReq(`/api/admin/reservations/${created.id}`, { method: "PATCH", body: { name: "Changed" } }), { params: Promise.resolve({ id: created.id }) });
    expect(seatedEdit.status).toBe(409);

    const seatedDelete = await routes.adminResId.DELETE(adminReq(`/api/admin/reservations/${created.id}`, { method: "DELETE" }), { params: Promise.resolve({ id: created.id }) });
    expect(seatedDelete.status).toBe(409);

    const completed = await routes.adminResId.PATCH(
      adminReq(`/api/admin/reservations/${created.id}`, { method: "PATCH", body: { status: "completed" } }), { params: Promise.resolve({ id: created.id }) });
    expect(completed.status).toBe(200);
    expect((await completed.json()).reservation.status).toBe("completed");

    const completedEdit = await routes.adminResId.PATCH(
      adminReq(`/api/admin/reservations/${created.id}`, { method: "PATCH", body: { name: "Changed" } }), { params: Promise.resolve({ id: created.id }) });
    expect(completedEdit.status).toBe(409);

    const completedDelete = await routes.adminResId.DELETE(adminReq(`/api/admin/reservations/${created.id}`, { method: "DELETE" }), { params: Promise.resolve({ id: created.id }) });
    expect(completedDelete.status).toBe(409);

    const badStatus = await routes.adminResId.PATCH(
      adminReq(`/api/admin/reservations/${created.id}`, { method: "PATCH", body: { status: "teleported" } }), { params: Promise.resolve({ id: created.id }) });
    expect(badStatus.status).toBe(400);

    const missing = await routes.adminResId.PATCH(
      adminReq("/api/admin/reservations/nope", { method: "PATCH", body: { status: "seated" } }), { params: Promise.resolve({ id: "nope" }) });
    expect(missing.status).toBe(404);

    const deletable = (await (await routes.adminRes.POST(adminReq("/api/admin/reservations", { method: "POST", body: { date: "2026-06-12", time: "21:00", service: "dinner", name: "D", partySize: 2 } }))).json()).reservation;
    const del = await routes.adminResId.DELETE(adminReq(`/api/admin/reservations/${deletable.id}`, { method: "DELETE" }), { params: Promise.resolve({ id: deletable.id }) });
    expect(del.status).toBe(200);
    const delAgain = await routes.adminResId.DELETE(adminReq(`/api/admin/reservations/${deletable.id}`, { method: "DELETE" }), { params: Promise.resolve({ id: deletable.id }) });
    expect(delAgain.status).toBe(404);
  });

  it("lists and marks tenant notifications as read through the admin API", async () => {
    const created = await routes.notificationStore.createTenantNotification({
      tenantId,
      type: "reservation.created",
      title: "New online reservation",
      source: "web",
      reservationId: "res-1",
      dedupeKey: "reservation.created:res-1",
      metadata: {
        reservation: {
          id: "res-1",
          name: "Jane",
          partySize: 2,
          date: "2026-06-12",
          time: "20:00",
          service: "dinner",
          offering: "main",
          source: "web",
        },
      },
    });

    const listed = await routes.adminNotifications.GET(adminReq("/api/admin/notifications?unread=1"));
    expect(listed.status).toBe(200);
    const listedJson = await listed.json();
    expect(listedJson.unreadCount).toBe(1);
    expect(listedJson.notifications).toHaveLength(1);
    expect(listedJson.notifications[0]).toMatchObject({
      id: created.notification.id,
      tenantId,
    });

    const read = await routes.adminNotificationId.PATCH(
      adminReq(`/api/admin/notifications/${created.notification.id}`, { method: "PATCH", body: { read: true } }),
      { params: Promise.resolve({ id: created.notification.id }) },
    );
    expect(read.status).toBe(200);
    expect((await read.json()).notification.readAt).toBeTruthy();

    const after = await routes.adminNotifications.GET(adminReq("/api/admin/notifications?unread=1"));
    expect((await after.json()).unreadCount).toBe(0);
  });

  it("marks all notifications read and dismisses individual notifications", async () => {
    const first = await routes.notificationStore.createTenantNotification({
      tenantId,
      type: "reservation.created",
      title: "First",
      source: "web",
      reservationId: "res-1",
      dedupeKey: "res-1",
    });
    await routes.notificationStore.createTenantNotification({
      tenantId,
      type: "reservation.created",
      title: "Second",
      source: "web",
      reservationId: "res-2",
      dedupeKey: "res-2",
    });

    const all = await routes.adminNotifications.POST(adminReq("/api/admin/notifications", { method: "POST" }));
    expect(all.status).toBe(200);
    expect(await routes.notificationStore.countUnreadTenantNotifications(tenantId)).toBe(0);

    const dismissed = await routes.adminNotificationId.PATCH(
      adminReq(`/api/admin/notifications/${first.notification.id}`, { method: "PATCH", body: { dismissed: true } }),
      { params: Promise.resolve({ id: first.notification.id }) },
    );
    expect(dismissed.status).toBe(200);
    expect((await dismissed.json()).notification.dismissedAt).toBeTruthy();
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
