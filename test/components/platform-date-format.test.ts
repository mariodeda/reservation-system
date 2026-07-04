import { afterEach, describe, expect, it, vi } from "vitest";
import { formatPlatformDateTime } from "@/components/platform/date-format";

describe("formatPlatformDateTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats platform timestamps with a relative suffix", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T10:37:30.635Z"));

    const formatted = formatPlatformDateTime("2026-07-04T10:07:30.635Z");

    expect(formatted).toContain("(");
    expect(formatted).toContain(")");
    expect(formatted).not.toBe("2026-07-04T10:07:30.635Z");
  });

  it("keeps invalid values visible for debugging", () => {
    expect(formatPlatformDateTime("not-a-date")).toBe("not-a-date");
  });
});
