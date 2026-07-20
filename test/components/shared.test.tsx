// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  formatDateLong,
  QUICK_ACTIONS,
  STATUS_META,
  StatusBadge,
  todayInTz,
} from "@/components/admin/shared";
import { RESERVATION_STATUSES } from "@/lib/reservations/types";

describe("formatDateLong", () => {
  it("formats a date in en-US, UTC (no timezone drift)", () => {
    expect(formatDateLong("2026-06-12")).toBe("Fri, Jun 12, 2026");
    expect(formatDateLong("2026-01-01")).toBe("Thu, Jan 1, 2026");
  });
});

describe("todayInTz", () => {
  afterEach(() => vi.useRealTimers());
  it("returns today's date in the given timezone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-11T23:30:00Z")); // -> next day in Europe/Rome (+2)
    expect(todayInTz("Europe/Rome")).toBe("2026-06-12");
    expect(todayInTz("UTC")).toBe("2026-06-11");
  });
});

describe("status metadata", () => {
  it("has metadata and quick actions for every status", () => {
    for (const s of RESERVATION_STATUSES) {
      expect(STATUS_META[s]?.label).toBeTruthy();
      expect(Array.isArray(QUICK_ACTIONS[s])).toBe(true);
    }
  });
  it("offers sensible transitions and dead-ends", () => {
    expect(QUICK_ACTIONS.pending).toContain("confirmed");
    expect(QUICK_ACTIONS.pending).not.toContain("cancelled");
    expect(QUICK_ACTIONS.confirmed).not.toContain("cancelled");
    expect(QUICK_ACTIONS.seated).toEqual(["completed"]);
    expect(QUICK_ACTIONS.completed).toEqual([]); // terminal
    expect(QUICK_ACTIONS.cancelled).toContain("confirmed"); // reinstate
  });
});

describe("StatusBadge", () => {
  it("renders the human label for a status", () => {
    render(<StatusBadge status="no_show" />);
    expect(screen.getByText("No-show")).toBeInTheDocument();
  });
});
