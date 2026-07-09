"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { type ReservationNotification } from "./useReservationEvents";
import Tooltip from "@/components/ui/Tooltip";
import { am } from "@/i18n";
import { dismissAdminTooltips } from "./tooltip-events";

// ── helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return am.notifications.justNow;
  if (s < 60) return am.notifications.secondsAgo(s);
  const m = Math.floor(s / 60);
  if (m < 60) return am.notifications.minutesAgo(m);
  return am.notifications.hoursAgo(Math.floor(m / 60));
}

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatNotificationDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return date;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function sourceBadgeClass(source: ReservationNotification["source"]) {
  if (source === "web") return "bg-emerald-400/15 text-on-surface";
  if (source === "thefork") return "bg-amber-400/15 text-on-surface";
  if (source === "dish") return "bg-orange-400/15 text-on-surface";
  return "bg-sky-400/15 text-on-surface";
}

function sourceAccentClass(source: ReservationNotification["source"]) {
  if (source === "web") return "bg-emerald-400";
  if (source === "thefork") return "bg-amber-400";
  if (source === "dish") return "bg-orange-400";
  return "bg-sky-400";
}

function sourceLabel(source: ReservationNotification["source"]) {
  if (source === "web") return am.notifications.online;
  if (source === "thefork") return am.notifications.theFork;
  if (source === "dish") return am.notifications.dish;
  return am.notifications.staff;
}

function eventLabel(n: ReservationNotification) {
  return sourceLabel(n.source);
}

function statusLabel(status: ReservationNotification["status"] | undefined) {
  return am.status[status ?? "confirmed"];
}

function statusBadgeClass(status: ReservationNotification["status"] | undefined) {
  if (status === "cancelled" || status === "no_show") return "bg-error/15 text-error";
  if (status === "completed") return "bg-emerald-400/15 text-on-surface";
  if (status === "seated") return "bg-sky-400/15 text-on-surface";
  if (status === "pending") return "bg-amber-400/15 text-on-surface";
  return "bg-surface-container-high text-on-surface-variant";
}

function reservationHref(slug: string, n: ReservationNotification) {
  const params = new URLSearchParams({ date: n.date, reservation: n.id });
  return `/admin/${slug}/reservations?${params.toString()}`;
}

// ── rich toast ────────────────────────────────────────────────────────────────

interface ToastProps {
  n: ReservationNotification;
  slug: string;
  onDismiss: () => void;
}

function ReservationToast({ n, slug, onDismiss }: ToastProps) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    // Animate in
    const show = setTimeout(() => setVisible(true), 10);
    // Progress bar drain over 6 s
    const interval = setInterval(() => setProgress((p) => Math.max(0, p - 100 / 60)), 100);
    // Auto-dismiss after 6 s
    const hide = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 350);
    }, 6_000);
    return () => { clearTimeout(show); clearTimeout(hide); clearInterval(interval); };
  }, [onDismiss]);

  function view() {
    router.push(reservationHref(slug, n));
    setVisible(false);
    setTimeout(onDismiss, 350);
  }

  return (
    <div
      className="pointer-events-auto"
      style={{
        transition: "opacity 0.3s, transform 0.3s",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
      }}
    >
      <div className="relative w-full overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container shadow-2xl sm:w-80">
        {/* colour accent strip */}
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${sourceAccentClass(n.source)}`} />

        <div className="pl-4 pr-3 pt-3 pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <BellIcon className="w-4 h-4 shrink-0" />
              <div className="min-w-0">
                <Tooltip content={n.name} className="max-w-full">
                  <span className="block text-sm font-semibold text-on-surface leading-tight truncate">
                    {n.name}
                  </span>
                </Tooltip>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {am.notifications.guests(n.partySize)} · {formatTime(n.time)} · {n.service}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 mt-0.5">
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${sourceBadgeClass(n.source)}`}>
                {eventLabel(n)}
              </span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusBadgeClass(n.status)}`}>
                {statusLabel(n.status)}
              </span>
              <button
                onClick={() => { setVisible(false); setTimeout(onDismiss, 350); }}
                className="w-5 h-5 flex items-center justify-center rounded text-on-surface-variant/60 hover:text-on-surface transition"
                aria-label={am.notifications.dismiss}
              >
                <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <line x1="1" y1="1" x2="11" y2="11" /><line x1="11" y1="1" x2="1" y2="11" />
                </svg>
              </button>
            </div>
          </div>

          <div className="mt-2 flex gap-2">
            <button
              onClick={view}
              className="flex-1 text-xs font-semibold rounded-lg py-1.5 bg-primary/15 text-primary hover:bg-primary/25 transition"
            >
              {am.notifications.viewReservations}
            </button>
          </div>
        </div>

        {/* progress bar */}
        <div className="h-0.5 bg-outline-variant/20">
          <div
            className="h-full bg-primary/60 transition-all"
            style={{ width: `${progress}%`, transition: "width 0.1s linear" }}
          />
        </div>
      </div>
    </div>
  );
}

// ── toast stack manager ───────────────────────────────────────────────────────

interface ToastStackProps {
  toasts: ReservationNotification[];
  slug: string;
  onDismiss: (id: string) => void;
}

export function ReservationToastStack({ toasts, slug, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed inset-x-3 bottom-3 z-[200] flex flex-col gap-2 items-stretch pointer-events-none sm:inset-x-auto sm:bottom-6 sm:right-6 sm:items-end">
      {toasts.map((n) => (
        <ReservationToast key={n.notificationId} n={n} slug={slug} onDismiss={() => onDismiss(n.notificationId)} />
      ))}
    </div>
  );
}

// ── notification bell + dropdown ─────────────────────────────────────────────

interface BellProps {
  notifications: ReservationNotification[];
  unreadCount: number;
  connected: boolean;
  slug: string;
  onMarkAllRead: () => void;
  onMarkRead: (id: string) => void;
}

export function NotificationBell({
  notifications, connected, slug, onMarkAllRead, onMarkRead,
}: BellProps) {
  const [open, setOpen] = useState(false);
  const [locallyRead, setLocallyRead] = useState<Set<string>>(() => new Set());
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    setLocallyRead((prev) => {
      const active = new Set(notifications.map((n) => n.notificationId));
      const next = new Set([...prev].filter((id) => active.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [notifications]);

  const { visibleUnreadCount, unreadNotifications } = useMemo(() => {
    let unreadCount = 0;
    const unread: ReservationNotification[] = [];
    for (const notification of notifications) {
      const visible = locallyRead.has(notification.notificationId)
        ? { ...notification, read: true }
        : notification;
      if (!visible.read) {
        unreadCount += 1;
        unread.push(visible);
      }
    }
    return { visibleUnreadCount: unreadCount, unreadNotifications: unread };
  }, [locallyRead, notifications]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function toggleOpen() {
    dismissAdminTooltips();
    setOpen((v) => !v);
  }

  function goTo(n: ReservationNotification) {
    markReadNow(n.notificationId);
    setOpen(false);
    router.push(reservationHref(slug, n));
  }

  function markReadNow(notificationId: string) {
    setLocallyRead((prev) => new Set(prev).add(notificationId));
    onMarkRead(notificationId);
  }

  function markAllReadNow() {
    setLocallyRead(new Set(notifications.map((n) => n.notificationId)));
    onMarkAllRead();
  }

  return (
    <div ref={ref} className="relative">
      <Tooltip content={connected ? am.notifications.title : am.notifications.reconnecting}>
      <button
        onClick={toggleOpen}
        onMouseEnter={dismissAdminTooltips}
        aria-label={visibleUnreadCount > 0 ? am.notifications.unreadAria(visibleUnreadCount) : am.notifications.title}
        className="relative w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition"
      >
        <BellIcon />
        {visibleUnreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center px-1 leading-none tabular-nums">
            {visibleUnreadCount > 99 ? "99+" : visibleUnreadCount}
          </span>
        )}
        {/* connectivity dot */}
        <span className={`absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
      </button>
      </Tooltip>

      {open && (
        <div
          className="fixed inset-x-3 top-[4.25rem] z-50 max-h-[calc(100dvh-5rem)] overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container shadow-2xl sm:absolute sm:inset-auto sm:right-0 sm:top-10 sm:w-[calc(100vw-1.5rem)] sm:max-w-sm"
          role="dialog"
          aria-modal="false"
          aria-label={am.notifications.title}
          onMouseEnter={dismissAdminTooltips}
        >
          {/* header */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-outline-variant/20">
            <span className="text-sm font-semibold text-on-surface">{am.notifications.title}</span>
            <div className="flex items-center gap-2">
              {!connected && (
                <span className="text-[10px] text-on-surface-variant font-medium">{am.notifications.reconnectingShort}</span>
              )}
              {visibleUnreadCount > 0 && (
                <button
                  onClick={markAllReadNow}
                  className="text-[11px] text-primary hover:text-primary/70 font-medium transition"
                >
                  {am.notifications.markAllRead}
                </button>
              )}
            </div>
          </div>

          {/* list */}
          <div className="max-h-[calc(100dvh-12rem)] overflow-y-auto sm:max-h-[420px]">
            {unreadNotifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-on-surface-variant/50">
                <BellIcon className="w-6 h-6 mx-auto mb-2" />
                <p>{notifications.length === 0 ? am.notifications.noNotifications : am.notifications.noUnread}</p>
                <p className="text-xs mt-1 text-on-surface-variant/40">
                  {connected ? am.notifications.listening : am.notifications.connecting}
                </p>
              </div>
            ) : (
              unreadNotifications.map((n) => (
                <button
                  key={n.notificationId}
                  onClick={() => goTo(n)}
                  className={`w-full text-left px-4 py-3 border-b border-outline-variant/10 last:border-0 hover:bg-surface-container-high transition group ${
                    !n.read ? "bg-primary/[0.04]" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                      !n.read ? "bg-primary" : "bg-transparent"
                    }`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <Tooltip content={n.name} className="min-w-0 flex-1">
                          <span className="text-sm font-semibold text-on-surface truncate">{n.name}</span>
                        </Tooltip>
                        <span className="text-[10px] text-on-surface-variant/50 shrink-0">{timeAgo(n.receivedAt)}</span>
                      </div>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        {am.notifications.guests(n.partySize)} · {formatTime(n.time)} · {n.service}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${sourceBadgeClass(n.source)}`}>
                          {eventLabel(n)}
                        </span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusBadgeClass(n.status)}`}>
                          {statusLabel(n.status)}
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-[11px] font-medium text-on-surface-variant">
                          {formatNotificationDate(n.date)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-outline-variant/20 text-center">
              <button
                onClick={() => { setOpen(false); router.push(`/admin/${slug}/reservations`); }}
                className="inline-flex items-center justify-center gap-1 text-xs text-primary hover:text-primary/70 font-medium transition"
              >
                {am.notifications.viewAllReservations}
                <ArrowRightIcon />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BellIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 2a6 6 0 0 0-6 6v2.5l-1.5 2.5h15L16 10.5V8a6 6 0 0 0-6-6Z" />
      <path d="M8 16a2 2 0 0 0 4 0" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8h10" />
      <path d="m9 4 4 4-4 4" />
    </svg>
  );
}
