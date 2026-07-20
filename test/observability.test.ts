import { describe, expect, it } from "vitest";
import { hashValue, sanitizeMetadata, safeError } from "@/lib/observability/logger";

describe("observability logger helpers", () => {
  it("hashes values deterministically without returning the raw input", () => {
    const a = hashValue("guest@example.com");
    const b = hashValue("guest@example.com");
    expect(a).toBe(b);
    expect(a).not.toContain("guest");
    expect(a).toHaveLength(24);
    expect(hashValue("")).toBeUndefined();
  });

  it("redacts sensitive metadata recursively", () => {
    expect(sanitizeMetadata({
      email: "guest@example.com",
      phone: "+39",
      safe: "ok",
      nested: { token: "secret", count: 2 },
      list: [{ password: "pw", event: "x" }],
    })).toEqual({
      email: "[redacted]",
      phone: "[redacted]",
      safe: "ok",
      nested: { token: "[redacted]", count: 2 },
      list: [{ password: "[redacted]", event: "x" }],
    });
  });

  it("serializes errors into bounded plain objects", () => {
    const err = safeError(new Error("boom"));
    expect(err.name).toBe("Error");
    expect(err.message).toBe("boom");
    expect(err.stack?.split("\n").length).toBeLessThanOrEqual(8);
  });
});
