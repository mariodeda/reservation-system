"use client";

import { useCallback, useEffect, useState } from "react";
import type { DayAvailability, SlotUnavailableReason } from "@/lib/reservations/types";
import { adminJson, toast } from "./api";
import { am } from "@/i18n";
import Tooltip from "@/components/ui/Tooltip";

/**
 * Per-service capacity view for a date. Each slot tile carries its own covers
 * status so staff can scan availability without reconciling a service summary
 * against separate time chips.
 */
export default function DayOccupancy({
  date,
  offering,
  heading,
  refreshKey,
  onPickSlot,
  allowSlotStops = false,
  onSlotStopChanged,
}: {
  date: string;
  /** Offering id to show occupancy for (defaults to the primary offering). */
  offering?: string;
  /** Optional offering label shown as a header (multi-offering venues). */
  heading?: string;
  refreshKey?: number;
  onPickSlot?: (service: string, time: string) => void;
  allowSlotStops?: boolean;
  onSlotStopChanged?: () => void | Promise<void>;
}) {
  const [day, setDay] = useState<DayAvailability | null>(null);
  const [error, setError] = useState(false);
  const [savingSlot, setSavingSlot] = useState<string | null>(null);

  const loadDay = useCallback((cancelled: () => boolean = () => false) => {
    setError(false);
    const q = offering ? `?date=${date}&offering=${encodeURIComponent(offering)}` : `?date=${date}`;
    return adminJson<DayAvailability>(`/api/admin/availability${q}`)
      .then((d) => {
        if (!cancelled()) setDay(d);
      })
      .catch(() => {
        if (!cancelled()) setError(true);
      });
  }, [date, offering]);

  useEffect(() => {
    let cancelled = false;
    void loadDay(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadDay, refreshKey]);

  const toggleSlotStop = async (service: string, time: string, blocked: boolean) => {
    const key = `${service}:${time}`;
    setSavingSlot(key);
    try {
      await adminJson("/api/admin/slot-blocks", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, offering, time, blocked }),
      });
      await loadDay();
      await onSlotStopChanged?.();
      toast(am.availability.slotStopSaved);
    } catch (err) {
      toast(err instanceof Error ? err.message : am.availability.slotStopError, "error");
    } finally {
      setSavingSlot(null);
    }
  };

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
        const ended = serviceHasEnded(day.date, svc.slots.at(-1)?.time, svc.turnMinutes);
        return (
          <div key={svc.id}>
            <div className="flex items-center justify-between mb-1.5">
              <span className={`text-sm font-semibold ${ended ? "text-on-surface-variant" : ""}`}>{svc.label}</span>
              {ended && <span className="text-xs font-medium text-on-surface-variant/70">{am.availability.serviceEnded}</span>}
            </div>
            <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
              {svc.slots.map((s) => {
                const status = slotCoverStatus(s, ended);
                const title = `${s.time}: ${am.availability.slotStatus(s.booked, s.capacity, s.remaining)}. ${status.label}`;
                const blocked = s.unavailableReason === "blocked";
                const canToggleStop = allowSlotStops && !ended && s.unavailableReason !== "service_disabled";
                const stopLabel = blocked
                  ? am.availability.slotResumeAction(s.time)
                  : am.availability.slotStopAction(s.time);
                const saving = savingSlot === `${svc.id}:${s.time}`;
                return (
                  <Tooltip key={s.time} content={title} className="w-full">
                    <div className="relative w-full">
                      <button
                        type="button"
                        disabled={!onPickSlot}
                        onClick={() => onPickSlot?.(svc.id, s.time)}
                        aria-label={title}
                        className={`min-h-[72px] w-full rounded-lg border px-3 py-2 text-left tabular-nums transition-all ${canToggleStop ? "pr-11" : ""} ${status.className} ${onPickSlot ? "cursor-pointer hover:brightness-110 active:scale-[0.98]" : "cursor-default"}`}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-base font-semibold leading-none">{s.time}</span>
                          {!ended && <span className={`mt-0.5 h-2.5 w-2.5 rounded-full ${status.dotClass}`} aria-hidden="true" />}
                        </span>
                        <span className="mt-2 block text-xs font-semibold leading-tight">
                          {am.availability.covers(s.booked, s.capacity)}
                        </span>
                        <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide leading-tight opacity-80">
                          {status.shortLabel}
                        </span>
                      </button>
                      {canToggleStop && (
                        <Tooltip content={stopLabel}>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={(event) => {
                              event.stopPropagation();
                              void toggleSlotStop(svc.id, s.time, !blocked);
                            }}
                            aria-label={stopLabel}
                            className={`absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md border transition ${
                              blocked
                                ? "border-primary/60 bg-primary/20 text-primary hover:bg-primary/30"
                                : "border-outline-variant/50 bg-surface-container/80 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                            } disabled:opacity-50`}
                          >
                            {blocked ? (
                              <span
                                aria-hidden="true"
                                className="ml-0.5 h-0 w-0 border-y-[5px] border-l-[8px] border-y-transparent border-l-current"
                              />
                            ) : (
                              <span aria-hidden="true" className="flex items-center gap-0.5">
                                <span className="h-3 w-1 rounded-sm bg-current" />
                                <span className="h-3 w-1 rounded-sm bg-current" />
                              </span>
                            )}
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function localDateStr(d = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function minutesNow(d = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

function minutesOf(time: string | undefined): number | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function serviceHasEnded(date: string, lastSlot: string | undefined, turnMinutes: number): boolean {
  const today = localDateStr();
  if (date < today) return true;
  if (date > today) return false;
  const last = minutesOf(lastSlot);
  if (last == null) return false;
  return minutesNow() > last + Math.max(0, turnMinutes);
}

function slotCoverStatus(
  slot: { capacity: number; booked: number; remaining: number; available: boolean; unavailableReason?: SlotUnavailableReason },
  serviceEnded: boolean,
) {
  if (serviceEnded) {
    return {
      label: am.availability.serviceEnded,
      shortLabel: am.availability.serviceEnded,
      className: "bg-surface-container-high/60 text-on-surface-variant/70 border-outline-variant/25",
      dotClass: "",
    };
  }
  if (slot.remaining <= 0) {
    return {
      label: am.availability.fullyBooked,
      shortLabel: am.availability.fullShort,
      className: "bg-rose-500/15 text-rose-300 border-rose-500/30",
      dotClass: "bg-rose-300",
    };
  }
  if (!slot.available) {
    const label = slotUnavailableLabel(slot.unavailableReason);
    return {
      label,
      shortLabel: label,
      className: "bg-surface-container-high text-on-surface-variant/60 border-outline-variant/30",
      dotClass: "bg-on-surface-variant/40",
    };
  }
  const ratio = slot.capacity > 0 ? slot.remaining / slot.capacity : 0;
  if (ratio < 0.05) {
    return {
      label: am.availability.coversAvailableCritical,
      shortLabel: am.availability.criticalShort,
      className: "bg-rose-500/15 text-rose-300 border-rose-500/30",
      dotClass: "bg-rose-300",
    };
  }
  if (ratio < 0.3) {
    return {
      label: am.availability.coversAvailableLow,
      shortLabel: am.availability.lowShort,
      className: "bg-amber-400/15 text-amber-300 border-amber-400/30",
      dotClass: "bg-amber-300",
    };
  }
  return (
    {
      label: am.availability.coversAvailableOk,
      shortLabel: am.availability.openShort,
      className: "bg-emerald-400/10 text-emerald-300 border-emerald-400/30",
      dotClass: "bg-emerald-300",
    }
  );
}

function slotUnavailableLabel(reason: SlotUnavailableReason | undefined): string {
  switch (reason) {
    case "service_disabled":
      return am.availability.slotServiceStopped;
    case "blocked":
      return am.availability.slotBlocked;
    case "lead_time":
      return am.availability.slotLeadTime;
    case "capacity":
      return am.availability.slotNotEnoughCovers;
    default:
      return am.availability.slotUnavailable;
  }
}
