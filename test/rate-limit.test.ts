import { describe, expect, it } from "vitest";
import { clientIp } from "@/lib/reservations/rate-limit";

// Rate limiting with MySQL is tested in store-mysql.test.ts
// (MySQL-backed rate limiter shared store tests).

describe("clientIp", () => {
  const make = (headers: Record<string, string>) => new Request("http://x", { headers });
  it("uses the first x-forwarded-for entry", () => {
    expect(clientIp(make({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1");
  });
  it("falls back to x-real-ip", () => {
    expect(clientIp(make({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
  });
  it("defaults to 'local' when no headers present", () => {
    expect(clientIp(make({}))).toBe("local");
  });
});
