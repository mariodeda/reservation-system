// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { adminFetch, adminJson, toast } = vi.hoisted(() => ({
  adminFetch: vi.fn(),
  adminJson: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/components/admin/api", () => ({ adminFetch, adminJson, toast }));

import TodayBookingControls from "@/components/admin/TodayBookingControls";

const response = {
  date: "2026-07-01",
  timezone: "Europe/Rome",
  leadMinutes: 120,
  services: [
    {
      offering: "main",
      offeringLabel: "Dining",
      service: "lunch",
      serviceLabel: "Lunch",
      start: "12:00",
      end: "16:00",
      cutoffTime: "14:00",
      disabled: true,
      cutoffPassed: false,
    },
    {
      offering: "main",
      offeringLabel: "Dining",
      service: "dinner",
      serviceLabel: "Dinner",
      start: "18:00",
      end: "22:00",
      cutoffTime: "20:00",
      disabled: false,
      cutoffPassed: false,
    },
    {
      offering: "main",
      offeringLabel: "Dining",
      service: "late",
      serviceLabel: "Late",
      start: "20:00",
      end: "21:00",
      cutoffTime: "19:00",
      disabled: false,
      cutoffPassed: true,
    },
  ],
};

beforeEach(() => {
  adminFetch.mockReset();
  adminJson.mockReset();
  toast.mockReset();
  adminJson.mockResolvedValue(response);
  adminFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      ...response,
      services: response.services.map((s) => s.service === "dinner" ? { ...s, disabled: true } : s),
    }),
  });
});

describe("TodayBookingControls", () => {
  it("shows stopped services clearly in the header popup", async () => {
    const user = userEvent.setup();
    render(<TodayBookingControls />);

    await screen.findByRole("button", { name: "Today bookings" });
    await user.click(screen.getByRole("button", { name: "Today bookings" }));

    expect(screen.getAllByText("Today booking controls").length).toBeGreaterThan(0);
    const lunch = screen.getByText("Lunch").closest("div")!.parentElement!.parentElement!;
    expect(within(lunch).getByText("Stopped")).toBeInTheDocument();
    expect(screen.getByText("1 stopped")).toBeInTheDocument();
  });

  it("toggles a service and disables services whose cutoff has passed", async () => {
    const user = userEvent.setup();
    render(<TodayBookingControls />);
    await user.click(await screen.findByRole("button", { name: "Today bookings" }));

    const switches = screen.getAllByRole("checkbox");
    expect(switches[2]).toBeDisabled();
    await user.click(switches[1]);

    expect(adminFetch).toHaveBeenCalledWith(
      "/api/admin/today-booking-controls",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ offering: "main", service: "dinner", disabled: true }),
      }),
    );
    expect(toast).toHaveBeenCalledWith("Booking controls updated");
  });

  it("closes the popup with Escape", async () => {
    const user = userEvent.setup();
    render(<TodayBookingControls />);

    await user.click(await screen.findByRole("button", { name: "Today bookings" }));
    expect(screen.getByRole("dialog", { name: "Today booking controls" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Today booking controls" })).not.toBeInTheDocument();
  });
});
