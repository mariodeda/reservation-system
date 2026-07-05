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
          { id: "reservation.updated:thefork:res-1:2026-07-01:20:00:2" },
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
    expect(result.current.notifications[0].notificationId).toMatch(/^reservation\.updated:thefork:res-1:/);
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
