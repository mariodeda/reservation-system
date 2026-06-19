import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlatformSession, verifyPlatformSession } from "@/lib/reservations/platform-auth";
import { createSession, verifySession } from "@/lib/reservations/auth";

beforeEach(() => vi.stubEnv("SESSION_SECRET", "platform-test-secret"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("platform session", () => {
  it("round-trips a platform session", async () => {
    const token = await createPlatformSession("ops");
    const p = await verifyPlatformSession(token);
    expect(p?.role).toBe("platform");
    expect(p?.u).toBe("ops");
  });

  it("rejects a tenant session token as a platform session", async () => {
    const tenantToken = await createSession("acme", "staff");
    expect(await verifyPlatformSession(tenantToken)).toBeNull();
  });

  it("rejects a platform token as a tenant session", async () => {
    const platformToken = await createPlatformSession("ops");
    expect(await verifySession(platformToken)).toBeNull();
  });

  it("rejects undefined / tampered / wrong-secret tokens", async () => {
    expect(await verifyPlatformSession(undefined)).toBeNull();
    const token = await createPlatformSession("ops");
    expect(await verifyPlatformSession(`${token.split(".")[0]}.deadbeef`)).toBeNull();
    vi.stubEnv("SESSION_SECRET", "different");
    expect(await verifyPlatformSession(token)).toBeNull();
  });

  it("expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-11T10:00:00Z"));
    const token = await createPlatformSession("ops");
    vi.setSystemTime(new Date("2026-06-12T10:00:00Z"));
    expect(await verifyPlatformSession(token)).toBeNull();
  });
});
