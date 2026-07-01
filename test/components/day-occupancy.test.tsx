// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DayAvailability } from "@/lib/reservations/types";

const { adminJson } = vi.hoisted(() => ({ adminJson: vi.fn() }));
vi.mock("@/components/admin/api", () => ({ adminJson }));

import DayOccupancy from "@/components/admin/DayOccupancy";

function day(over: Partial<DayAvailability> = {}): DayAvailability {
  return {
    date: "2026-06-12", closed: false, past: false, full: false,
    services: [
      { id: "lunch", label: "Lunch", slots: [
        { time: "12:00", capacity: 10, booked: 4, remaining: 6, available: true },   // open (green)
        { time: "12:30", capacity: 10, booked: 8, remaining: 2, available: true },   // nearly full (amber)
        { time: "13:00", capacity: 10, booked: 10, remaining: 0, available: false }, // full (rose)
        { time: "13:30", capacity: 10, booked: 5, remaining: 5, available: false },  // blocked/past (grey)
      ] },
    ],
    ...over,
  };
}

beforeEach(() => adminJson.mockReset());
afterEach(() => vi.restoreAllMocks());

describe("DayOccupancy", () => {
  it("shows per-service covers and a slot chip per time", async () => {
    adminJson.mockResolvedValue(day());
    render(<DayOccupancy date="2026-06-12" />);
    expect(adminJson).toHaveBeenCalledWith("/api/admin/availability?date=2026-06-12");
    expect(await screen.findByText("Lunch")).toBeInTheDocument();
    expect(screen.getByText("27/40 covers")).toBeInTheDocument(); // 4+8+10+5 booked / 4*10 cap
    expect(screen.getByLabelText(/13\/40 covers available \(33%\).*healthy availability/i)).toBeInTheDocument();
    // a chip per slot, coloured per fullness (open/amber/full/blocked)
    for (const t of ["12:00", "12:30", "13:00", "13:30"]) {
      expect(screen.getByRole("button", { name: t })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "13:00" })).toHaveAttribute("title", "Fully booked");
    expect(screen.getByRole("button", { name: "13:30" })).toHaveAttribute("title", expect.stringMatching(/unavailable/i));
  });

  it("renders a closed-day message", async () => {
    adminJson.mockResolvedValue(day({ closed: true, services: [] }));
    render(<DayOccupancy date="2026-06-14" />);
    expect(await screen.findByText(/closed on this date/i)).toBeInTheDocument();
  });

  it("renders a no-service message when open but empty", async () => {
    adminJson.mockResolvedValue(day({ closed: false, services: [] }));
    render(<DayOccupancy date="2026-08-30" />);
    expect(await screen.findByText(/no service configured/i)).toBeInTheDocument();
  });

  it("renders an error message on fetch error", async () => {
    adminJson.mockRejectedValue(new Error("boom"));
    render(<DayOccupancy date="2026-06-12" />);
    await waitFor(() =>
      expect(screen.getByText(/could not load availability/i)).toBeInTheDocument(),
    );
  });

  it("calls onPickSlot with service id and time when a slot is clicked", async () => {
    const user = userEvent.setup();
    adminJson.mockResolvedValue(day());
    const onPick = vi.fn();
    render(<DayOccupancy date="2026-06-12" onPickSlot={onPick} />);
    await user.click(await screen.findByRole("button", { name: "12:00" }));
    expect(onPick).toHaveBeenCalledWith("lunch", "12:00");
  });

  it("disables slot buttons when no onPickSlot is given", async () => {
    adminJson.mockResolvedValue(day());
    render(<DayOccupancy date="2026-06-12" />);
    expect(await screen.findByRole("button", { name: "12:00" })).toBeDisabled();
  });

  it("shows green, warning and critical cover availability icons by service", async () => {
    adminJson.mockResolvedValue(day({
      services: [
        {
          id: "healthy",
          label: "Healthy",
          slots: [{ time: "12:00", capacity: 100, booked: 40, remaining: 60, available: true }],
        },
        {
          id: "low",
          label: "Low",
          slots: [{ time: "13:00", capacity: 100, booked: 75, remaining: 25, available: true }],
        },
        {
          id: "critical",
          label: "Critical",
          slots: [{ time: "14:00", capacity: 100, booked: 96, remaining: 4, available: true }],
        },
      ],
    }));
    render(<DayOccupancy date="2026-06-12" />);

    expect(await screen.findByLabelText(/60\/100 covers available \(60%\).*healthy availability/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/25\/100 covers available \(25%\).*low availability/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/4\/100 covers available \(4%\).*critical availability/i)).toBeInTheDocument();
  });

  it("bases cover availability icons on reserved/total capacity, not current slot bookability", async () => {
    adminJson.mockResolvedValue(day({
      services: [
        {
          id: "dinner",
          label: "Dinner",
          slots: [
            { time: "18:00", capacity: 180, booked: 1, remaining: 179, available: false },
          ],
        },
      ],
    }));
    render(<DayOccupancy date="2026-06-12" />);

    expect(await screen.findByText("1/180 covers")).toBeInTheDocument();
    expect(screen.getByLabelText(/179\/180 covers available \(99%\).*healthy availability/i)).toBeInTheDocument();
  });
});
