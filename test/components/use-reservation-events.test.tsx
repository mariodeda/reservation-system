// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReservationEvents } from "@/components/admin/useReservationEvents";
import type { ReservationEvent } from "@/lib/reservations/events";

const api = vi.hoisted(() => ({
  adminJson: vi.fn(),
  adminFetch: vi.fn(),
}));

vi.mock("@/components/admin/api", () => api);

type Listener = (event: MessageEvent) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, Listener[]>();
  onerror: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((l) => l !== listener));
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new MessageEvent(type, { data: JSON.stringify(data) }));
    }
  }
}

function event(over: Partial<ReservationEvent> = {}): ReservationEvent {
  return {
    type: "reservation.created",
    tenantId: "tenant-1",
    id: "res-1",
    name: "Jane",
    partySize: 2,
    date: "2026-07-01",
    time: "20:00",
    service: "dinner",
    offering: "main",
    status: "confirmed",
    source: "web",
    ...over,
  };
}

function notificationPayload(over: Partial<ReservationEvent> = {}, notificationOver: Record<string, unknown> = {}) {
  const reservation = event(over);
  return {
    id: `${reservation.type}:${reservation.id}`,
    tenantId: reservation.tenantId,
    type: reservation.type,
    severity: reservation.type === "reservation.updated" ? "warning" : "info",
    title: reservation.name,
    source: reservation.source,
    reservationId: reservation.id,
    metadata: { reservation },
    createdAt: "2026-07-01T18:00:00.000Z",
    ...notificationOver,
  };
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  api.adminJson.mockReturnValue(new Promise(() => {}));
  api.adminFetch.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("useReservationEvents", () => {
  it("deduplicates repeated created events for the same reservation", () => {
    const dispatched = vi.fn();
    window.addEventListener("reservation:new", dispatched);
    const { result } = renderHook(() => useReservationEvents());
    const source = FakeEventSource.instances[0];

    act(() => {
      source.emit("notification.created", notificationPayload());
      source.emit("notification.created", notificationPayload());
      source.emit("notification.created", notificationPayload());
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0]).toMatchObject({
      id: "res-1",
      notificationId: "reservation.created:res-1",
      tenantId: "tenant-1",
      read: false,
      live: true,
    });
    expect(dispatched).toHaveBeenCalledTimes(1);

    window.removeEventListener("reservation:new", dispatched);
  });

  it("preserves reservation origin from durable web notifications", () => {
    const { result } = renderHook(() => useReservationEvents());
    const source = FakeEventSource.instances[0];

    act(() => {
      source.emit("notification.created", notificationPayload({ reservationOrigin: "facebook" }));
    });

    expect(result.current.notifications[0]).toMatchObject({
      source: "web",
      reservationOrigin: "facebook",
    });
  });

  it("preserves resolved service labels while keeping the raw service id", () => {
    const { result } = renderHook(() => useReservationEvents());
    const source = FakeEventSource.instances[0];

    act(() => {
      source.emit("notification.created", notificationPayload({
        service: "service-1783269141735",
        serviceLabel: "Dinner",
      }));
    });

    expect(result.current.notifications[0]).toMatchObject({
      service: "service-1783269141735",
      serviceLabel: "Dinner",
    });
  });

  it("ignores legacy local reservation update events", () => {
    const dispatched = vi.fn();
    window.addEventListener("reservation:new", dispatched);
    const { result } = renderHook(() => useReservationEvents());
    const source = FakeEventSource.instances[0];

    act(() => {
      source.emit("reservation.updated", event({ type: "reservation.updated" }));
    });

    expect(result.current.notifications).toEqual([]);
    expect(dispatched).not.toHaveBeenCalled();

    window.removeEventListener("reservation:new", dispatched);
  });

  it("creates notifications for external TheFork reservation update events", () => {
    const dispatched = vi.fn();
    window.addEventListener("reservation:new", dispatched);
    const { result } = renderHook(() => useReservationEvents());
    const source = FakeEventSource.instances[0];

    act(() => {
      source.emit(
        "notification.created",
        notificationPayload(
          { type: "reservation.updated", source: "thefork" },
          { id: "reservation.external:thefork:res-1" },
        ),
      );
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0]).toMatchObject({
      id: "res-1",
      source: "thefork",
      type: "reservation.updated",
      read: false,
    });
    expect(result.current.notifications[0].notificationId).toBe("reservation.external:thefork:res-1");
    expect(dispatched).not.toHaveBeenCalled();

    window.removeEventListener("reservation:new", dispatched);
  });

  it("creates notifications for external DISH reservation update events", () => {
    const { result } = renderHook(() => useReservationEvents());
    const source = FakeEventSource.instances[0];

    act(() => {
      source.emit("notification.created", notificationPayload({ type: "reservation.updated", source: "dish" }));
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0]).toMatchObject({
      id: "res-1",
      source: "dish",
      type: "reservation.updated",
      read: false,
    });
  });

  it("preserves external cancellation status from durable notifications", () => {
    const { result } = renderHook(() => useReservationEvents());
    const source = FakeEventSource.instances[0];

    act(() => {
      source.emit("notification.created", notificationPayload({ type: "reservation.updated", source: "thefork", status: "cancelled" }));
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0]).toMatchObject({
      id: "res-1",
      source: "thefork",
      type: "reservation.updated",
      status: "cancelled",
      read: false,
    });
  });

  it.each(["thefork", "dish"] as const)("collapses duplicate %s notifications for the same provider reservation", async (source) => {
    api.adminJson.mockResolvedValueOnce({
      notifications: [
        notificationPayload(
          { type: "reservation.updated", source, name: "Ada Lovelace", status: "cancelled" },
          { id: `reservation.external:${source}:res-1`, createdAt: "2026-07-01T18:01:00.000Z" },
        ),
        notificationPayload(
          { type: "reservation.created", source, name: "Lovelace, Ada", status: "confirmed" },
          { id: "reservation.created:res-1", createdAt: "2026-07-01T18:00:00.000Z" },
        ),
      ],
      unreadCount: 2,
    });

    const { result } = renderHook(() => useReservationEvents());

    await waitFor(() => {
      expect(result.current.notifications).toHaveLength(1);
    });
    expect(result.current.notifications[0]).toMatchObject({
      notificationId: `reservation.external:${source}:res-1`,
      source,
      name: "Ada Lovelace",
      status: "cancelled",
    });
    expect(result.current.unreadCount).toBe(1);
  });

  it("loads unread durable notifications when the hook mounts", async () => {
    api.adminJson.mockResolvedValueOnce({
      notifications: [notificationPayload({}, { id: "stored-notification-1" })],
      unreadCount: 1,
    });

    const { result } = renderHook(() => useReservationEvents());

    await waitFor(() => {
      expect(result.current.notifications).toHaveLength(1);
    });
    expect(result.current.notifications[0]).toMatchObject({
      notificationId: "stored-notification-1",
      live: false,
      read: false,
    });
    expect(api.adminJson).toHaveBeenCalledWith("/api/admin/notifications?unread=1&limit=50");
  });

  it("maps manual-confirmation notifications without dispatching generic new-booking events", () => {
    const dispatched = vi.fn();
    const changed = vi.fn();
    window.addEventListener("reservation:new", dispatched);
    window.addEventListener("reservation:changed", changed);
    const { result } = renderHook(() => useReservationEvents());
    const source = FakeEventSource.instances[0];

    act(() => {
      source.emit("notification.created", notificationPayload(
        { status: "pending", partySize: 12 },
        {
          id: "manual-large-party",
          type: "reservation.manual_confirmation_required",
          title: "Manual confirmation required",
          severity: "warning",
          metadata: {
            maxPartySize: 8,
            reservation: event({ status: "pending", partySize: 12 }),
          },
        },
      ));
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0]).toMatchObject({
      notificationId: "manual-large-party",
      type: "reservation.manual_confirmation_required",
      status: "pending",
      partySize: 12,
      maxPartySize: 8,
      severity: "warning",
    });
    expect(dispatched).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledOnce();
    expect(changed.mock.calls[0][0]).toMatchObject({
      detail: expect.objectContaining({
        notificationId: "manual-large-party",
        type: "reservation.manual_confirmation_required",
      }),
    });

    window.removeEventListener("reservation:new", dispatched);
    window.removeEventListener("reservation:changed", changed);
  });

  it("persists mark-read, dismiss, and mark-all-read actions", () => {
    const { result } = renderHook(() => useReservationEvents());
    const source = FakeEventSource.instances[0];

    act(() => {
      source.emit("notification.created", notificationPayload({}, { id: "notice-1" }));
    });
    act(() => {
      result.current.markRead("notice-1");
      result.current.dismiss("notice-1");
      result.current.markAllRead();
    });

    expect(api.adminFetch).toHaveBeenCalledWith("/api/admin/notifications/notice-1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ read: true }),
    }));
    expect(api.adminFetch).toHaveBeenCalledWith("/api/admin/notifications/notice-1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ dismissed: true }),
    }));
    expect(api.adminFetch).toHaveBeenCalledWith("/api/admin/notifications", { method: "POST" });
  });

  it("persists selected mark-read actions without marking unrelated notifications", () => {
    const { result } = renderHook(() => useReservationEvents());
    const source = FakeEventSource.instances[0];

    act(() => {
      source.emit("notification.created", notificationPayload({}, { id: "notice-1" }));
      source.emit("notification.created", notificationPayload({ id: "res-2" }, { id: "notice-2" }));
    });
    act(() => {
      result.current.markManyRead(["notice-2"]);
    });

    expect(result.current.notifications.find((n) => n.notificationId === "notice-1")?.read).toBe(false);
    expect(result.current.notifications.find((n) => n.notificationId === "notice-2")?.read).toBe(true);
    expect(api.adminFetch).toHaveBeenCalledWith("/api/admin/notifications/notice-2", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ read: true }),
    }));
  });

  it("does not open parallel SSE connections after repeated errors", () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useReservationEvents());
    const source = FakeEventSource.instances[0];

    act(() => {
      source.onerror?.();
      source.onerror?.();
      source.onerror?.();
    });
    expect(source.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(FakeEventSource.instances).toHaveLength(2);
    unmount();
  });
});
