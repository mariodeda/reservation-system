import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  defaultConfirmationTemplate,
  hashPassword,
  templateAvailability,
  templateSettings,
  verifyPassword,
  verifyTenantLogin,
  type Tenant,
} from "@/lib/reservations/tenant";
import { createImpersonationSession, IMPERSONATION_COOKIE, createSession, SESSION_COOKIE } from "@/lib/reservations/auth";
import { hostOf } from "@/lib/reservations/tenant-context";

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "tenant-test-secret");
});
afterEach(() => vi.unstubAllEnvs());

describe("template helpers", () => {
  it("templateSettings reflects the configured brand", () => {
    expect(templateSettings().name).toBeTruthy();
    expect(typeof templateSettings().autoConfirm).toBe("boolean");
  });
  it("templateAvailability returns a 7-day weekly config", () => {
    expect(Object.keys(templateAvailability().weekly)).toHaveLength(7);
  });
  it("defaultConfirmationTemplate has the expected shape", () => {
    const t = defaultConfirmationTemplate();
    expect(t.subject).toContain("{{");
    expect(typeof t.html).toBe("string");
  });
});

describe("password hashing", () => {
  it("round-trips a scrypt hash", () => {
    const h = hashPassword("hunter2");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("hunter2", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
  });
  it("rejects a malformed stored hash", () => {
    expect(verifyPassword("x", "not-a-hash")).toBe(false);
    expect(verifyPassword("x", "scrypt$only-two")).toBe(false);
  });
  it("produces a distinct salt each time", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });
});

describe("verifyTenantLogin", () => {
  const hashed = (over: Partial<Tenant> = {}): Tenant => ({
    id: "t1",
    slug: "t1",
    name: "T1",
    status: "active",
    publicKey: "pk_test",
    settings: templateSettings(),
    adminUsername: "owner",
    adminPasswordHash: hashPassword("topsecret"),
    createdAt: new Date(0).toISOString(),
    ...over,
  });

  it("accepts a hashed-credential tenant", () => {
    expect(verifyTenantLogin(hashed(), "owner", "topsecret")).toBe(true);
    expect(verifyTenantLogin(hashed(), "owner", "nope")).toBe(false);
    expect(verifyTenantLogin(hashed(), "intruder", "topsecret")).toBe(false);
  });
  it("rejects a disabled tenant", () => {
    expect(verifyTenantLogin(hashed({ status: "disabled" }), "owner", "topsecret")).toBe(false);
  });
});

describe("hostOf", () => {
  const make = (host: string) => new NextRequest("http://x/y", { headers: { host } });
  it("lowercases and strips the port", () => {
    expect(hostOf(make("Acme.Example.com:3000"))).toBe("acme.example.com");
    expect(hostOf(make("localhost"))).toBe("localhost");
  });
});

describe("session tenant binding", () => {
  it("mints distinct tids per tenant (the session is the admin tenancy authority)", async () => {
    // Admin tenancy is resolved from the session's tid (see requireAdmin), so a
    // session minted for "tenant-a" can only ever act on tenant-a. This checks
    // the tid is bound into the token and differs per tenant.
    const tokenForA = await createSession("tenant-a", "staff");
    // Decode and verify the payload carries the right tid (unit-level check).
    const { verifySession } = await import("@/lib/reservations/auth");
    const payload = await verifySession(tokenForA);
    expect(payload?.tid).toBe("tenant-a");

    // A session for tenant-b must have a different tid.
    const tokenForB = await createSession("tenant-b", "staff");
    const payloadB = await verifySession(tokenForB);
    expect(payloadB?.tid).toBe("tenant-b");
    expect(payloadB?.tid).not.toBe(payload?.tid);
  });

  it("a request without a session cookie is 401 at the proxy level", async () => {
    // The proxy rejects requests with no session cookie for admin routes.
    const { proxy } = await import("@/proxy");
    const r = new NextRequest("http://x/api/admin/reservations");
    const res = await proxy(r);
    expect(res.status).toBe(401);
  });

  it("lets a valid impersonation cookie through the admin proxy gate", async () => {
    const { proxy } = await import("@/proxy");
    const token = await createImpersonationSession("tenant-a", "ops");
    const r = new NextRequest("http://x/api/admin/reservations", {
      headers: { cookie: `${IMPERSONATION_COOKIE}=${token}` },
    });
    const res = await proxy(r);
    expect(res.status).toBe(200);
  });

  it("session cookie headers are correctly named", async () => {
    expect(SESSION_COOKIE).toBe("rsv_session");
    expect(IMPERSONATION_COOKIE).toBe("rsv_impersonation");
  });
});
