// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
    expect(screen.getByRole("button", { name: /12:00.*4\/10 covers in turn window.*6 left online.*healthy availability/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /12:30.*8\/10 covers in turn window.*2 left online.*low availability/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /13:00.*10\/10 covers in turn window.*0 left online.*fully booked/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /13:30.*5\/10 covers in turn window.*5 left online.*time blocked/i })).toBeInTheDocument();
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

  it("opens the floor view from the service covers summary when provided", async () => {
    const user = userEvent.setup();
    adminJson.mockResolvedValue(day());
    const onOpenFloor = vi.fn();
    render(<DayOccupancy date="2026-06-12" onOpenFloor={onOpenFloor} />);
    await user.click(await screen.findByRole("button", { name: /lunch.*27\/40 in turn window/i }));
    expect(onOpenFloor).toHaveBeenCalled();
  });

  it("explains why slot capacity counts overlapping table-duration windows", async () => {
    const user = userEvent.setup();
    adminJson.mockResolvedValue(day());
    render(<DayOccupancy date="2099-06-12" />);

    await user.click(await screen.findByRole("button", { name: /how slot capacity is calculated/i }));

    const dialog = screen.getByRole("dialog", { name: /how slot capacity is calculated/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/new booking's table-duration window/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/18:30-20:30/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /got it/i }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /how slot capacity is calculated/i })).not.toBeInTheDocument(),
    );
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

    expect(await screen.findByRole("button", { name: /12:00.*40\/100 covers in turn window.*60 left online.*healthy availability/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /13:00.*75\/100 covers in turn window.*25 left online.*low availability/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /14:00.*96\/100 covers in turn window.*4 left online.*critical availability/i })).toBeInTheDocument();
  });

  it("shows a clear overbooking warning when booked covers exceed capacity", async () => {
    const user = userEvent.setup();
    adminJson.mockResolvedValue(day({
      services: [
        {
          id: "dinner",
          label: "Dinner",
          turnMinutes: 120,
          slots: [{ time: "20:00", capacity: 10, booked: 13, remaining: 0, overbookedBy: 3, available: false, unavailableReason: "capacity" }],
        },
      ],
    }));
    render(<DayOccupancy date="2099-06-12" onPickSlot={() => {}} />);

    const slot = await screen.findByRole("button", { name: /20:00.*13\/10 covers in turn window.*3 over capacity.*overbooked by 3 covers/i });
    expect(slot).toBeInTheDocument();
    expect(screen.getByText("Over by 3")).toBeInTheDocument();

    await user.click(slot);
    expect(screen.getAllByText("Overbooked by 3 covers").length).toBeGreaterThan(0);
    expect(screen.getByText("Closed - over capacity")).toBeInTheDocument();
    expect(screen.getByText(/Public availability is closed for this slot/i)).toBeInTheDocument();
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

    expect(await screen.findByRole("button", { name: /18:30.*7\/20 covers in turn window.*13 left online.*healthy availability/i })).toBeInTheDocument();
    expect(screen.getAllByText("7/20 in turn window")).toHaveLength(1);
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

    expect(await screen.findByRole("button", { name: /00:00.*4\/20 covers in turn window.*16 left online.*service ended/i })).toHaveClass("text-on-surface-variant/70");
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

    await user.click(await screen.findByRole("button", { name: /12:00.*4\/10 covers in turn window/i }));
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

  it("edits manual slot capacity from the slot actions modal", async () => {
    const user = userEvent.setup();
    adminJson
      .mockResolvedValueOnce(day({ capacityMode: "manual" }))
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce(day({ capacityMode: "manual" }));

    render(<DayOccupancy date="2099-06-12" offering="main" onPickSlot={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: /12:00.*4\/10 covers in turn window/i }));
    expect(screen.getByRole("dialog", { name: "Slot actions" })).toBeInTheDocument();
    const capacity = screen.getByLabelText("Maximum covers for this slot") as HTMLInputElement;
    expect(capacity.value).toBe("10");
    await user.clear(capacity);
    await user.type(capacity, "14");
    expect(screen.getByRole("radio", { name: /today only/i })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: /all days moving forward/i }));
    await user.click(screen.getByRole("button", { name: "Save slot capacity" }));

    await waitFor(() =>
      expect(adminJson).toHaveBeenCalledWith("/api/admin/slot-capacity", expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          date: "2099-06-12",
          offering: "main",
          service: "lunch",
          time: "12:00",
          capacity: 14,
          scope: "future",
        }),
      })),
    );
    expect(toast).toHaveBeenCalledWith("Slot capacity updated.");
  });

  it("closes the slot actions modal with Escape", async () => {
    const user = userEvent.setup();
    adminJson.mockResolvedValueOnce(day());

    render(<DayOccupancy date="2099-06-12" offering="main" onPickSlot={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: /12:00.*4\/10 covers in turn window/i }));
    expect(screen.getByRole("dialog", { name: "Slot actions" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Slot actions" })).not.toBeInTheDocument();
  });
});
