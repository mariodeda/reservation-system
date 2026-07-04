"use client";

import { useEffect, useRef, useState } from "react";
import type { ReservationEvent } from "@/lib/reservations/events";
import { adminFetch, adminJson } from "./api";

interface TenantNotificationPayload {
  id: string;
  tenantId: string;
  type: string;
  severity: "info" | "success" | "warning" | "error";
  title: string;
  body?: string;
  source: ReservationEvent["source"] | "system" | "email" | "waitlist";
  reservationId?: string;
  metadata?: {
    reservation?: Partial<ReservationEvent>;
    [key: string]: unknown;
  };
  createdAt: string;
  readAt?: string;
}

export interface ReservationNotification extends ReservationEvent {
  notificationId: string;
  receivedAt: number;
  read: boolean;
  title?: string;
  severity?: TenantNotificationPayload["severity"];
  live?: boolean;
}

const MAX = 30;

function fromTenantNotification(n: TenantNotificationPayload, live = false): ReservationNotification | null {
  const reservation = n.metadata?.reservation;
  if (!reservation || !n.reservationId) return null;
  const source = reservation.source ?? n.source;
  if (source !== "web" && source !== "admin" && source !== "thefork" && source !== "dish") return null;
  return {
    type: (n.type === "reservation.updated" ? "reservation.updated" : "reservation.created"),
    tenantId: n.tenantId,
    id: n.reservationId,
    name: String(reservation.name ?? n.title),
    partySize: Number(reservation.partySize ?? 1),
    date: String(reservation.date ?? ""),
    time: String(reservation.time ?? "00:00"),
    service: String(reservation.service ?? ""),
    offering: String(reservation.offering ?? "main"),
    source,
    notificationId: n.id,
    receivedAt: Date.parse(n.createdAt) || Date.now(),
    read: Boolean(n.readAt),
    title: n.title,
    severity: n.severity,
    live,
  };
}

export function useReservationEvents() {
  const [notifications, setNotifications] = useState<ReservationNotification[]>([]);
  const [connected, setConnected] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());

  function mergeNotifications(next: ReservationNotification[]) {
    setNotifications((prev) => {
      const byId = new Map<string, ReservationNotification>();
      for (const n of [...next, ...prev]) byId.set(n.notificationId, n);
      const merged = [...byId.values()].sort((a, b) => b.receivedAt - a.receivedAt).slice(0, MAX);
      seenIds.current = new Set(merged.map((n) => n.notificationId));
      return merged;
    });
  }

  useEffect(() => {
    let alive = true;
    adminJson<{ notifications: TenantNotificationPayload[] }>("/api/admin/notifications?unread=1&limit=50")
      .then((data) => {
        if (!alive) return;
        mergeNotifications(
          (data.notifications ?? [])
            .map((notification) => fromTenantNotification(notification))
            .filter(Boolean) as ReservationNotification[],
        );
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let es: EventSource;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    function connect() {
      if (stopped) return;
      es = new EventSource("/api/admin/events");

      es.addEventListener("connected", () => setConnected(true));

      const pushNotification = (n: ReservationNotification) => {
        if (seenIds.current.has(n.notificationId)) return null;
        seenIds.current.add(n.notificationId);
        mergeNotifications([n]);
        return n;
      };

      const handleNotificationEvent = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as TenantNotificationPayload;
          const n = fromTenantNotification(data, true);
          if (!n) return;
          const pushed = pushNotification(n);
          if (pushed?.type === "reservation.created") {
            window.dispatchEvent(new CustomEvent("reservation:new", { detail: pushed }));
          }
        } catch { /* malformed */ }
      };

      es.addEventListener("notification.created", handleNotificationEvent);

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
    adminFetch("/api/admin/notifications", { method: "POST" }).catch(() => {});
  }

  function markRead(notificationId: string) {
    setNotifications((prev) => prev.map((n) => (n.notificationId === notificationId ? { ...n, read: true } : n)));
    adminFetch(`/api/admin/notifications/${notificationId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ read: true }),
    }).catch(() => {});
  }

  function dismiss(notificationId: string) {
    setNotifications((prev) => prev.map((n) => (n.notificationId === notificationId ? { ...n, read: true } : n)));
    adminFetch(`/api/admin/notifications/${notificationId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dismissed: true }),
    }).catch(() => {});
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, connected, markAllRead, markRead, dismiss };
}
