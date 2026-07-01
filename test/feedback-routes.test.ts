import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDB } from "mysql-memory-server";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";

// Mock email so tests never touch SMTP.
const sendFeedbackRequestEmail = vi.hoisted(() => vi.fn(async () => ({ sent: true })));
vi.mock("@/lib/reservations/email", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  sendFeedbackRequestEmail,
}));

type MySQLDB = Awaited<ReturnType<typeof createDB>>;
let db: MySQLDB;
let tenantId: string;

let adminFeedbackRoute: typeof import("@/app/api/admin/reservations/[id]/feedback/route");
let adminReservationsRoute: typeof import("@/app/api/admin/reservations/route");
let adminReservationRoute: typeof import("@/app/api/admin/reservations/[id]/route");
let feedbackStore: typeof import("@/lib/reservations/feedback-store");
let store: typeof import("@/lib/reservations/store");
let auth: typeof import("@/lib/reservations/auth");
let poolMod: typeof import("@/lib/reservations/mysql-pool");

let adminCookie = "";
const marketingOrigin = "https://www.marketing.test";

function req(url: string, opts: { method?: string; body?: unknown; cookie?: string; host?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = {
    host: opts.host ?? "localhost",
    "x-forwarded-for": "127.0.0.1",
    ...(opts.headers ?? {}),
  };
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
const marketingReq = (url: string, o: Parameters<typeof req>[1] = {}) =>
  req(url, {
    ...o,
    host: "reservations.example.test",
    headers: { origin: marketingOrigin, ...(o.headers ?? {}) },
  });

function expectMarketingCors(res: Response) {
  expect(res.headers.get("access-control-allow-origin")).toBe(marketingOrigin);
  expect(res.headers.get("vary")).toContain("Origin");
}

beforeAll(async () => {
  db = await createDB({ version: "8.4.x" });
  process.env.MYSQL_HOST = "127.0.0.1";
  process.env.MYSQL_PORT = String(db.port);
  process.env.MYSQL_USER = db.username;
  process.env.MYSQL_PASSWORD = "";
  process.env.MYSQL_DATABASE = db.dbName;
  process.env.SESSION_SECRET = "feedback-route-secret";

  auth = await import("@/lib/reservations/auth");
  poolMod = await import("@/lib/reservations/mysql-pool");
  feedbackStore = await import("@/lib/reservations/feedback-store");
  store = await import("@/lib/reservations/store");
  adminFeedbackRoute = await import("@/app/api/admin/reservations/[id]/feedback/route");
  adminReservationsRoute = await import("@/app/api/admin/reservations/route");
  adminReservationRoute = await import("@/app/api/admin/reservations/[id]/route");

  const { getTenantStore, resetTenantStore } = await import("@/lib/reservations/tenant-store");
  const { hashPassword, templateSettings } = await import("@/lib/reservations/tenant");
  const { ensureSchema } = await import("@/lib/reservations/mysql-schema");
  await ensureSchema();
  resetTenantStore();
  const ts = getTenantStore();
  tenantId = randomUUID();
  await ts.create({
    id: tenantId,
    slug: "fb-test",
    name: "Feedback Test Restaurant",
    settings: { ...templateSettings(), url: "https://fb.test", allowedOrigins: [marketingOrigin] },
    adminUsername: "staff",
    adminPasswordHash: hashPassword("secret1"),
    hosts: ["localhost"],
  });
  adminCookie = `${auth.SESSION_COOKIE}=${await auth.createSession(tenantId, "staff")}`;
}, 180_000);

afterAll(async () => {
  if (db) await db.stop();
});

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(async () => {
  const p = poolMod.getPool();
  await p.query("DELETE FROM reservations WHERE tenant_id = ?", [tenantId]);
  await p.query("DELETE FROM reservation_feedback");
  await p.query("DELETE FROM rate_limits WHERE k LIKE 'feedback-%'");
  const { getTenantStore } = await import("@/lib/reservations/tenant-store");
  const tenant = (await getTenantStore().getById(tenantId))!;
  await getTenantStore().updateSettings(tenantId, {
    ...tenant.settings,
    feedbackEnabled: true,
    emailEnabled: true,
    emailEvents: { bookingConfirmation: true, feedbackRequest: true },
    feedbackRequestDelayHours: 0,
    reviewUrl: "https://g.page/r/fb-test/review",
    allowedOrigins: [marketingOrigin],
  });
  sendFeedbackRequestEmail.mockClear();
});

async function makeCompleted(email = "guest@x.io") {
  const s = store.getStore().forTenant(tenantId);
  const r = await s.createReservation({
    date: "2026-06-12", time: "12:00", service: "lunch", partySize: 2,
    name: "Test Guest", email, phone: "123",
  });
  await s.updateReservation(r.id, { status: "completed" });
  return r;
}

/* ---- Admin feedback route: POST (send request) ---- */

describe("POST /api/admin/reservations/[id]/feedback", () => {
  it("401 without a valid session cookie", async () => {
    const r = await makeCompleted();
    const res = await adminFeedbackRoute.POST(
      req(`/api/admin/reservations/${r.id}/feedback`, { method: "POST" }),
      { params: Promise.resolve({ id: r.id }) },
    );
    expect(res.status).toBe(401);
  });

  it("404 for unknown reservation id", async () => {
    const res = await adminFeedbackRoute.POST(
      authed(`/api/admin/reservations/${randomUUID()}/feedback`, { method: "POST" }),
      { params: Promise.resolve({ id: randomUUID() }) },
    );
    expect(res.status).toBe(404);
  });

  it("422 when reservation is not completed", async () => {
    const s = store.getStore().forTenant(tenantId);
    const r = await s.createReservation({
      date: "2026-06-12", time: "13:00", service: "lunch", partySize: 2,
      name: "Pending Guest", email: "p@x.io", phone: "1",
    });
    const res = await adminFeedbackRoute.POST(
      authed(`/api/admin/reservations/${r.id}/feedback`, { method: "POST" }),
      { params: Promise.resolve({ id: r.id }) },
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/completed/);
  });

  it("422 when reservation has no email", async () => {
    const s = store.getStore().forTenant(tenantId);
    const r = await s.createReservation({
      date: "2026-06-12", time: "14:00", service: "lunch", partySize: 2,
      name: "No Email", email: "", phone: "1",
    });
    await s.updateReservation(r.id, { status: "completed" });
    const res = await adminFeedbackRoute.POST(
      authed(`/api/admin/reservations/${r.id}/feedback`, { method: "POST" }),
      { params: Promise.resolve({ id: r.id }) },
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/email/);
  });

  it("403s when tenant feedback requests are disabled", async () => {
    const { getTenantStore } = await import("@/lib/reservations/tenant-store");
    const tenant = (await getTenantStore().getById(tenantId))!;
    await getTenantStore().updateSettings(tenantId, { ...tenant.settings, feedbackEnabled: false });
    const r = await makeCompleted();
    const res = await adminFeedbackRoute.POST(
      authed(`/api/admin/reservations/${r.id}/feedback`, { method: "POST" }),
      { params: Promise.resolve({ id: r.id }) },
    );
    expect(res.status).toBe(403);
    expect(sendFeedbackRequestEmail).not.toHaveBeenCalled();
  });

  it("403s when the feedback request email event is disabled", async () => {
    const { getTenantStore } = await import("@/lib/reservations/tenant-store");
    const tenant = (await getTenantStore().getById(tenantId))!;
    await getTenantStore().updateSettings(tenantId, {
      ...tenant.settings,
      emailEnabled: true,
      feedbackEnabled: false,
      emailEvents: { bookingConfirmation: true, feedbackRequest: false },
    });
    const r = await makeCompleted();
    const res = await adminFeedbackRoute.POST(
      authed(`/api/admin/reservations/${r.id}/feedback`, { method: "POST" }),
      { params: Promise.resolve({ id: r.id }) },
    );
    expect(res.status).toBe(403);
    expect(sendFeedbackRequestEmail).not.toHaveBeenCalled();
  });

  it("201-level: creates token, calls sendFeedbackRequestEmail, returns the review URL", async () => {
    const r = await makeCompleted();
    const res = await adminFeedbackRoute.POST(
      authed(`/api/admin/reservations/${r.id}/feedback`, { method: "POST" }),
      { params: Promise.resolve({ id: r.id }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.token).toMatch(/^[0-9a-f-]{36}$/);
    expect(json.reviewUrl).toBe("https://g.page/r/fb-test/review");
    expect(json.emailSent).toBe(true);
    expect(sendFeedbackRequestEmail).toHaveBeenCalledOnce();
  });


  it("uses the configured review URL even when tenant siteUrl is empty", async () => {
    // Create a tenant with no siteUrl
    const { getTenantStore } = await import("@/lib/reservations/tenant-store");
    const { hashPassword, templateSettings } = await import("@/lib/reservations/tenant");
    const emptyUrlTenantId = randomUUID();
    await getTenantStore().create({
      id: emptyUrlTenantId,
      slug: "no-url-tenant",
      name: "No URL Restaurant",
      settings: {
        ...templateSettings(),
        url: "",
        reviewUrl: "https://reviews.example/no-url",
        feedbackEnabled: true,
        emailEnabled: true,
        emailEvents: { bookingConfirmation: true, feedbackRequest: true },
      },
      adminUsername: "staff2",
      adminPasswordHash: hashPassword("secret2"),
      hosts: ["nourl.localhost"],
    });
    const emptyCookie = `${auth.SESSION_COOKIE}=${await auth.createSession(emptyUrlTenantId, "staff2")}`;
    const s = store.getStore().forTenant(emptyUrlTenantId);
    const r = await s.createReservation({
      date: "2026-06-12", time: "12:00", service: "lunch", partySize: 2,
      name: "No URL Guest", email: "nourl@x.io", phone: "1",
    });
    await s.updateReservation(r.id, { status: "completed" });

    sendFeedbackRequestEmail.mockClear();
    const res = await adminFeedbackRoute.POST(
      req(`/api/admin/reservations/${r.id}/feedback`, { method: "POST", cookie: emptyCookie, host: "nourl.localhost" }),
      { params: Promise.resolve({ id: r.id }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reviewUrl).toBe("https://reviews.example/no-url");
  });

  it("is idempotent â€” second POST reuses existing unfilled token without re-sending email", async () => {
    const r = await makeCompleted("idem@x.io");
    await adminFeedbackRoute.POST(
      authed(`/api/admin/reservations/${r.id}/feedback`, { method: "POST" }),
      { params: Promise.resolve({ id: r.id }) },
    );
    sendFeedbackRequestEmail.mockClear();
    // Creating again should still return 200 because token was already sent but not filled
    const res = await adminFeedbackRoute.POST(
      authed(`/api/admin/reservations/${r.id}/feedback`, { method: "POST" }),
      { params: Promise.resolve({ id: r.id }) },
    );
    expect(res.status).toBe(200);
  });
  it("does not re-send an email when an unfilled feedback token already exists", async () => {
    const r = await makeCompleted("already@x.io");
    const existing = await feedbackStore.createFeedbackToken(r.id, tenantId);

    const res = await adminFeedbackRoute.POST(
      authed(`/api/admin/reservations/${r.id}/feedback`, { method: "POST" }),
      { params: Promise.resolve({ id: r.id }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.token).toBe(existing.token);
    expect(json.alreadySent).toBe(true);
    expect(json.emailSent).toBe(false);
    expect(sendFeedbackRequestEmail).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/reservations/[id] feedback automation", () => {
  it("does not auto-send a feedback request before the tenant delay has elapsed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-12T13:00:00Z"));
    const { getTenantStore } = await import("@/lib/reservations/tenant-store");
    const tenant = (await getTenantStore().getById(tenantId))!;
    await getTenantStore().updateSettings(tenantId, {
      ...tenant.settings,
      timezone: "UTC",
      emailEnabled: true,
      feedbackEnabled: true,
      emailEvents: { bookingConfirmation: true, feedbackRequest: true },
      feedbackRequestDelayHours: 24,
    });
    const s = store.getStore().forTenant(tenantId);
    const r = await s.createReservation({
      date: "2026-06-12", time: "12:00", service: "lunch", partySize: 2,
      name: "Delayed Guest", email: "delay@x.io", phone: "1",
    });

    const res = await adminReservationRoute.PATCH(
      authed(`/api/admin/reservations/${r.id}`, { method: "PATCH", body: { status: "completed" } }),
      { params: Promise.resolve({ id: r.id }) },
    );
    expect(res.status).toBe(200);
    await Promise.resolve();
    expect(await feedbackStore.getFeedbackByReservation(r.id)).toBeNull();
    expect(sendFeedbackRequestEmail).not.toHaveBeenCalled();
  });

  it("auto-sends a feedback request once the tenant delay has elapsed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-13T13:00:00Z"));
    const { getTenantStore } = await import("@/lib/reservations/tenant-store");
    const tenant = (await getTenantStore().getById(tenantId))!;
    await getTenantStore().updateSettings(tenantId, {
      ...tenant.settings,
      timezone: "UTC",
      emailEnabled: true,
      feedbackEnabled: true,
      emailEvents: { bookingConfirmation: true, feedbackRequest: true },
      feedbackRequestDelayHours: 24,
    });
    const s = store.getStore().forTenant(tenantId);
    const r = await s.createReservation({
      date: "2026-06-12", time: "12:00", service: "lunch", partySize: 2,
      name: "Due Guest", email: "due@x.io", phone: "1",
    });

    const res = await adminReservationRoute.PATCH(
      authed(`/api/admin/reservations/${r.id}`, { method: "PATCH", body: { status: "completed" } }),
      { params: Promise.resolve({ id: r.id }) },
    );
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(sendFeedbackRequestEmail).toHaveBeenCalledOnce());
    expect(await feedbackStore.getFeedbackByReservation(r.id)).not.toBeNull();
  });

  it("sends delayed feedback requests later from the admin reservation list", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-12T13:00:00Z"));
    const { getTenantStore } = await import("@/lib/reservations/tenant-store");
    const tenant = (await getTenantStore().getById(tenantId))!;
    await getTenantStore().updateSettings(tenantId, {
      ...tenant.settings,
      timezone: "UTC",
      emailEnabled: true,
      feedbackEnabled: true,
      emailEvents: { bookingConfirmation: true, feedbackRequest: true },
      feedbackRequestDelayHours: 24,
    });
    const s = store.getStore().forTenant(tenantId);
    const r = await s.createReservation({
      date: "2026-06-12", time: "12:00", service: "lunch", partySize: 2,
      name: "Later Guest", email: "later@x.io", phone: "1",
    });
    await adminReservationRoute.PATCH(
      authed(`/api/admin/reservations/${r.id}`, { method: "PATCH", body: { status: "completed" } }),
      { params: Promise.resolve({ id: r.id }) },
    );
    expect(sendFeedbackRequestEmail).not.toHaveBeenCalled();

    vi.setSystemTime(new Date("2026-06-13T13:00:00Z"));
    const res = await adminReservationsRoute.GET(
      authed("/api/admin/reservations?date=2026-06-12"),
    );
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(sendFeedbackRequestEmail).toHaveBeenCalledOnce());
    expect(await feedbackStore.getFeedbackByReservation(r.id)).not.toBeNull();
  });
});

/* ---- Admin feedback route: GET (check status) ---- */

describe("GET /api/admin/reservations/[id]/feedback", () => {
  it("401 without session", async () => {
    const res = await adminFeedbackRoute.GET(
      req(`/api/admin/reservations/${randomUUID()}/feedback`),
      { params: Promise.resolve({ id: randomUUID() }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns feedback: null when no feedback sent", async () => {
    const r = await makeCompleted();
    const res = await adminFeedbackRoute.GET(
      authed(`/api/admin/reservations/${r.id}/feedback`),
      { params: Promise.resolve({ id: r.id }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).feedback).toBeNull();
  });

  it("returns feedback record after token created", async () => {
    const r = await makeCompleted();
    await feedbackStore.createFeedbackToken(r.id, tenantId);
    const res = await adminFeedbackRoute.GET(
      authed(`/api/admin/reservations/${r.id}/feedback`),
      { params: Promise.resolve({ id: r.id }) },
    );
    const json = await res.json();
    expect(json.feedback).not.toBeNull();
    expect(json.feedback.reservationId).toBe(r.id);
  });

  it("does not return feedback records for another tenant's reservation id", async () => {
    const { getTenantStore } = await import("@/lib/reservations/tenant-store");
    const { hashPassword, templateSettings } = await import("@/lib/reservations/tenant");
    const otherTenantId = randomUUID();
    await getTenantStore().create({
      id: otherTenantId,
      slug: `other-${otherTenantId.slice(0, 8)}`,
      name: "Other Restaurant",
      settings: templateSettings(),
      adminUsername: "staff",
      adminPasswordHash: hashPassword("secret1"),
      hosts: [],
    });
    const otherStore = store.getStore().forTenant(otherTenantId);
    const otherReservation = await otherStore.createReservation({
      date: "2026-06-12", time: "12:00", service: "lunch", partySize: 2,
      name: "Other Guest", email: "other@x.io", phone: "456",
    });
    await feedbackStore.createFeedbackToken(otherReservation.id, otherTenantId);

    const res = await adminFeedbackRoute.GET(
      authed(`/api/admin/reservations/${otherReservation.id}/feedback`),
      { params: Promise.resolve({ id: otherReservation.id }) },
    );
    expect(res.status).toBe(404);
  });

});

