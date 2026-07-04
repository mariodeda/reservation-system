// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { adminJson, toast } = vi.hoisted(() => ({
  adminJson: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/components/admin/api", () => ({
  adminJson,
  toast,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "acme" }),
  useSearchParams: () => new URLSearchParams("date=2026-07-04"),
}));

import ReservationsPage from "@/app/admin/[slug]/(panel)/reservations/page";

const reservation = {
  id: "res-1",
  reference: "ABC123",
  date: "2026-07-04",
  time: "20:00",
  service: "dinner",
  partySize: 2,
  name: "Jane",
  email: "jane@example.com",
  phone: "555",
  status: "confirmed",
  source: "web",
  createdAt: "",
  updatedAt: "",
};

const table = {
  id: "table-1",
  offering: null,
  label: "T1",
  capacity: 2,
  minParty: 1,
  sortOrder: 0,
  joinable: false,
  active: true,
  createdAt: "",
};

let slotAvailable = true;

beforeEach(() => {
  adminJson.mockReset();
  toast.mockReset();
  slotAvailable = true;
  adminJson.mockImplementation((url: string, init?: RequestInit) => {
    if (url === "/api/admin/slot-blocks" && init?.method === "PATCH") {
      return Promise.resolve({});
    }
    if (url === "/api/admin/config") {
      return Promise.resolve({
        config: {
          timezone: "UTC",
          offerings: [],
          weekly: {
            saturday: { services: [{ id: "dinner", label: "Dinner", start: "19:00", end: "22:00", slotMinutes: 30 }] },
          },
          dateOverrides: {},
          blockedSlots: {},
        },
      });
    }
    if (url.startsWith("/api/admin/tables?date=")) {
      return Promise.resolve({
        floor: [{
          table,
          state: "reserved",
          reservations: [{
            id: "res-1",
            time: "20:00",
            service: "dinner",
            partySize: 2,
            name: "Jane",
            status: "confirmed",
            durationMins: 90,
          }],
        }],
      });
    }
    if (url === "/api/admin/tables") {
      return Promise.resolve({ tables: [table] });
    }
    if (url.startsWith("/api/admin/reservations")) {
      return Promise.resolve({ reservations: [reservation] });
    }
    if (url.startsWith("/api/admin/availability")) {
      return Promise.resolve({
        date: "2026-07-04",
        closed: false,
        past: false,
        full: false,
        services: [{
          id: "dinner",
          label: "Dinner",
          slots: [{ time: "20:00", capacity: 10, booked: 2, remaining: 8, available: slotAvailable }],
        }],
      });
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
});

describe("ReservationsPage floor opening", () => {
  it("opens the floor modal when the reservations stat card is clicked", async () => {
    const user = userEvent.setup();
    render(<ReservationsPage />);

    await user.click(await screen.findByRole("button", { name: /open floor view for reservations/i }));

    expect(await screen.findByRole("dialog", { name: /floor/i })).toBeInTheDocument();
    expect(await screen.findByTitle("20:00 · Jane (2)")).toBeInTheDocument();
  });

  it("keeps stop online booking enabled for an active selected slot", async () => {
    const user = userEvent.setup();
    render(<ReservationsPage />);

    await user.click(await screen.findByRole("button", { name: /20:00/i }));
    const stop = await screen.findByRole("button", { name: /stop online bookings for 20:00/i });
    expect(stop).toBeEnabled();

    await user.click(stop);
    expect(adminJson).toHaveBeenCalledWith("/api/admin/slot-blocks", expect.objectContaining({ method: "PATCH" }));
    const slotBlockCall = adminJson.mock.calls.find(([url]) => url === "/api/admin/slot-blocks");
    expect(slotBlockCall).toBeTruthy();
    const body = JSON.parse(slotBlockCall?.[1]?.body as string);
    expect(body).toMatchObject({ date: "2026-07-04", offering: "main", time: "20:00", blocked: true });
  });

  it("disables stop online booking when the selected slot is no longer active", async () => {
    slotAvailable = false;
    const user = userEvent.setup();
    render(<ReservationsPage />);

    await user.click(await screen.findByRole("button", { name: /20:00/i }));

    expect(await screen.findByRole("button", { name: /stop online bookings for 20:00/i })).toBeDisabled();
  });
});
