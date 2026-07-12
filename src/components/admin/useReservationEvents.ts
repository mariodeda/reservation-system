"use client";

import { useEffect, useRef, useState } from "react";
import type { ReservationEvent } from "@/lib/reservations/events";
import { RESERVATION_STATUSES, type ReservationOrigin, type ReservationStatus } from "@/lib/reservations/types";
import { sanitizeReservationOrigin } from "@/lib/reservations/reservation-origin";
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

export const MANUAL_CONFIRMATION_NOTIFICATION_TYPE = "reservation.manual_confirmation_required";
export type ReservationNotificationType =
  | ReservationEvent["type"]
  | typeof MANUAL_CONFIRMATION_NOTIFICATION_TYPE;

export interface ReservationNotification extends Omit<ReservationEvent, "type"> {
  type: ReservationNotificationType;
  notificationId: string;
  receivedAt: number;
  read: boolean;
  title?: string;
  severity?: TenantNotificationPayload["severity"];
  live?: boolean;
  maxPartySize?: number;
  reservationOrigin?: ReservationOrigin;
}

const MAX = 30;

function reservationStatus(value: unknown): ReservationStatus {
  return RESERVATION_STATUSES.includes(value as ReservationStatus) ? (value as ReservationStatus) : "confirmed";
}

function isExternalSource(source: ReservationNotification["source"]) {
  return source === "thefork" || source === "dish";
}

function visibleNotificationKey(n: ReservationNotification) {
  return isExternalSource(n.source) ? `external:${n.source}:${n.id}` : n.notificationId;
}

function fromTenantNotification(n: TenantNotificationPayload, live = false): ReservationNotification | null {
  const reservation = n.metadata?.reservation;
  if (!reservation || !n.reservationId) return null;
  const source = reservation.source ?? n.source;
  if (source !== "web" && source !== "admin" && source !== "thefork" && source !== "dish") return null;
  return {
    type: n.type === MANUAL_CONFIRMATION_NOTIFICATION_TYPE
      ? MANUAL_CONFIRMATION_NOTIFICATION_TYPE
      : n.type === "reservation.updated"
        ? "reservation.updated"
        : "reservation.created",
    tenantId: n.tenantId,
    id: n.reservationId,
    name: String(reservation.name ?? n.title),
    partySize: Number(reservation.partySize ?? 1),
    date: String(reservation.date ?? ""),
    time: String(reservation.time ?? "00:00"),
    service: String(reservation.service ?? ""),
    offering: String(reservation.offering ?? "main"),
    status: reservationStatus(reservation.status),
    source,
    notificationId: n.id,
    receivedAt: Date.parse(n.createdAt) || Date.now(),
    read: Boolean(n.readAt),
    title: n.title,
    severity: n.severity,
    live,
    maxPartySize: typeof n.metadata?.maxPartySize === "number" ? n.metadata.maxPartySize : undefined,
    reservationOrigin: source === "web" ? sanitizeReservationOrigin(reservation.reservationOrigin) : undefined,
  };
}

export function isManualConfirmationNotification(n: ReservationNotification): boolean {
  return n.type === MANUAL_CONFIRMATION_NOTIFICATION_TYPE;
}

export function useReservationEvents() {
  const [notifications, setNotifications] = useState<ReservationNotification[]>([]);
  const [connected, setConnected] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());

  function mergeNotifications(next: ReservationNotification[]) {
    setNotifications((prev) => {
      const byId = new Map<string, ReservationNotification>();
      for (const n of [...next, ...prev]) byId.set(n.notificationId, n);
      const byVisible = new Map<string, ReservationNotification>();
      for (const n of [...byId.values()].sort((a, b) => b.receivedAt - a.receivedAt)) {
        const key = visibleNotificationKey(n);
        if (!byVisible.has(key)) byVisible.set(key, n);
      }
      const merged = [...byVisible.values()].slice(0, MAX);
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
        if (seenIds.current.has(n.notificationId)) {
          mergeNotifications([n]);
          return null;
        }
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
          if (pushed) {
            window.dispatchEvent(new CustomEvent("reservation:changed", { detail: pushed }));
          }
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

  function markManyRead(notificationIds: string[]) {
    const unique = [...new Set(notificationIds)];
    if (unique.length === 0) return;
    setNotifications((prev) => prev.map((n) => (unique.includes(n.notificationId) ? { ...n, read: true } : n)));
    for (const id of unique) {
      adminFetch(`/api/admin/notifications/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ read: true }),
      }).catch(() => {});
    }
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

  return { notifications, unreadCount, connected, markAllRead, markRead, markManyRead, dismiss };
}
