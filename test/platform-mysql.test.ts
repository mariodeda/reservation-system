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

let cookie = "";

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
  // Migration 3 seeds the default platform admin. Wipe it so this test file
  // can create its own fixtures with known credentials.
  const { ensureSchema } = await import("@/lib/reservations/mysql-schema");
  const { getPool } = await import("@/lib/reservations/mysql-pool");
  await ensureSchema();
  await getPool().query("TRUNCATE TABLE platform_admins");
  cookie = `${pauth.PLATFORM_COOKIE}=${await pauth.createPlatformSession("ops")}`;
}, 180_000);

afterAll(async () => {
  if (db) await db.stop();
});

let ip = 0;
function req(url: string, opts: { method?: string; body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": `10.1.${ip++ % 256}.1` };
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

  it("maps and unmaps hosts", async () => {
    const ctx = { params: Promise.resolve({ id }) };
    const add = await domainsRoute.POST(authed(`/api/platform/tenants/${id}/domains`, { method: "POST", body: { host: "book.acme.com" } }), ctx);
    expect((await add.json()).hosts).toContain("book.acme.com");
    const del = await domainsRoute.DELETE(authed(`/api/platform/tenants/${id}/domains`, { method: "DELETE", body: { host: "book.acme.com" } }), ctx);
    expect((await del.json()).hosts).not.toContain("book.acme.com");
  });

  it("resets the staff password", async () => {
    const ctx = { params: Promise.resolve({ id }) };
    const res = await passwordRoute.POST(authed(`/api/platform/tenants/${id}/password`, { method: "POST", body: { password: "brandnewpass" } }), ctx);
    expect(res.status).toBe(200);
    const t = await tenantStoreMod.getTenantStore().getById(id);
    expect(t && tenantMod.verifyTenantLogin(t, "staff", "brandnewpass")).toBe(true);
    expect(t && tenantMod.verifyTenantLogin(t, "staff", "staffpass1")).toBe(false);
  });

  it("disabling a tenant stops host resolution", async () => {
    const ctx = { params: Promise.resolve({ id }) };
    await tenantIdRoute.PATCH(authed(`/api/platform/tenants/${id}`, { method: "PATCH", body: { status: "disabled" } }), ctx);
    expect(await tenantStoreMod.getTenantStore().getByHost("acme.example.com")).toBeNull();
    await tenantIdRoute.PATCH(authed(`/api/platform/tenants/${id}`, { method: "PATCH", body: { status: "active" } }), ctx);
    expect((await tenantStoreMod.getTenantStore().getByHost("acme.example.com"))?.id).toBe(id);
  });

  it("deletes the tenant and cascades its reservations", async () => {
    const ctx = { params: Promise.resolve({ id }) };
    await new MySqlStore(id).createReservation({
      date: "2026-06-12", time: "13:00", service: "lunch", partySize: 2, name: "G", email: "g@x.io", phone: "1",
    });
    expect((await new MySqlStore(id).listReservations()).length).toBe(1);

    const del = await tenantIdRoute.DELETE(authed(`/api/platform/tenants/${id}`, { method: "DELETE" }), ctx);
    expect(del.status).toBe(200);
    expect(await tenantStoreMod.getTenantStore().getById(id)).toBeNull();
    expect(await new MySqlStore(id).listReservations()).toHaveLength(0);
  });
});
