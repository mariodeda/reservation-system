"use client";

import { useEffect, useState } from "react";
import type { DayAvailability } from "@/lib/reservations/types";
import { adminJson } from "./api";
import { am } from "@/i18n";

/**
 * Compact per-service capacity view for a date: total covers booked vs capacity,
 * plus a strip of slot chips coloured by fullness. Optionally lets staff click a
 * slot to start a booking at that time.
 */
export default function DayOccupancy({
  date,
  offering,
  heading,
  refreshKey,
  onPickSlot,
}: {
  date: string;
  /** Offering id to show occupancy for (defaults to the primary offering). */
  offering?: string;
  /** Optional offering label shown as a header (multi-offering venues). */
  heading?: string;
  refreshKey?: number;
  onPickSlot?: (service: string, time: string) => void;
}) {
  const [day, setDay] = useState<DayAvailability | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    const q = offering ? `?date=${date}&offering=${encodeURIComponent(offering)}` : `?date=${date}`;
    adminJson<DayAvailability>(`/api/admin/availability${q}`)
      .then((d) => !cancelled && setDay(d))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [date, offering, refreshKey]);

  if (error) return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-3 text-sm text-on-surface-variant/60">
      {am.availability.dayError}
    </div>
  );
  if (!day) return <div className="h-16 rounded-xl bg-surface-container animate-pulse" />;

  const Heading = heading ? (
    <div className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">{heading}</div>
  ) : null;

  if (day.closed) {
    return (
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-3 text-sm text-on-surface-variant">
        {Heading}{am.availability.dayClosed}
      </div>
    );
  }
  if (day.services.length === 0) {
    return (
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-3 text-sm text-on-surface-variant">
        {Heading}{am.availability.dayNoService}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-3 space-y-3">
      {Heading}
      {day.services.map((svc) => {
        const booked = svc.slots.reduce((s, x) => s + x.booked, 0);
        const capacity = svc.slots.reduce((s, x) => s + x.capacity, 0);
        const available = Math.max(0, capacity - booked);
        const status = coverAvailabilityStatus(available, capacity);
        const pct = capacity > 0 ? Math.round((available / capacity) * 100) : 0;
        const statusTitle = `${am.availability.coversAvailable(available, capacity, pct)}. ${status.label}`;
        return (
          <div key={svc.id}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-semibold">{svc.label}</span>
              <div className="flex items-center gap-2">
                <CoverAvailabilityIcon className={status.iconClass} title={statusTitle} tone={status.tone} />
                <span className="text-sm font-semibold text-on-surface tabular-nums">
                  {am.availability.covers(booked, capacity)}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {svc.slots.map((s) => {
                const ratio = s.capacity ? s.remaining / s.capacity : 0;
                const full = s.remaining <= 0;
                const cls = full
                  ? "bg-rose-500/15 text-rose-300 border-rose-500/30" // fully booked
                  : !s.available
                    ? "bg-surface-container-high text-on-surface-variant/50 border-outline-variant/30" // past / too soon / blocked
                    : ratio <= 0.25
                      ? "bg-amber-400/15 text-amber-300 border-amber-400/30" // nearly full
                      : "bg-emerald-400/10 text-emerald-300 border-emerald-400/30"; // open
                const title = full
                  ? am.availability.fullyBooked
                  : !s.available
                    ? am.availability.slotUnavailable
                    : am.availability.slotStatus(s.booked, s.capacity, s.remaining);
                return (
                  <button
                    key={s.time}
                    type="button"
                    disabled={!onPickSlot}
                    onClick={() => onPickSlot?.(svc.id, s.time)}
                    title={title}
                    className={`text-[11px] tabular-nums px-2 py-1 rounded border transition-all ${cls} ${onPickSlot ? "cursor-pointer hover:brightness-125 active:scale-95" : "cursor-default"}`}
                  >
                    {s.time}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function coverAvailabilityStatus(available: number, capacity: number) {
  const ratio = capacity > 0 ? available / capacity : 0;
  if (ratio < 0.05) {
    return {
      label: am.availability.coversAvailableCritical,
      iconClass: "text-rose-400",
      tone: "critical" as const,
    };
  }
  if (ratio < 0.3) {
    return {
      label: am.availability.coversAvailableLow,
      iconClass: "text-amber-300",
      tone: "low" as const,
    };
  }
  return {
    label: am.availability.coversAvailableOk,
    iconClass: "text-emerald-300",
    tone: "ok" as const,
  };
}

function CoverAvailabilityIcon({ className, title, tone }: { className: string; title: string; tone: "ok" | "low" | "critical" }) {
  const path = tone === "ok"
    ? <><circle cx="8" cy="8" r="6" /><path d="m5.2 8.2 1.8 1.8 3.8-4" /></>
    : tone === "critical"
      ? <><circle cx="8" cy="8" r="6" /><path d="m5.8 5.8 4.4 4.4" /><path d="m10.2 5.8-4.4 4.4" /></>
      : <><path d="M8 2.8 1.9 13a1 1 0 0 0 .9 1.5h10.4a1 1 0 0 0 .9-1.5L8 2.8Z" /><path d="M8 6.5v3" /><path d="M8 12h.01" /></>;
  return (
    <span
      className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${className}`}
      title={title}
      aria-label={title}
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {path}
      </svg>
    </span>
  );
}
