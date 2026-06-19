"use client";

import { useEffect, useState } from "react";
import type { DayAvailability } from "@/lib/reservations/types";
import { adminJson } from "./api";

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
    adminJson<DayAvailability>(`/api/availability${q}`)
      .then((d) => !cancelled && setDay(d))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [date, offering, refreshKey]);

  if (error) return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-3 text-sm text-on-surface-variant/60">
      Could not load availability for this date.
    </div>
  );
  if (!day) return <div className="h-16 rounded-xl bg-surface-container animate-pulse" />;

  const Heading = heading ? (
    <div className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">{heading}</div>
  ) : null;

  if (day.closed) {
    return (
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-3 text-sm text-on-surface-variant">
        {Heading}Closed on this date.
      </div>
    );
  }
  if (day.services.length === 0) {
    return (
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-3 text-sm text-on-surface-variant">
        {Heading}No service configured for this date.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-3 space-y-3">
      {Heading}
      {day.services.map((svc) => {
        const booked = svc.slots.reduce((s, x) => s + x.booked, 0);
        const capacity = svc.slots.reduce((s, x) => s + x.capacity, 0);
        return (
          <div key={svc.id}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-semibold">{svc.label}</span>
              <span className="text-xs text-on-surface-variant tabular-nums">
                {booked}/{capacity} covers
              </span>
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
                  ? "Fully booked"
                  : !s.available
                    ? "Unavailable (past, too soon, or blocked)"
                    : `${s.booked}/${s.capacity} covers booked · ${s.remaining} left`;
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
