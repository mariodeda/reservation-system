// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

const { adminJson, toast } = vi.hoisted(() => ({
  adminJson: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/components/admin/api", () => ({
  adminJson,
  toast,
  adminFetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "acme" }),
}));

import DashboardPage from "@/app/admin/[slug]/(panel)/page";

beforeEach(() => {
  adminJson.mockReset();
  toast.mockReset();
  adminJson.mockImplementation((url: string) => {
    if (url === "/api/admin/config") {
      return Promise.resolve({
        config: {
          timezone: "Europe/Rome",
          offerings: [],
          weekly: {},
          dateOverrides: {},
          blockedSlots: {},
        },
      });
    }
    if (url === "/api/admin/tables") {
      return Promise.resolve({
        tables: [{
          id: "table-1",
          offering: null,
          label: "5",
          capacity: 4,
          minParty: 1,
          sortOrder: 0,
          joinable: false,
          active: true,
          createdAt: "",
        }],
      });
    }
    if (url.startsWith("/api/admin/reservations")) {
      return Promise.resolve({
        reservations: [{
          id: "res-1",
          reference: "ABC123",
          date: "2026-07-01",
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
        }],
      });
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
});

describe("DashboardPage table assignment", () => {
  it("loads managed tables and renders the shared assignment dropdown", async () => {
    render(<DashboardPage />);

    expect(await screen.findByText("Jane")).toBeInTheDocument();
    expect(await screen.findByRole("combobox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /5/ })).toBeInTheDocument();
  });

  it("keeps existing rows mounted during background polling", async () => {
    let reservationCalls = 0;
    let intervalCallback: (() => void) | undefined;
    const setIntervalSpy = vi.spyOn(window, "setInterval").mockImplementation((cb: TimerHandler) => {
      intervalCallback = cb as () => void;
      return 1 as unknown as ReturnType<typeof window.setInterval>;
    });
    const clearIntervalSpy = vi.spyOn(window, "clearInterval").mockImplementation(() => {});
    adminJson.mockImplementation((url: string) => {
      if (url === "/api/admin/config") {
        return Promise.resolve({
          config: { timezone: "Europe/Rome", offerings: [], weekly: {}, dateOverrides: {}, blockedSlots: {} },
        });
      }
      if (url === "/api/admin/tables") return Promise.resolve({ tables: [] });
      if (url.startsWith("/api/admin/reservations")) {
        reservationCalls += 1;
        if (reservationCalls === 1) {
          return Promise.resolve({
            reservations: [{
              id: "res-1",
              reference: "ABC123",
              date: "2026-07-01",
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
            }],
          });
        }
        return new Promise(() => {});
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    const { unmount } = render(<DashboardPage />);
    expect(await screen.findByText("Jane")).toBeInTheDocument();

    act(() => { intervalCallback?.(); });

    expect(screen.getByText("Jane")).toBeInTheDocument();
    expect(document.querySelectorAll(".animate-pulse")).toHaveLength(0);
    unmount();
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });
});
