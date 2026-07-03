// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DayAvailability } from "@/lib/reservations/types";

const { adminJson, toast } = vi.hoisted(() => ({ adminJson: vi.fn(), toast: vi.fn() }));
vi.mock("@/components/admin/api", () => ({ adminJson, toast }));

import DayOccupancy from "@/components/admin/DayOccupancy";

function day(over: Partial<DayAvailability> = {}): DayAvailability {
  return {
    date: "2099-06-12", closed: false, past: false, full: false,
    services: [
      { id: "lunch", label: "Lunch", slots: [
        { time: "12:00", capacity: 10, booked: 4, remaining: 6, available: true },   // open (green)
        { time: "12:30", capacity: 10, booked: 8, remaining: 2, available: true },   // nearly full (amber)
        { time: "13:00", capacity: 10, booked: 10, remaining: 0, available: false }, // full (rose)
        { time: "13:30", capacity: 10, booked: 5, remaining: 5, available: false, unavailableReason: "blocked" },  // blocked (grey)
      ], turnMinutes: 120 },
    ],
    ...over,
  };
}

beforeEach(() => {
  adminJson.mockReset();
  toast.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("DayOccupancy", () => {
  it("shows per-service covers and a slot chip per time", async () => {
    adminJson.mockResolvedValue(day());
    render(<DayOccupancy date="2099-06-12" />);
    expect(adminJson).toHaveBeenCalledWith("/api/admin/availability?date=2099-06-12");
    expect(await screen.findByText("Lunch")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /12:00.*4\/10 covers booked.*6 left.*healthy availability/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /12:30.*8\/10 covers booked.*2 left.*low availability/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /13:00.*10\/10 covers booked.*0 left.*fully booked/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /13:30.*5\/10 covers booked.*5 left.*time blocked/i })).toBeInTheDocument();
    // a tile per slot, coloured per fullness (open/amber/full/blocked)
    for (const t of ["12:00", "12:30", "13:00", "13:30"]) {
      expect(screen.getByRole("button", { name: new RegExp(t) })).toBeInTheDocument();
    }
    expect(screen.getByText("Full")).toBeInTheDocument();
    expect(screen.getAllByText(/time blocked/i).length).toBeGreaterThan(0);
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
    render(<DayOccupancy date="2099-06-12" />);
    await waitFor(() =>
      expect(screen.getByText(/could not load availability/i)).toBeInTheDocument(),
    );
  });

  it("opens slot actions before creating a reservation from a slot", async () => {
    const user = userEvent.setup();
    adminJson.mockResolvedValue(day());
    const onPick = vi.fn();
    render(<DayOccupancy date="2099-06-12" onPickSlot={onPick} />);
    await user.click(await screen.findByRole("button", { name: /12:00/ }));
    expect(screen.getByRole("dialog", { name: "Slot actions" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add reservation at 12:00" }));
    expect(onPick).toHaveBeenCalledWith("lunch", "12:00");
  });

  it("disables slot buttons when no onPickSlot is given", async () => {
    adminJson.mockResolvedValue(day());
    render(<DayOccupancy date="2099-06-12" />);
    expect(await screen.findByRole("button", { name: /12:00/ })).toBeDisabled();
  });

  it("shows green, warning and critical cover availability by slot", async () => {
    adminJson.mockResolvedValue(day({
      services: [
        {
          id: "healthy",
          label: "Healthy",
          turnMinutes: 120,
          slots: [{ time: "12:00", capacity: 100, booked: 40, remaining: 60, available: true }],
        },
        {
          id: "low",
          label: "Low",
          turnMinutes: 120,
          slots: [{ time: "13:00", capacity: 100, booked: 75, remaining: 25, available: true }],
        },
        {
          id: "critical",
          label: "Critical",
          turnMinutes: 120,
          slots: [{ time: "14:00", capacity: 100, booked: 96, remaining: 4, available: true }],
        },
      ],
    }));
    render(<DayOccupancy date="2099-06-12" />);

    expect(await screen.findByRole("button", { name: /12:00.*40\/100 covers booked.*60 left.*healthy availability/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /13:00.*75\/100 covers booked.*25 left.*low availability/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /14:00.*96\/100 covers booked.*4 left.*critical availability/i })).toBeInTheDocument();
  });

  it("shows covers per slot instead of a peak service recap", async () => {
    adminJson.mockResolvedValue(day({
      services: [
        {
          id: "dinner",
          label: "Dinner",
          turnMinutes: 120,
          slots: [
            { time: "18:00", capacity: 20, booked: 1, remaining: 19, available: false, unavailableReason: "service_disabled" },
            { time: "18:30", capacity: 20, booked: 7, remaining: 13, available: true },
            { time: "19:00", capacity: 20, booked: 4, remaining: 16, available: true },
          ],
        },
      ],
    }));
    render(<DayOccupancy date="2099-06-12" />);

    expect(await screen.findByRole("button", { name: /18:30.*7\/20 covers booked.*13 left.*healthy availability/i })).toBeInTheDocument();
    expect(screen.getAllByText("7/20 covers")).toHaveLength(1);
  });

  it("hides the availability icon and mutes the recap after the service turn has ended", async () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    adminJson.mockResolvedValue(day({
      date: today,
      services: [
        {
          id: "lunch",
          label: "Lunch",
          turnMinutes: 1,
          slots: [{ time: "00:00", capacity: 20, booked: 4, remaining: 16, available: false }],
        },
      ],
    }));
    render(<DayOccupancy date={today} />);

    expect(await screen.findByRole("button", { name: /00:00.*4\/20 covers booked.*16 left.*service ended/i })).toHaveClass("text-on-surface-variant/70");
    expect(screen.queryByText("Open")).not.toBeInTheDocument();
  });

  it("toggles an individual slot stop from the slot actions modal without picking the slot", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const onChanged = vi.fn();
    adminJson
      .mockResolvedValueOnce(day())
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce(day({
        services: [
          {
            id: "lunch",
            label: "Lunch",
            turnMinutes: 120,
            slots: [{ time: "12:00", capacity: 10, booked: 4, remaining: 6, available: false, unavailableReason: "blocked" }],
          },
        ],
      }));

    render(
      <DayOccupancy
        date="2099-06-12"
        offering="main"
        allowSlotStops
        onPickSlot={onPick}
        onSlotStopChanged={onChanged}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /12:00.*4\/10 covers booked/i }));
    expect(screen.getByRole("dialog", { name: "Slot actions" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Stop online bookings for 12:00/i }));

    await waitFor(() =>
      expect(adminJson).toHaveBeenCalledWith("/api/admin/slot-blocks", expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ date: "2099-06-12", offering: "main", time: "12:00", blocked: true }),
      })),
    );
    expect(onPick).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledOnce();
    expect(toast).toHaveBeenCalledWith("Slot booking state updated.");
  });
});
