import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { createPlatformSession, PLATFORM_COOKIE } from "@/lib/reservations/platform-auth";
import { createSession, SESSION_COOKIE } from "@/lib/reservations/auth";

beforeEach(() => vi.stubEnv("SESSION_SECRET", "proxy-platform-secret"));
afterEach(() => vi.unstubAllEnvs());

const make = (path: string, cookie?: string, headers: Record<string, string> = {}) =>
  new NextRequest(`http://platform.local${path}`, { headers: cookie ? { ...headers, cookie } : headers });

describe("proxy platform gating", () => {
  it("lets the platform login through unauthenticated", async () => {
    const res = await proxy(make("/platform/login"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Robots-Tag")).toContain("noindex");
  });

  it("401s an unauthenticated platform API request", async () => {
    expect((await proxy(make("/api/platform/tenants"))).status).toBe(401);
  });

  it("redirects an unauthenticated platform page to /platform/login", async () => {
    const res = await proxy(make("/platform/tenants/x"));
    expect([307, 308]).toContain(res.status);
    expect(res.headers.get("location") ?? "").toContain("/platform/login");
  });

  it("allows a valid platform session", async () => {
    const cookie = `${PLATFORM_COOKIE}=${await createPlatformSession("ops")}`;
    expect((await proxy(make("/api/platform/tenants", cookie))).status).toBe(200);
  });

  it("allows cron endpoints with the cron bearer secret", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    expect((await proxy(make("/api/platform/cron/smtp-health", undefined, {
      authorization: "Bearer cron-secret",
    }))).status).toBe(200);
    expect((await proxy(make("/api/platform/cron/smtp-health", undefined, {
      authorization: "Bearer wrong",
    }))).status).toBe(401);
    expect((await proxy(make("/api/platform/cron/feedback-requests", undefined, {
      authorization: "Bearer cron-secret",
    }))).status).toBe(200);
    expect((await proxy(make("/api/platform/cron/feedback-requests", undefined, {
      authorization: "Bearer wrong",
    }))).status).toBe(401);
    expect((await proxy(make("/api/platform/cron/dish-sync", undefined, {
      authorization: "Bearer cron-secret",
    }))).status).toBe(200);
    expect((await proxy(make("/api/platform/cron/dish-sync", undefined, {
      authorization: "Bearer wrong",
    }))).status).toBe(401);
  });

  it("allows the bounce endpoint with the bounce bearer secret", async () => {
    vi.stubEnv("BOUNCE_WEBHOOK_SECRET", "bounce-secret");
    expect((await proxy(make("/api/platform/bounces", undefined, {
      authorization: "Bearer bounce-secret",
    }))).status).toBe(200);
    expect((await proxy(make("/api/platform/bounces", undefined, {
      authorization: "Bearer wrong",
    }))).status).toBe(401);
  });

  it("does not accept a platform session on the tenant admin, nor vice-versa", async () => {
    // platform cookie on /admin -> tenant gate rejects (redirect to the slug login)
    const platformCookie = `${PLATFORM_COOKIE}=${await createPlatformSession("ops")}`;
    const a = await proxy(make("/admin/acme/reservations", platformCookie));
    expect([307, 308]).toContain(a.status);
    expect(a.headers.get("location") ?? "").toContain("/admin/acme/login");

    // tenant cookie on /api/platform -> platform gate rejects (401)
    const tenantCookie = `${SESSION_COOKIE}=${await createSession("acme", "staff")}`;
    expect((await proxy(make("/api/platform/tenants", tenantCookie))).status).toBe(401);
  });
});
