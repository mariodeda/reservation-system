import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDB } from "mysql-memory-server";
import { NextRequest } from "next/server";

type MySQLDB = Awaited<ReturnType<typeof createDB>>;
let db: MySQLDB;

let platformStore: typeof import("@/lib/reservations/platform-store");
let tenantStoreMod: typeof import("@/lib/reservations/tenant-store");
let tenantMod: typeof import("@/lib/reservations/tenant");
let pauth: typeof import("@/lib/reservations/platform-auth");
let MySqlStore: typeof import("@/lib/reservations/mysql-store")["MySqlStore"];
let loginRoute: typeof import("@/app/api/platform/login/route");
let tenantsRoute: typeof import("@/app/api/platform/tenants/route");
let tenantIdRoute: typeof import("@/app/api/platform/tenants/[id]/route");
let domainsRoute: typeof import("@/app/api/platform/tenants/[id]/domains/route");
let passwordRoute: typeof import("@/app/api/platform/tenants/[id]/password/route");
let impersonationRoute: typeof import("@/app/api/platform/tenants/[id]/impersonation/route");
let analyticsRoute: typeof import("@/app/api/platform/analytics/route");
let logsRoute: typeof import("@/app/api/platform/logs/route");
let emailLogsRoute: typeof import("@/app/api/platform/email-logs/route");
let adminPasswordRoute: typeof import("@/app/api/admin/settings/password/route");

let cookie = "";

// Strong password baked into the boot bootstrap (bootstrap.ts). Kept in sync here.
const SEEDED_OPS_PASSWORD = "rWu2M!v8^ScjEs%cuCk+D_FM";
let seededOpsLogin = false;
let seededOpsCreated = false;
let seededOpsSecondRun = true;

beforeAll(async () => {
  db = await createDB({ version: "8.4.x" });
  process.env.MYSQL_HOST = "127.0.0.1";
  process.env.MYSQL_PORT = String(db.port);
  process.env.MYSQL_USER = db.username;
  process.env.MYSQL_PASSWORD = "";
  process.env.MYSQL_DATABASE = db.dbName;
  process.env.SESSION_SECRET = "platform-mysql-secret";
  platformStore = await import("@/lib/reservations/platform-store");
  tenantStoreMod = await import("@/lib/reservations/tenant-store");
  tenantMod = await import("@/lib/reservations/tenant");
  pauth = await import("@/lib/reservations/platform-auth");
  ({ MySqlStore } = await import("@/lib/reservations/mysql-store"));
  loginRoute = await import("@/app/api/platform/login/route");
  tenantsRoute = await import("@/app/api/platform/tenants/route");
  tenantIdRoute = await import("@/app/api/platform/tenants/[id]/route");
  domainsRoute = await import("@/app/api/platform/tenants/[id]/domains/route");
  passwordRoute = await import("@/app/api/platform/tenants/[id]/password/route");
  impersonationRoute = await import("@/app/api/platform/tenants/[id]/impersonation/route");
  analyticsRoute = await import("@/app/api/platform/analytics/route");
  logsRoute = await import("@/app/api/platform/logs/route");
  emailLogsRoute = await import("@/app/api/platform/email-logs/route");
  adminPasswordRoute = await import("@/app/api/admin/settings/password/route");
  // Migration 3 seeds the default platform admin. Wipe it so this test file
  // can create its own fixtures with known credentials.
  const { ensureSchema } = await import("@/lib/reservations/mysql-schema");
  const { getPool } = await import("@/lib/reservations/mysql-pool");
  const { ensureBootstrapPlatformAdmin } = await import("@/lib/reservations/bootstrap");
  await ensureSchema();
  // The boot bootstrap seeds "ops" on an empty table; capture that before wiping
  // for fixtures, and confirm a second call is a no-op (idempotent / self-healing).
  await getPool().query("TRUNCATE TABLE platform_admins");
  seededOpsCreated = (await ensureBootstrapPlatformAdmin()).created;
  seededOpsLogin = await platformStore.getPlatformStore().verifyLogin("ops", SEEDED_OPS_PASSWORD);
  seededOpsSecondRun = (await ensureBootstrapPlatformAdmin()).created;
  await getPool().query("TRUNCATE TABLE platform_admins");
  cookie = `${pauth.PLATFORM_COOKIE}=${await pauth.createPlatformSession("ops")}`;
}, 180_000);

afterAll(async () => {
  if (db) await db.stop();
});

let ip = 0;
function req(url: string, opts: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": `10.1.${ip++ % 256}.1`, ...(opts.headers ?? {}) };
  if (opts.cookie) headers.cookie = opts.cookie;
  let body: string | undefined;
  if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers["content-type"] = "application/json";
  }
  return new NextRequest(`http://platform.local${url}`, { method: opts.method ?? "GET", headers, body });
}
const authed = (url: string, opts: Parameters<typeof req>[1] = {}) => req(url, { ...opts, cookie });

describe("platform-store admins", () => {
  it("bootstrap seeds the 'ops' admin with the documented password, idempotently", () => {
    expect(seededOpsCreated).toBe(true);   // created on empty table
    expect(seededOpsLogin).toBe(true);     // and the documented password works
    expect(seededOpsSecondRun).toBe(false); // second call is a no-op
  });

  it("creates, verifies and rotates an admin", async () => {
    const ps = platformStore.getPlatformStore();
    await ps.createAdmin("ops", "password123");
    expect(await ps.verifyLogin("ops", "password123")).toBe(true);
    expect(await ps.verifyLogin("ops", "wrong")).toBe(false);
    expect(await ps.verifyLogin("nobody", "password123")).toBe(false);
    await ps.setPassword("ops", "newpassword123");
    expect(await ps.verifyLogin("ops", "newpassword123")).toBe(true);
    expect(await ps.verifyLogin("ops", "password123")).toBe(false);
    expect(await ps.list()).toContain("ops");
  });
});

describe("platform login route", () => {
  it("rejects without a session (requirePlatform 401)", async () => {
    expect((await tenantsRoute.GET(req("/api/platform/tenants"))).status).toBe(401);
  });
  it("logs in with the right credentials and sets a platform cookie", async () => {
    const res = await loginRoute.POST(req("/api/platform/login", { method: "POST", body: { username: "ops", password: "newpassword123" } }));
    expect(res.status).toBe(200);
    expect(res.cookies.get(pauth.PLATFORM_COOKIE)?.value).toBeTruthy();
  });
  it("rejects wrong credentials", async () => {
    const res = await loginRoute.POST(req("/api/platform/login", { method: "POST", body: { username: "ops", password: "nope" } }));
    expect(res.status).toBe(401);
  });
});

describe("platform tenant CRUD via routes", () => {
  let id = "";

  it("creates a tenant", async () => {
    const res = await tenantsRoute.POST(authed("/api/platform/tenants", {
      method: "POST",
      body: { slug: "acme", name: "Acme Osteria", username: "staff", password: "staffpass1", hosts: ["acme.example.com"] },
    }));
    expect(res.status).toBe(201);
    const json = await res.json();
    id = json.tenant.id;
    expect(json.tenant.hosts).toContain("acme.example.com");
    expect(json.tenant.settings.name).toBe("Acme Osteria");
    // never leak the password hash
    expect(JSON.stringify(json)).not.toMatch(/scrypt\$/);
  });

  it("rejects a bad slug and a duplicate slug", async () => {
    expect((await tenantsRoute.POST(authed("/api/platform/tenants", { method: "POST", body: { slug: "BAD SLUG", name: "X", username: "u", password: "password1" } }))).status).toBe(400);
    expect((await tenantsRoute.POST(authed("/api/platform/tenants", { method: "POST", body: { slug: "acme", name: "Dup", username: "u", password: "password1" } }))).status).toBe(409);
  });

  it("lists tenants without secrets", async () => {
    const res = await tenantsRoute.GET(authed("/api/platform/tenants"));
    const json = await res.json();
    expect(json.tenants.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(json)).not.toMatch(/scrypt\$/);
  });

  it("rejects cross-site platform mutations by Origin and Fetch Metadata", async () => {
    const res = await tenantsRoute.POST(authed("/api/platform/tenants", {
      method: "POST",
      headers: { origin: "https://evil.example.com", "sec-fetch-site": "cross-site" },
      body: { slug: "evil", name: "Evil", username: "u", password: "password1" },
    }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/cross-site/i);
  });

  it("rejects mismatched Origin platform mutations when Fetch Metadata is absent", async () => {
    const res = await tenantsRoute.POST(authed("/api/platform/tenants", {
      method: "POST",
      headers: { origin: "https://evil.example.com" },
      body: { slug: "evil-no-fetch", name: "Evil", username: "u", password: "password1" },
    }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/cross-site/i);
  });

  it("platform analytics counts active restaurants even before bookings", async () => {
    const res = await analyticsRoute.GET(authed("/api/platform/analytics"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.totals.tenants).toBeGreaterThanOrEqual(1);
  });

  it("updates SMTP, redacts the password on read, and preserves it on blank write", async () => {
    const ctx = { params: Promise.resolve({ id }) };
    // set SMTP with a password
    await tenantIdRoute.PATCH(authed(`/api/platform/tenants/${id}`, {
      method: "PATCH",
      body: { settings: { name: "Acme Osteria", emailEnabled: true, smtp: { host: "smtp.acme.com", port: 587, secure: false, user: "u", pass: "secret-pw" } } },
    }), ctx);

    const read = await (await tenantIdRoute.GET(authed(`/api/platform/tenants/${id}`), ctx)).json();
    expect(read.tenant.settings.smtp.host).toBe("smtp.acme.com");
    expect(read.tenant.settings.smtp.pass).toBeUndefined(); // redacted
    expect(read.tenant.settings.smtpPassSet).toBe(true);

    // update again WITHOUT a password -> stored secret preserved
    await tenantIdRoute.PATCH(authed(`/api/platform/tenants/${id}`, {
      method: "PATCH",
      body: { settings: { name: "Acme Osteria", emailEnabled: true, smtp: { host: "smtp.acme.com", port: 2525, secure: true } } },
    }), ctx);
    const stored = await tenantStoreMod.getTenantStore().getById(id);
    expect(stored?.settings.smtp?.pass).toBe("secret-pw");
    expect(stored?.settings.smtp?.port).toBe(2525);
  });

  it("PATCH settings preserves fields omitted by partial clients", async () => {
    const ctx = { params: Promise.resolve({ id }) };
    const before = await tenantStoreMod.getTenantStore().getById(id);
    expect(before?.settings.smtp?.host).toBe("smtp.acme.com");

    const res = await tenantIdRoute.PATCH(authed(`/api/platform/tenants/${id}`, {
      method: "PATCH",
      body: { settings: { contactEmail: "owner@acme.example" } },
    }), ctx);
    expect(res.status).toBe(200);

    const stored = await tenantStoreMod.getTenantStore().getById(id);
    expect(stored?.settings.contactEmail).toBe("owner@acme.example");
    expect(stored?.settings.smtp?.host).toBe("smtp.acme.com");
    expect(stored?.settings.smtp?.pass).toBe("secret-pw");
    expect(stored?.settings.emailEnabled).toBe(true);
  });

  it("accepts platform mutations when Origin matches a forwarded host", async () => {
    const ctx = { params: Promise.resolve({ id }) };
    const res = await tenantIdRoute.PATCH(authed(`/api/platform/tenants/${id}`, {
      method: "PATCH",
      headers: {
        host: "internal.platform.local",
        origin: "https://restaurant-reservation-system.com",
        "x-forwarded-host": "restaurant-reservation-system.com",
      },
      body: { settings: { contactEmail: "forwarded@acme.example" } },
    }), ctx);
    expect(res.status).toBe(200);
    expect((await tenantStoreMod.getTenantStore().getById(id))?.settings.contactEmail).toBe("forwarded@acme.example");
  });

  it("accepts same-origin browser platform mutations when a proxy rewrites Host", async () => {
    const ctx = { params: Promise.resolve({ id }) };
    const res = await tenantIdRoute.PATCH(authed(`/api/platform/tenants/${id}`, {
      method: "PATCH",
      headers: {
        host: "internal.platform.local",
        origin: "https://restaurant-reservation-system.com",
        referer: `https://restaurant-reservation-system.com/platform/tenants/${id}`,
        "sec-fetch-site": "same-origin",
      },
      body: { settings: { contactEmail: "same-origin@acme.example" } },
    }), ctx);
    expect(res.status).toBe(200);
    expect((await tenantStoreMod.getTenantStore().getById(id))?.settings.contactEmail).toBe("same-origin@acme.example");
  });

  it("starts tenant impersonation only after operator re-auth", async () => {
    const ctx = { params: Promise.resolve({ id }) };
    const denied = await impersonationRoute.POST(authed(`/api/platform/tenants/${id}/impersonation`, {
      method: "POST",
      body: { operatorPassword: "wrong" },
    }), ctx);
    expect(denied.status).toBe(401);

    const res = await impersonationRoute.POST(authed(`/api/platform/tenants/${id}/impersonation`, {
      method: "POST",
      body: { operatorPassword: "newpassword123" },
    }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toBe("/admin/acme");
    const { IMPERSONATION_COOKIE, verifyImpersonationSession } = await import("@/lib/reservations/auth");
    const token = res.cookies.get(IMPERSONATION_COOKIE)?.value;
    expect(token).toBeTruthy();
    const payload = await verifyImpersonationSession(token);
    expect(payload).toMatchObject({ tid: id, impersonatedBy: "ops", imp: true });
  });

  it("blocks tenant password changes and audits mutations during impersonation", async () => {
    const { IMPERSONATION_COOKIE, createImpersonationSession } = await import("@/lib/reservations/auth");
    const impCookie = `${IMPERSONATION_COOKIE}=${await createImpersonationSession(id, "ops")}`;
    const res = await adminPasswordRoute.POST(req("/api/admin/settings/password", {
      method: "POST",
      cookie: impCookie,
      body: { currentPassword: "staffpass1", newPassword: "newstaffpass1" },
    }));
    expect(res.status).toBe(403);

    const { listAppEvents } = await import("@/lib/observability/app-event-store");
    const events = await listAppEvents({
      event: "admin.impersonation.mutation",
      actorType: "impersonation",
      tenantId: id,
      status: 403,
    });
    expect(events.some((event) => event.metadata?.path === "/api/admin/settings/password")).toBe(true);
  });

  it("saves feedback request template details from the platform tenant form", async () => {
    const ctx = { params: Promise.resolve({ id }) };
    const res = await tenantIdRoute.PATCH(authed(`/api/platform/tenants/${id}`, {
      method: "PATCH",
      headers: {
        host: "internal.platform.local",
        origin: "https://restaurant-reservation-system.com",
        referer: `https://restaurant-reservation-system.com/platform/tenants/${id}`,
        "sec-fetch-site": "same-origin",
      },
      body: {
        settings: {
          name: "Acme Osteria",
          url: "https://acme.example",
          contactEmail: "owner@acme.example",
          contactPhone: "+390000",
          reviewUrl: "https://g.page/r/acme/review",
          locale: "en-US",
          timezone: "Europe/Rome",
          autoConfirm: true,
          emailEnabled: true,
          emailEvents: { bookingConfirmation: true, feedbackRequest: true },
          feedbackEnabled: true,
          feedbackRequestDelayHours: 4,
          calendarEventTitle: "{{restaurantName}} booking for {{guestName}}",
          smtp: { host: "smtp.acme.com", port: 587, secure: true, user: "u" },
          emailTemplates: {
            confirmation: {
              subject: "Your reservation at {{restaurantName}} is confirmed",
              textBase64: Buffer.from("Dear {{guestName}}, your table is confirmed. {{reference}}", "utf8").toString("base64"),
              htmlBase64: Buffer.from("<html><body><p>Confirmed {{reference}}</p></body></html>", "utf8").toString("base64"),
            },
            feedbackRequest: {
              subject: "How was your visit, {{guestName}}?",
              textBase64: Buffer.from("Share your experience here: {{reviewUrl}}", "utf8").toString("base64"),
              htmlBase64: Buffer.from("<!DOCTYPE html><html><body><a href=\"{{reviewUrl}}\">Share my experience</a></body></html>", "utf8").toString("base64"),
            },
          },
        },
      },
    }), ctx);
    expect(res.status).toBe(200);
    const stored = await tenantStoreMod.getTenantStore().getById(id);
    expect(stored?.settings.emailTemplates?.confirmation.subject).toContain("confirmed");
    expect(stored?.settings.emailTemplates?.feedbackRequest?.subject).toContain("How was your visit");
    expect(stored?.settings.emailTemplates?.feedbackRequest?.html).toContain("{{reviewUrl}}");
    expect(stored?.settings.calendarEventTitle).toBe("{{restaurantName}} booking for {{guestName}}");
    expect(stored?.settings.reviewUrl).toBe("https://g.page/r/acme/review");
    expect(stored?.settings.smtp?.pass).toBe("secret-pw");
  });

  it("records a route log when a platform tenant PATCH is rejected", async () => {
    const ctx = { params: Promise.resolve({ id }) };
    const res = await tenantIdRoute.PATCH(authed(`/api/platform/tenants/${id}`, {
      method: "PATCH",
      body: { status: "teleported" },
    }), ctx);
    expect(res.status).toBe(400);

    const { listAppEvents } = await import("@/lib/observability/app-event-store");
    const events = await listAppEvents({
      event: "platform.route.non_success",
      surface: "platform",
      status: 400,
      limit: 10,
    });
    expect(events.some((event) =>
      event.reason === "Invalid status." &&
      event.metadata?.path === `/api/platform/tenants/${id}` &&
      event.metadata?.method === "PATCH"
    )).toBe(true);
  });

  it("maps and unmaps hosts", async () => {
    const ctx = { params: Promise.resolve({ id }) };
    const add = await domainsRoute.POST(authed(`/api/platform/tenants/${id}/domains`, { method: "POST", body: { host: "book.acme.com" } }), ctx);
    expect((await add.json()).hosts).toContain("book.acme.com");
    const del = await domainsRoute.DELETE(authed(`/api/platform/tenants/${id}/domains`, { method: "DELETE", body: { host: "book.acme.com" } }), ctx);
    expect((await del.json()).hosts).not.toContain("book.acme.com");
  });

  it("rejects mapping a host already owned by another tenant", async () => {
    const create = await tenantsRoute.POST(authed("/api/platform/tenants", {
      method: "POST",
      body: { slug: "beta", name: "Beta Osteria", username: "staff", password: "staffpass1", hosts: [] },
    }));
    expect(create.status).toBe(201);
    const otherId = (await create.json()).tenant.id;
    const ctx = { params: Promise.resolve({ id: otherId }) };

    const res = await domainsRoute.POST(authed(`/api/platform/tenants/${otherId}/domains`, {
      method: "POST",
      body: { host: "acme.example.com" },
    }), ctx);
    expect(res.status).toBe(409);
    expect((await tenantStoreMod.getTenantStore().getByHost("acme.example.com"))?.id).toBe(id);
  });

  it("resets the staff password", async () => {
    const ctx = { params: Promise.resolve({ id }) };
    const missing = await passwordRoute.POST(authed(`/api/platform/tenants/${id}/password`, { method: "POST", body: { password: "brandnewpass" } }), ctx);
    expect(missing.status).toBe(401);
    const res = await passwordRoute.POST(authed(`/api/platform/tenants/${id}/password`, { method: "POST", body: { password: "brandnewpass", operatorPassword: "newpassword123" } }), ctx);
    expect(res.status).toBe(200);
    const t = await tenantStoreMod.getTenantStore().getById(id);
    expect(t && tenantMod.verifyTenantLogin(t, "staff", "brandnewpass")).toBe(true);
    expect(t && tenantMod.verifyTenantLogin(t, "staff", "staffpass1")).toBe(false);
  });

  it("lists platform-visible logs with tenant and event filters", async () => {
    const { recordAppEvent } = await import("@/lib/observability/app-event-store");
    await recordAppEvent({
      level: "warn",
      event: "public.booking.rate_limited.ip",
      surface: "public",
      tenantId: id,
      actorType: "guest",
      requestId: "req-platform-logs-test",
      reference: "ABC123",
      status: 429,
      reason: "ip",
      metadata: { safe: "visible", email: "guest@example.com" },
    });
    await recordAppEvent({
      level: "info",
      event: "platform.tenant.audit_noise",
      surface: "platform",
      actorType: "platform",
      requestId: "req-platform-logs-noise",
      status: 200,
    });

    const res = await logsRoute.GET(authed(`/api/platform/logs?tenantId=${id}&level=warn&q=rate_limited&limit=20`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tenants.some((tenant: { id: string }) => tenant.id === id)).toBe(true);
    expect(json.events).toHaveLength(1);
    expect(json.events[0]).toMatchObject({
      event: "public.booking.rate_limited.ip",
      tenantId: id,
      level: "warn",
      surface: "public",
      requestId: "req-platform-logs-test",
      status: 429,
      reason: "ip",
    });
    expect(json.events[0].metadata).toMatchObject({ safe: "visible", email: "[redacted]" });

    const created = await (await logsRoute.GET(authed(`/api/platform/logs?tenantId=${id}&event=platform.tenant.created`))).json();
    expect(created.events.some((event: { tenantId: string; event: string }) =>
      event.tenantId === id && event.event === "platform.tenant.created",
    )).toBe(true);
  });

  it("lists platform-visible email logs with tenant, type and status filters", async () => {
    const { recordEmailAttempt } = await import("@/lib/reservations/email-log-store");
    await recordEmailAttempt({
      tenantId: id,
      reservationId: "reservation-email-log-1",
      type: "bookingConfirmation",
      status: "failed",
      reason: "recipient_rejected",
      error: "SMTP rejected recipient",
      toEmail: "guest@example.com",
    });
    await recordEmailAttempt({
      tenantId: id,
      reservationId: "reservation-email-log-2",
      type: "feedbackRequest",
      status: "sent",
      toEmail: "other@example.com",
    });

    const res = await emailLogsRoute.GET(authed(`/api/platform/email-logs?tenantId=${id}&type=bookingConfirmation&status=failed&q=guest&limit=20`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tenants.some((tenant: { id: string }) => tenant.id === id)).toBe(true);
    expect(json.emails).toHaveLength(1);
    expect(json.emails[0]).toMatchObject({
      tenantId: id,
      reservationId: "reservation-email-log-1",
      type: "bookingConfirmation",
      status: "failed",
      reason: "recipient_rejected",
      toEmail: "guest@example.com",
    });
  });

  it("disabling a tenant stops host resolution", async () => {
    const ctx = { params: Promise.resolve({ id }) };
    await tenantIdRoute.PATCH(authed(`/api/platform/tenants/${id}`, { method: "PATCH", body: { status: "disabled" } }), ctx);
    expect(await tenantStoreMod.getTenantStore().getByHost("acme.example.com")).toBeNull();
    await tenantIdRoute.PATCH(authed(`/api/platform/tenants/${id}`, { method: "PATCH", body: { status: "active" } }), ctx);
    expect((await tenantStoreMod.getTenantStore().getByHost("acme.example.com"))?.id).toBe(id);
  });

  it("deletes the tenant and cascades all tenant-scoped operational data", async () => {
    const ctx = { params: Promise.resolve({ id }) };
    const reservation = await new MySqlStore(id).createReservation({
      date: "2026-06-12", time: "13:00", service: "lunch", partySize: 2, name: "G", email: "g@x.io", phone: "1",
    });
    expect((await new MySqlStore(id).listReservations()).length).toBe(1);
    const { getPool } = await import("@/lib/reservations/mysql-pool");
    const pool = getPool();
    await pool.query(
      `INSERT INTO tables (id, tenant_id, label, capacity, min_party, sort_order, joinable, active, created_at)
       VALUES ('tbl-cascade', ?, '1', 2, 1, 0, 0, 1, ?)`,
      [id, new Date().toISOString()],
    );
    await pool.query(
      `INSERT INTO waitlist (id, tenant_id, offering, \`date\`, name, party_size, status, created_at, updated_at)
       VALUES ('wl-cascade', ?, 'main', '2026-06-12', 'Waiting Guest', 2, 'waiting', ?, ?)`,
      [id, new Date().toISOString(), new Date().toISOString()],
    );
    await pool.query(
      `INSERT INTO customer_profiles (id, tenant_id, email, vip, updated_at)
       VALUES ('cp-cascade', ?, 'g@x.io', 1, ?)`,
      [id, new Date().toISOString()],
    );
    await pool.query(
      `INSERT INTO reservation_emails (id, tenant_id, reservation_id, type, status, to_email, created_at)
       VALUES ('email-cascade', ?, ?, 'bookingConfirmation', 'failed', 'g@x.io', ?)`,
      [id, reservation.id, new Date().toISOString()],
    );

    const rejected = await tenantIdRoute.DELETE(authed(`/api/platform/tenants/${id}`, { method: "DELETE", body: { operatorPassword: "wrong" } }), ctx);
    expect(rejected.status).toBe(401);
    const del = await tenantIdRoute.DELETE(authed(`/api/platform/tenants/${id}`, { method: "DELETE", body: { operatorPassword: "newpassword123" } }), ctx);
    expect(del.status).toBe(200);
    expect(await tenantStoreMod.getTenantStore().getById(id)).toBeNull();
    expect(await new MySqlStore(id).listReservations()).toHaveLength(0);
    for (const table of ["tables", "waitlist", "customer_profiles", "reservation_emails"]) {
      const [rows] = await pool.query(`SELECT COUNT(*) AS count FROM ${table} WHERE tenant_id = ?`, [id]);
      expect(Number((rows as { count: number }[])[0].count)).toBe(0);
    }
  });
});
