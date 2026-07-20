// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { adminJson, toast } = vi.hoisted(() => ({
  adminJson: vi.fn(),
  toast: vi.fn(),
}));
const searchParams = vi.hoisted(() => ({ value: "date=2099-07-04" }));
const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("@/components/admin/api", () => ({
  adminJson,
  toast,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "acme" }),
  usePathname: () => "/admin/acme/reservations",
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(searchParams.value),
}));

import ReservationsPage from "@/app/admin/[slug]/(panel)/reservations/page";

const reservation = {
  id: "res-1",
  reference: "ABC123",
  date: "2099-07-04",
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
  router.replace.mockReset();
  searchParams.value = "date=2099-07-04";
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
      const requestDate = new URL(url, "http://localhost").searchParams.get("date") ?? "2099-07-04";
      return Promise.resolve({
        date: requestDate,
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
  it("scrolls to and pings a reservation linked from a notification", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    const realSetTimeout = window.setTimeout;
    let finishPulse: (() => void) | undefined;
    const timeoutSpy = vi.spyOn(window, "setTimeout").mockImplementation(((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (timeout === 2200 && typeof handler === "function") {
        finishPulse = () => handler(...args);
        return 1;
      }
      return realSetTimeout(handler, timeout, ...args);
    }) as typeof window.setTimeout);
    searchParams.value = "date=2099-07-04&reservation=res-1";

    const { container } = render(<ReservationsPage />);

    await screen.findAllByText("Jane");
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" }));
    expect(container.querySelector('[data-reservation-id="res-1"]')).toHaveClass("reservation-row-ping");
    expect(router.replace).not.toHaveBeenCalled();

    act(() => {
      finishPulse?.();
    });

    expect(container.querySelector('[data-reservation-id="res-1"]')).not.toHaveClass("reservation-row-ping");
    expect(router.replace).toHaveBeenCalledWith("/admin/acme/reservations?date=2099-07-04", { scroll: false });
    timeoutSpy.mockRestore();
  });

  it("opens the floor modal from the date-row reservations metric", async () => {
    const user = userEvent.setup();
    render(<ReservationsPage />);

    const reservationsMetrics = await screen.findAllByRole("button", { name: /open floor view for reservations/i });
    expect(reservationsMetrics).toHaveLength(1);
    expect(await screen.findAllByRole("button", { name: /open floor view for covers/i })).toHaveLength(1);

    await user.click(reservationsMetrics[0]);

    expect(await screen.findByRole("dialog", { name: /floor/i })).toBeInTheDocument();
    expect(await screen.findByTitle("20:00 · Jane (2)")).toBeInTheDocument();
  });

  it("keeps stop online booking enabled for an active selected slot", async () => {
    const user = userEvent.setup();
    render(<ReservationsPage />);

    await user.click(await screen.findByRole("button", { name: /20:00.*2\/10 covers in turn window/i }));
    const stop = await screen.findByRole("button", { name: /stop online bookings for 20:00/i });
    expect(stop).toBeEnabled();

    await user.click(stop);
    expect(adminJson).toHaveBeenCalledWith("/api/admin/slot-blocks", expect.objectContaining({ method: "PATCH" }));
    const slotBlockCall = adminJson.mock.calls.find(([url]) => url === "/api/admin/slot-blocks");
    expect(slotBlockCall).toBeTruthy();
    const body = JSON.parse(slotBlockCall?.[1]?.body as string);
    expect(body).toMatchObject({ offering: "main", time: "20:00", blocked: true });
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("disables stop online booking when the selected slot is no longer active", async () => {
    slotAvailable = false;
    const user = userEvent.setup();
    render(<ReservationsPage />);

    await user.click(await screen.findByRole("button", { name: /20:00.*2\/10 covers in turn window/i }));

    expect(await screen.findByRole("button", { name: /stop online bookings for 20:00/i })).toBeDisabled();
  });
});
