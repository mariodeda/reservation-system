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
    type?: "reservation.created" | "reservation.updated";
    status?: "pending" | "confirmed" | "seated" | "completed" | "cancelled" | "no_show";
    source: "web" | "admin" | "thefork" | "dish";
    receivedAt: number;
    read: boolean;
    live?: boolean;
  }>,
  markRead: vi.fn(),
  dismiss: vi.fn(),
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
    dismiss: reservationEvents.dismiss,
    markAllRead: reservationEvents.markAllRead,
  }),
}));
vi.mock("@/components/admin/TodayBookingControls", () => ({
  default: () => <button type="button">Today bookings</button>,
}));

import AdminShell from "@/components/admin/AdminShell";
import { DISMISS_ADMIN_TOOLTIPS_EVENT } from "@/components/admin/tooltip-events";

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  refresh.mockReset();
  reservationEvents.notifications = [];
  reservationEvents.markRead.mockReset();
  reservationEvents.dismiss.mockReset();
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
    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("href")).toBe("/admin/acme");
    expect(screen.getByRole("tooltip", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Osteria")).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("scopes nav links to the tenant slug", () => {
    render(<AdminShell slug="acme" brandName="O"><span /></AdminShell>);
    const reservations = screen.getAllByRole("link", { name: "Reservations" })[0];
    expect(reservations.getAttribute("href")).toBe("/admin/acme/reservations");
  });

  it("opens tenant settings menu from the gear before the language switch", async () => {
    const user = userEvent.setup();
    pathname.value = "/admin/acme/settings";
    render(<AdminShell slug="acme" brandName="O"><span /></AdminShell>);

    const settingsButton = screen.getByRole("button", { name: "Settings" });
    const helpLink = screen.getByRole("link", { name: "Help" });
    const italian = screen.getByRole("button", { name: "Italiano" });
    expect(screen.getByTestId("language-flag-it")).toBeInTheDocument();
    expect(screen.getByTestId("language-flag-en")).toBeInTheDocument();
    expect(settingsButton.className).toContain("bg-primary");
    expect(helpLink).toHaveAttribute("href", "/admin/acme/docs");
    expect(settingsButton.compareDocumentPosition(italian) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(settingsButton.compareDocumentPosition(helpLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(helpLink.compareDocumentPosition(italian) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();

    await user.click(settingsButton);

    expect(screen.getByText("Restaurant")).toBeInTheDocument();
    expect(screen.getAllByText("O")).toHaveLength(2);
    expect(screen.getByText("/acme")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Settings/ }).getAttribute("href")).toBe("/admin/acme/settings");
    expect(screen.getByRole("button", { name: /Sign out/ })).toBeInTheDocument();
  });

  it("shows and exits the impersonation banner", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    render(<AdminShell slug="acme" brandName="Osteria" impersonation={{ operator: "ops" }}><span /></AdminShell>);

    expect(screen.getByText("Impersonating Osteria")).toBeInTheDocument();
    expect(screen.getByText(/platform operator ops/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Exit impersonation" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/impersonation", { method: "DELETE" });
    expect(replace).toHaveBeenCalledWith("/platform");
    expect(refresh).toHaveBeenCalled();
  });

  it("groups clients and statistics under one dropdown nav item", () => {
    pathname.value = "/admin/acme/analytics";
    render(<AdminShell slug="acme" brandName="O"><span /></AdminShell>);

    const combined = screen.getAllByText("Clients & Statistics").find((el) => el.tagName.toLowerCase() === "summary");
    expect(combined).toBeTruthy();
    expect(combined?.className).toContain("bg-primary");
    expect(screen.getByRole("link", { name: "Clients" }).getAttribute("href")).toBe("/admin/acme/customers");
    expect(screen.getByRole("link", { name: "Statistics" }).getAttribute("href")).toBe("/admin/acme/analytics");
  });

  it("closes the clients/statistics dropdown when clicking outside", async () => {
    const user = userEvent.setup();
    render(<AdminShell slug="acme" brandName="O"><button type="button">Outside</button></AdminShell>);

    const dropdown = screen.getAllByText("Clients & Statistics").find((el) => el.tagName.toLowerCase() === "summary");
    const details = dropdown?.closest("details");
    expect(details).toBeTruthy();

    await user.click(dropdown!);
    expect(details).toHaveAttribute("open");

    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(details).not.toHaveAttribute("open");
  });

  it("navigates to the selected clients/statistics section from the mobile dropdown", async () => {
    const user = userEvent.setup();
    pathname.value = "/admin/acme/reservations";
    render(<AdminShell slug="acme" brandName="O"><span /></AdminShell>);

    await user.selectOptions(screen.getByRole("combobox", { name: "Clients & Statistics" }), "/admin/acme/customers");

    expect(push).toHaveBeenCalledWith("/admin/acme/customers");
  });

  it("renders a logo image when logoUrl is set (instead of the wordmark)", () => {
    render(<AdminShell slug="acme" brandName="Osteria" logoUrl="https://cdn.example/acme.png"><span /></AdminShell>);
    const img = screen.getByRole("img", { name: "Osteria" });
    expect(img.getAttribute("src")).toBe("https://cdn.example/acme.png");
    expect(img.parentElement).toHaveClass("bg-surface-container-high");
    expect(img.parentElement).toHaveClass("border-outline-variant/30");
  });

  it("marks the active route (prefix match, with dashboard exact)", () => {
    pathname.value = "/admin/acme/reservations";
    render(<AdminShell slug="acme" brandName="O"><span /></AdminShell>);
    const reservations = screen.getAllByRole("link", { name: "Reservations" })[0];
    expect(reservations.className).toContain("bg-primary");
  });

  it("logs out: POSTs then redirects to the tenant's login", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    render(<AdminShell slug="acme" brandName="O"><span /></AdminShell>);

    await user.click(screen.getByRole("button", { name: "Settings" }));
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
      live: true,
    }];

    render(<AdminShell slug="acme" brandName="O"><span /></AdminShell>);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    act(() => { vi.advanceTimersByTime(400); });

    expect(reservationEvents.dismiss).toHaveBeenCalledWith("reservation.created:res-1:1:0");
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
      live: true,
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
    expect(push).toHaveBeenCalledWith("/admin/acme/reservations?date=2026-07-01&reservation=res-1");
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.queryByText("Jane")).not.toBeInTheDocument();
    expect(screen.getByText("No unread notifications")).toBeInTheDocument();
  });

  it("labels TheFork update notifications as external updates", async () => {
    const user = userEvent.setup();
    reservationEvents.notifications = [{
      id: "res-1",
      notificationId: "reservation.updated:res-1:1:0",
      type: "reservation.updated",
      date: "2026-07-01",
      time: "20:00",
      service: "Dinner",
      partySize: 2,
      name: "Jane",
      source: "thefork",
      receivedAt: Date.now(),
      read: false,
    }];

    render(<AdminShell slug="acme" brandName="O"><span /></AdminShell>);

    await user.click(screen.getByRole("button", { name: /notifications/i }));
    expect(screen.getAllByText("External update").length).toBeGreaterThan(0);
  });

  it("labels external cancellation notifications clearly", async () => {
    const user = userEvent.setup();
    reservationEvents.notifications = [{
      id: "res-1",
      notificationId: "reservation.updated:res-1:1:0",
      type: "reservation.updated",
      status: "cancelled",
      date: "2026-07-01",
      time: "20:00",
      service: "Dinner",
      partySize: 2,
      name: "Jane",
      source: "thefork",
      receivedAt: Date.now(),
      read: false,
    }];

    render(<AdminShell slug="acme" brandName="O"><span /></AdminShell>);

    await user.click(screen.getByRole("button", { name: /notifications/i }));
    expect(screen.getAllByText("External cancellation").length).toBeGreaterThan(0);
  });

  it("formats notification reservation dates in a readable long form", async () => {
    const user = userEvent.setup();
    reservationEvents.notifications = [{
      id: "res-1",
      notificationId: "reservation.created:res-1:1:0",
      date: "2026-06-12",
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

    const date = screen.getByText("June 12, 2026");
    expect(date).toHaveClass("text-on-surface-variant");
    expect(date).toHaveClass("font-medium");
  });

  it("caps the notification popup width for small viewports", async () => {
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
    const popup = screen.getByText("Mark all read").closest(".absolute");

    expect(popup).toHaveClass("w-[calc(100vw-1.5rem)]");
    expect(popup).toHaveClass("max-w-sm");
  });

  it("dismisses active page tooltips when opening notifications", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    window.addEventListener(DISMISS_ADMIN_TOOLTIPS_EVENT, onDismiss);

    render(<AdminShell slug="acme" brandName="O"><span /></AdminShell>);
    await user.click(screen.getByRole("button", { name: /notifications/i }));

    expect(onDismiss).toHaveBeenCalled();
    window.removeEventListener(DISMISS_ADMIN_TOOLTIPS_EVENT, onDismiss);
  });
});
