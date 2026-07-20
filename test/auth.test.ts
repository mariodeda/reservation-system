import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createImpersonationSession,
  createSession,
  IMPERSONATION_COOKIE,
  impersonationCookieOptions,
  SESSION_COOKIE,
  sessionCookieOptions,
  verifyImpersonationSession,
  verifySession,
} from "@/lib/reservations/auth";
import {
  hashPassword,
  templateSettings,
  verifyTenantLogin,
  type Tenant,
} from "@/lib/reservations/tenant";

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "unit-test-secret");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const tenant = (): Tenant => ({
  id: "t1",
  slug: "t1",
  name: "T1",
  status: "active",
  publicKey: "pk_test",
  settings: templateSettings(),
  adminUsername: "staff",
  adminPasswordHash: hashPassword("s3cret"),
  createdAt: new Date(0).toISOString(),
});

describe("session token", () => {
  it("round-trips a valid session", async () => {
    const token = await createSession("default", "staff");
    expect(token).toContain(".");
    const payload = await verifySession(token);
    expect(payload?.u).toBe("staff");
    expect(payload?.tid).toBe("default");
    expect(typeof payload?.exp).toBe("number");
  });

  it("rejects a tampered signature", async () => {
    const token = await createSession("default", "staff");
    const [payload] = token.split(".");
    expect(await verifySession(`${payload}.deadbeef`)).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const token = await createSession("default", "staff");
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "attacker", exp: Date.now() + 1e6 }))
      .toString("base64")
      .replace(/=+$/, "");
    expect(await verifySession(`${forged}.${sig}`)).toBeNull();
  });

  it("rejects undefined / malformed tokens", async () => {
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession("no-dot-here")).toBeNull();
  });

  it("rejects an expired token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-11T10:00:00Z"));
    const token = await createSession("default", "staff");
    vi.setSystemTime(new Date("2026-06-18T09:59:59Z")); // just under 7 days
    expect(await verifySession(token)).not.toBeNull();
    vi.setSystemTime(new Date("2026-06-18T10:00:01Z")); // just past the 7-day TTL
    expect(await verifySession(token)).toBeNull();
  });

  it("does not validate a token signed with a different secret", async () => {
    const token = await createSession("default", "staff");
    vi.stubEnv("SESSION_SECRET", "a-different-secret");
    expect(await verifySession(token)).toBeNull();
  });

  it("keeps impersonation tokens distinct from normal staff sessions", async () => {
    const token = await createImpersonationSession("default", "ops");
    expect(await verifySession(token)).toBeNull();
    const payload = await verifyImpersonationSession(token);
    expect(payload).toMatchObject({
      tid: "default",
      u: "platform:ops",
      impersonatedBy: "ops",
      imp: true,
    });
  });
});

describe("malformed payload", () => {
  it("returns null when a correctly-signed payload is not valid JSON", async () => {
    const { createHmac } = await import("node:crypto");
    const b64url = (buf: Buffer) =>
      buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const payload = b64url(Buffer.from("not-json{"));
    const sig = b64url(createHmac("sha256", "unit-test-secret").update(payload).digest());
    expect(await verifySession(`${payload}.${sig}`)).toBeNull();
  });
});

describe("verifyTenantLogin", () => {
  it("accepts correct credentials", () => {
    expect(verifyTenantLogin(tenant(), "staff", "s3cret")).toBe(true);
  });
  it("rejects wrong username or password", () => {
    expect(verifyTenantLogin(tenant(), "nope", "s3cret")).toBe(false);
    expect(verifyTenantLogin(tenant(), "staff", "nope")).toBe(false);
  });
  it("rejects a disabled tenant even with correct credentials", () => {
    expect(verifyTenantLogin({ ...tenant(), status: "disabled" }, "staff", "s3cret")).toBe(false);
  });
});

describe("cookie", () => {
  it("exposes a hardened cookie config", () => {
    expect(SESSION_COOKIE).toBe("rsv_session");
    expect(IMPERSONATION_COOKIE).toBe("rsv_impersonation");
    expect(sessionCookieOptions.httpOnly).toBe(true);
    expect(sessionCookieOptions.sameSite).toBe("lax");
    expect(sessionCookieOptions.path).toBe("/");
    expect(sessionCookieOptions.maxAge).toBe(7 * 24 * 60 * 60);
    expect(impersonationCookieOptions.httpOnly).toBe(true);
    expect(impersonationCookieOptions.sameSite).toBe("lax");
    expect(impersonationCookieOptions.path).toBe("/");
    expect(impersonationCookieOptions.maxAge).toBe(7 * 24 * 60 * 60);
  });
});
