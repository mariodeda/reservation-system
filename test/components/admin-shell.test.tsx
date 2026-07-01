// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { push, replace, refresh } = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
const pathname = vi.hoisted(() => ({ value: "/admin/acme/reservations" }));
const reservationEvents = vi.hoisted(() => ({
  notifications: [] as Array<{
    id: string;
    notificationId: string;
    date: string;
    time: string;
    service: string;
    partySize: number;
    name: string;
    source: "web" | "admin";
    receivedAt: number;
    read: boolean;
  }>,
  markRead: vi.fn(),
  markAllRead: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh }),
  usePathname: () => pathname.value,
}));
// next/link -> plain anchor for the test environment.
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/components/admin/useReservationEvents", () => ({
  useReservationEvents: () => ({
    notifications: reservationEvents.notifications,
    unreadCount: reservationEvents.notifications.filter((n) => !n.read).length,
    connected: true,
    markRead: reservationEvents.markRead,
    markAllRead: reservationEvents.markAllRead,
  }),
}));

import AdminShell from "@/components/admin/AdminShell";

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  refresh.mockReset();
  reservationEvents.notifications = [];
  reservationEvents.markRead.mockReset();
  reservationEvents.markAllRead.mockReset();
  pathname.value = "/admin/acme/reservations";
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AdminShell", () => {
  it("renders the brand, nav links and children", () => {
    render(<AdminShell slug="acme" brandName="Osteria"><p>content</p></AdminShell>);
    expect(screen.getByText("Osteria")).toBeInTheDocument();
    // nav appears twice (desktop + mobile)
    expect(screen.getAllByRole("link", { name: "Dashboard" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("scopes nav links to the tenant slug", () => {
    render(<AdminShell slug="acme" brandName="O"><span /></AdminShell>);
    const reservations = screen.getAllByRole("link", { name: "Reservations" })[0];
    expect(reservations.getAttribute("href")).toBe("/admin/acme/reservations");
  });

  it("renders a logo image when logoUrl is set (instead of the wordmark)", () => {
    render(<AdminShell slug="acme" brandName="Osteria" logoUrl="https://cdn.example/acme.png"><span /></AdminShell>);
    const img = screen.getByRole("img", { name: "Osteria" });
    expect(img.getAttribute("src")).toBe("https://cdn.example/acme.png");
  });

  it("marks the active route (prefix match, with dashboard exact)", () => {
    pathname.value = "/admin/acme/reservations";
    render(<AdminShell slug="acme" brandName="O"><span /></AdminShell>);
    const reservations = screen.getAllByRole("link", { name: "Reservations" })[0];
    const dashboard = screen.getAllByRole("link", { name: "Dashboard" })[0];
    expect(reservations.className).toContain("text-primary");
    expect(dashboard.className).not.toContain("bg-primary/15"); // dashboard not active on a subpath
  });

  it("logs out: POSTs then redirects to the tenant's login", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    render(<AdminShell slug="acme" brandName="O"><span /></AdminShell>);

    await user.click(screen.getByRole("button", { name: /sign out/i }));
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/logout", { method: "POST" });
    expect(replace).toHaveBeenCalledWith("/admin/acme/login");
    expect(refresh).toHaveBeenCalled();
  });

  it("marks a toast notification read when dismissed", () => {
    vi.useFakeTimers();
    reservationEvents.notifications = [{
      id: "res-1",
      notificationId: "reservation.created:res-1:1:0",
      date: "2026-07-01",
      time: "20:00",
      service: "Dinner",
      partySize: 2,
      name: "Jane",
      source: "web",
      receivedAt: Date.now(),
      read: false,
    }];

    render(<AdminShell slug="acme" brandName="O"><span /></AdminShell>);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    act(() => { vi.advanceTimersByTime(400); });

    expect(reservationEvents.markRead).toHaveBeenCalledWith("reservation.created:res-1:1:0");
  });

  it("clears visible reservation toasts when marking all notifications read", async () => {
    const user = userEvent.setup();
    reservationEvents.notifications = [{
      id: "res-1",
      notificationId: "reservation.created:res-1:1:0",
      date: "2026-07-01",
      time: "20:00",
      service: "Dinner",
      partySize: 2,
      name: "Jane",
      source: "web",
      receivedAt: Date.now(),
      read: false,
    }];

    render(<AdminShell slug="acme" brandName="O"><span /></AdminShell>);
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /notifications/i }));
    await user.click(screen.getByRole("button", { name: /mark all read/i }));

    expect(reservationEvents.markAllRead).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.queryByText("Jane")).not.toBeInTheDocument();
    expect(screen.getByText("No unread notifications")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
  });

  it("removes a notification from the bell popup when it is opened", async () => {
    const user = userEvent.setup();
    reservationEvents.notifications = [{
      id: "res-1",
      notificationId: "reservation.created:res-1:1:0",
      date: "2026-07-01",
      time: "20:00",
      service: "Dinner",
      partySize: 2,
      name: "Jane",
      source: "web",
      receivedAt: Date.now(),
      read: false,
    }];

    render(<AdminShell slug="acme" brandName="O"><span /></AdminShell>);

    await user.click(screen.getByRole("button", { name: /notifications/i }));
    await user.click(screen.getByRole("button", { name: /Jane/ }));

    expect(reservationEvents.markRead).toHaveBeenCalledWith("reservation.created:res-1:1:0");
    expect(push).toHaveBeenCalledWith("/admin/acme/reservations?date=2026-07-01");
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.queryByText("Jane")).not.toBeInTheDocument();
    expect(screen.getByText("No unread notifications")).toBeInTheDocument();
  });
});
