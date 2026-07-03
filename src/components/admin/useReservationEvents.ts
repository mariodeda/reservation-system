"use client";

import { useEffect, useRef, useState } from "react";
import type { ReservationEvent } from "@/lib/reservations/events";

export interface ReservationNotification extends ReservationEvent {
  notificationId: string;
  receivedAt: number;
  read: boolean;
}

const MAX = 30;

export function useReservationEvents() {
  const [notifications, setNotifications] = useState<ReservationNotification[]>([]);
  const [connected, setConnected] = useState(false);
  const seenCreatedIds = useRef<Set<string>>(new Set());
  const updateSeq = useRef(0);

  useEffect(() => {
    let es: EventSource;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    function connect() {
      if (stopped) return;
      es = new EventSource("/api/admin/events");

      es.addEventListener("connected", () => setConnected(true));

      const pushNotification = (data: ReservationEvent, notificationId: string) => {
        const n: ReservationNotification = {
          ...data,
          notificationId,
          receivedAt: Date.now(),
          read: false,
        };
        setNotifications((prev) => (
          prev.some((item) => item.notificationId === notificationId) ? prev : [n, ...prev].slice(0, MAX)
        ));
        return n;
      };

      const handleCreatedEvent = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as ReservationEvent;
          if (data.type !== "reservation.created") return;
          const notificationId = `${data.type}:${data.id}`;
          if (seenCreatedIds.current.has(data.id)) return;
          seenCreatedIds.current.add(data.id);
          const n = pushNotification(data, notificationId);
          window.dispatchEvent(new CustomEvent("reservation:new", { detail: n }));
        } catch { /* malformed */ }
      };

      const handleUpdatedEvent = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as ReservationEvent;
          if (data.type !== "reservation.updated" || data.source !== "thefork") return;
          updateSeq.current += 1;
          const notificationId = `${data.type}:${data.id}:${Date.now()}:${updateSeq.current}`;
          pushNotification(data, notificationId);
        } catch { /* malformed */ }
      };

      es.addEventListener("reservation.created", handleCreatedEvent);
      es.addEventListener("reservation.updated", handleUpdatedEvent);

      es.onerror = () => {
        setConnected(false);
        es.close();
        if (retryTimeout) return;
        // Back off reconnects and make sure repeated onerror calls don't open
        // parallel SSE subscriptions for the same browser tab.
        retryTimeout = setTimeout(() => {
          retryTimeout = null;
          connect();
        }, 5_000);
      };
    }

    connect();
    return () => {
      stopped = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      es?.close();
      setConnected(false);
    };
  }, []);

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function markRead(notificationId: string) {
    setNotifications((prev) => prev.map((n) => (n.notificationId === notificationId ? { ...n, read: true } : n)));
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, connected, markAllRead, markRead };
}
