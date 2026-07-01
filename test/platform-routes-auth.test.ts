import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/reservations/smtp-health", () => ({
  runSmtpHealthChecks: async () => [],
}));

// No MySQL configured -> platform mutations would 401 before ever hitting a store.
let tenants: typeof import("@/app/api/platform/tenants/route");
let tenantId: typeof import("@/app/api/platform/tenants/[id]/route");
let domains: typeof import("@/app/api/platform/tenants/[id]/domains/route");
let password: typeof import("@/app/api/platform/tenants/[id]/password/route");
let impersonation: typeof import("@/app/api/platform/tenants/[id]/impersonation/route");
let logout: typeof import("@/app/api/platform/logout/route");
let logs: typeof import("@/app/api/platform/logs/route");
let emailLogs: typeof import("@/app/api/platform/email-logs/route");
let smtpCron: typeof import("@/app/api/platform/cron/smtp-health/route");
let bounces: typeof import("@/app/api/platform/bounces/route");
let pauth: typeof import("@/lib/reservations/platform-auth");

beforeAll(async () => {
  process.env.SESSION_SECRET = "platform-routes-auth-secret";
  tenants = await import("@/app/api/platform/tenants/route");
  tenantId = await import("@/app/api/platform/tenants/[id]/route");
  domains = await import("@/app/api/platform/tenants/[id]/domains/route");
  password = await import("@/app/api/platform/tenants/[id]/password/route");
  impersonation = await import("@/app/api/platform/tenants/[id]/impersonation/route");
  logout = await import("@/app/api/platform/logout/route");
  logs = await import("@/app/api/platform/logs/route");
  emailLogs = await import("@/app/api/platform/email-logs/route");
  smtpCron = await import("@/app/api/platform/cron/smtp-health/route");
  bounces = await import("@/app/api/platform/bounces/route");
  pauth = await import("@/lib/reservations/platform-auth");
});
afterAll(() => {});

const req = (url: string, method = "GET") => new NextRequest(`http://platform.local${url}`, { method });
const authed = async (url: string, method = "GET") =>
  new NextRequest(`http://platform.local${url}`, {
    method,
    headers: { cookie: `${pauth.PLATFORM_COOKIE}=${await pauth.createPlatformSession("ops")}` },
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("platform routes reject unauthenticated callers (401)", () => {
  it("tenants GET/POST", async () => {
    expect((await tenants.GET(req("/api/platform/tenants"))).status).toBe(401);
    expect((await tenants.POST(req("/api/platform/tenants", "POST"))).status).toBe(401);
  });
  it("tenant GET/PATCH/DELETE", async () => {
    expect((await tenantId.GET(req("/api/platform/tenants/x"), params("x"))).status).toBe(401);
    expect((await tenantId.PATCH(req("/api/platform/tenants/x", "PATCH"), params("x"))).status).toBe(401);
    expect((await tenantId.DELETE(req("/api/platform/tenants/x", "DELETE"), params("x"))).status).toBe(401);
  });
  it("domains POST/DELETE and password POST", async () => {
    expect((await domains.POST(req("/api/platform/tenants/x/domains", "POST"), params("x"))).status).toBe(401);
    expect((await domains.DELETE(req("/api/platform/tenants/x/domains", "DELETE"), params("x"))).status).toBe(401);
    expect((await password.POST(req("/api/platform/tenants/x/password", "POST"), params("x"))).status).toBe(401);
  });
  it("impersonation POST", async () => {
    expect((await impersonation.POST(req("/api/platform/tenants/x/impersonation", "POST"), params("x"))).status).toBe(401);
  });
  it("logs GET", async () => {
    expect((await logs.GET(req("/api/platform/logs"))).status).toBe(401);
  });
  it("email logs GET", async () => {
    expect((await emailLogs.GET(req("/api/platform/email-logs"))).status).toBe(401);
  });
  it("SMTP cron POST", async () => {
    expect((await smtpCron.POST(req("/api/platform/cron/smtp-health", "POST"))).status).toBe(401);
  });
  it("SMTP cron POST accepts a platform session for manual checks", async () => {
    const res = await smtpCron.POST(await authed("/api/platform/cron/smtp-health", "POST"));
    expect(res.status).toBe(200);
  });
  it("bounce ingest POST", async () => {
    expect((await bounces.POST(req("/api/platform/bounces", "POST"))).status).toBe(401);
  });
});

describe("platform logout", () => {
  it("clears the platform cookie", async () => {
    const res = await logout.POST();
    expect(res.status).toBe(200);
    expect(res.cookies.get(pauth.PLATFORM_COOKIE)?.value).toBe("");
  });
});
