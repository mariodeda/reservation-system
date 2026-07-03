// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReservationEvents } from "@/components/admin/useReservationEvents";
import type { ReservationEvent } from "@/lib/reservations/events";

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
    source: "web",
    ...over,
  };
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useReservationEvents", () => {
  it("deduplicates repeated created events for the same reservation", () => {
    const dispatched = vi.fn();
    window.addEventListener("reservation:new", dispatched);
    const { result } = renderHook(() => useReservationEvents());
    const source = FakeEventSource.instances[0];

    act(() => {
      source.emit("reservation.created", event());
      source.emit("reservation.created", event());
      source.emit("reservation.created", event());
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0]).toMatchObject({
      id: "res-1",
      notificationId: "reservation.created:res-1",
      read: false,
    });
    expect(dispatched).toHaveBeenCalledTimes(1);

    window.removeEventListener("reservation:new", dispatched);
  });

  it("does not create notifications for local reservation update events", () => {
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
      source.emit("reservation.updated", event({ type: "reservation.updated", source: "thefork" }));
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0]).toMatchObject({
      id: "res-1",
      source: "thefork",
      type: "reservation.updated",
      read: false,
    });
    expect(result.current.notifications[0].notificationId).toMatch(/^reservation\.updated:res-1:/);
    expect(dispatched).not.toHaveBeenCalled();

    window.removeEventListener("reservation:new", dispatched);
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
