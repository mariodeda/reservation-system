import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

// No MySQL configured -> platform mutations would 401 before ever hitting a store.
let tenants: typeof import("@/app/api/platform/tenants/route");
let tenantId: typeof import("@/app/api/platform/tenants/[id]/route");
let domains: typeof import("@/app/api/platform/tenants/[id]/domains/route");
let password: typeof import("@/app/api/platform/tenants/[id]/password/route");
let logout: typeof import("@/app/api/platform/logout/route");
let pauth: typeof import("@/lib/reservations/platform-auth");

beforeAll(async () => {
  tenants = await import("@/app/api/platform/tenants/route");
  tenantId = await import("@/app/api/platform/tenants/[id]/route");
  domains = await import("@/app/api/platform/tenants/[id]/domains/route");
  password = await import("@/app/api/platform/tenants/[id]/password/route");
  logout = await import("@/app/api/platform/logout/route");
  pauth = await import("@/lib/reservations/platform-auth");
});
afterAll(() => {});

const req = (url: string, method = "GET") => new NextRequest(`http://platform.local${url}`, { method });
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
});

describe("platform logout", () => {
  it("clears the platform cookie", async () => {
    const res = await logout.POST();
    expect(res.status).toBe(200);
    expect(res.cookies.get(pauth.PLATFORM_COOKIE)?.value).toBe("");
  });
});
