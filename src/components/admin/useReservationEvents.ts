"use client";

import { useEffect, useState } from "react";
import type { ReservationEvent } from "@/lib/reservations/events";

export interface ReservationNotification extends ReservationEvent {
  receivedAt: number;
  read: boolean;
}

const MAX = 30;

export function useReservationEvents() {
  const [notifications, setNotifications] = useState<ReservationNotification[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let es: EventSource;
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      es = new EventSource("/api/admin/events");

      es.addEventListener("connected", () => setConnected(true));

      const handleReservationEvent = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as ReservationEvent;
          const n: ReservationNotification = { ...data, receivedAt: Date.now(), read: false };
          setNotifications((prev) => [n, ...prev].slice(0, MAX));
          window.dispatchEvent(new CustomEvent("reservation:new", { detail: n }));
        } catch { /* malformed */ }
      };

      es.addEventListener("reservation.created", handleReservationEvent);
      es.addEventListener("reservation.updated", handleReservationEvent);

      es.onerror = () => {
        setConnected(false);
        es.close();
        // Exponential-ish backoff: retry after 5 s
        retryTimeout = setTimeout(connect, 5_000);
      };
    }

    connect();
    return () => {
      clearTimeout(retryTimeout);
      es?.close();
      setConnected(false);
    };
  }, []);

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, connected, markAllRead, markRead };
}
