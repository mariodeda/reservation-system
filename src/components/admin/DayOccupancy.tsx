"use client";

import { useCallback, useEffect, useState } from "react";
import type { DayAvailability, SlotUnavailableReason } from "@/lib/reservations/types";
import { adminJson, toast } from "./api";
import { am } from "@/i18n";
import Tooltip from "@/components/ui/Tooltip";

type SelectedSlot = {
  service: string;
  serviceLabel: string;
  time: string;
  booked: number;
  capacity: number;
  remaining: number;
  overbookedBy: number;
  statusLabel: string;
  blocked: boolean;
  available: boolean;
  ended: boolean;
  canToggleStop: boolean;
};

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
  onOpenFloor,
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
  onOpenFloor?: () => void;
}) {
  const [day, setDay] = useState<DayAvailability | null>(null);
  const [error, setError] = useState(false);
  const [savingSlot, setSavingSlot] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

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
      setSelectedSlot((slot) => slot && slot.service === service && slot.time === time ? { ...slot, blocked } : slot);
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
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {Heading}
          <p className="text-[11px] leading-snug text-on-surface-variant">
            {am.availability.slotCapacityHelpIntro}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-outline-variant/40 text-sm font-semibold text-on-surface-variant transition hover:border-primary/50 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          aria-label={am.availability.slotCapacityHelpTitle}
        >
          ?
        </button>
      </div>
      {day.services.map((svc) => {
        const ended = serviceHasEnded(day.date, svc.slots.at(-1)?.time, svc.turnMinutes);
        const booked = svc.slots.reduce((sum, slot) => sum + slot.booked, 0);
        const capacity = svc.slots.reduce((sum, slot) => sum + slot.capacity, 0);
        return (
          <div key={svc.id}>
            {onOpenFloor ? (
              <button
                type="button"
                onClick={onOpenFloor}
                className="mb-1.5 flex w-full items-center justify-between rounded-lg px-1 py-1 text-left transition hover:bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <span className={`text-sm font-semibold ${ended ? "text-on-surface-variant" : ""}`}>{svc.label}</span>
                <span className="flex items-center gap-3 text-xs text-on-surface-variant">
                  {ended && <span className="font-medium text-on-surface-variant/70">{am.availability.serviceEnded}</span>}
                  <span className="tabular-nums">{am.availability.covers(booked, capacity)}</span>
                </span>
              </button>
            ) : (
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-sm font-semibold ${ended ? "text-on-surface-variant" : ""}`}>{svc.label}</span>
                {ended && <span className="text-xs font-medium text-on-surface-variant/70">{am.availability.serviceEnded}</span>}
              </div>
            )}
            <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
              {svc.slots.map((s) => {
                const status = slotCoverStatus(s, ended);
                const title = `${s.time}: ${slotStatusLabel(s)}. ${status.label}`;
                const blocked = s.unavailableReason === "blocked";
                const canToggleStop = allowSlotStops && !ended && s.unavailableReason !== "service_disabled";
                const hasActions = Boolean(onPickSlot || canToggleStop);
                return (
                  <Tooltip key={s.time} content={title} className="w-full">
                    <button
                      type="button"
                      disabled={!hasActions}
                      onClick={() => setSelectedSlot({
                        service: svc.id,
                        serviceLabel: svc.label,
                        time: s.time,
                        booked: s.booked,
                        capacity: s.capacity,
                        remaining: s.remaining,
                        overbookedBy: s.overbookedBy ?? 0,
                        statusLabel: status.label,
                        blocked,
                        available: s.available,
                        ended,
                        canToggleStop,
                      })}
                      aria-label={title}
                      className={`min-h-[72px] w-full rounded-lg border px-3 py-2 text-left tabular-nums transition-all ${status.className} ${hasActions ? "cursor-pointer hover:brightness-110 active:scale-[0.98]" : "cursor-default"}`}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-base font-semibold leading-none">{s.time}</span>
                        {!ended && <span className={`mt-0.5 h-2.5 w-2.5 rounded-full ${status.dotClass}`} aria-hidden="true" />}
                      </span>
                      <span className="mt-2 block text-xs font-semibold leading-tight">
                        {am.availability.covers(s.booked, s.capacity)}
                      </span>
                      {(s.overbookedBy ?? 0) > 0 && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded border border-rose-300/40 bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-surface">
                          <WarningIcon />
                          {am.availability.overbookedShort(s.overbookedBy ?? 0)}
                        </span>
                      )}
                      <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide leading-tight opacity-80">
                        {status.shortLabel}
                      </span>
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        );
      })}
      {helpOpen && (
        <SlotCapacityHelpModal onClose={() => setHelpOpen(false)} />
      )}
      {selectedSlot && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={am.availability.slotActionsTitle}>
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-outline-variant/40 bg-surface shadow-2xl">
            <div className="border-b border-outline-variant/20 bg-surface-container px-4 py-4 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">
                    {am.availability.slotActionsTitle}
                  </div>
                  <h2 id="slot-actions-title" className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-on-surface">
                    <span className="text-3xl font-semibold tabular-nums">{selectedSlot.time}</span>
                    <span className="text-sm font-medium text-on-surface-variant">{selectedSlot.serviceLabel}</span>
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSlot(null)}
                  aria-label={am.reservations.close}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-outline-variant/30 text-on-surface-variant transition hover:bg-surface-container-high hover:text-on-surface"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>

            <div className="space-y-4 px-4 py-4 sm:px-5">
              {selectedSlot.overbookedBy > 0 && (
                <div className="rounded-lg border border-rose-400/40 bg-rose-500/15 px-3 py-3 text-sm text-on-surface">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-error"><WarningIcon /></span>
                    <div>
                      <div className="font-semibold">{am.availability.overbookedTitle(selectedSlot.overbookedBy)}</div>
                      <div className="mt-1 text-xs text-on-surface-variant">{am.availability.overbookedHint}</div>
                    </div>
                  </div>
                </div>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">
                    {am.availability.slotCoversLabel}
                  </div>
                  <div className="mt-1 text-lg font-semibold text-on-surface tabular-nums">
                    {selectedSlot.booked}/{selectedSlot.capacity}
                  </div>
                  <div className="mt-1 text-xs text-on-surface-variant">
                    {selectedSlot.overbookedBy > 0
                      ? am.availability.overbookedByLabel(selectedSlot.overbookedBy)
                      : am.availability.slotRemainingLabel(selectedSlot.remaining)}
                  </div>
                </div>
                <div className="rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">
                    {am.availability.slotOnlineLabel}
                  </div>
                  <div className={`mt-1 text-sm font-semibold ${selectedSlot.overbookedBy > 0 ? "text-rose-300" : selectedSlot.blocked ? "text-amber-300" : selectedSlot.ended ? "text-on-surface-variant" : "text-emerald-300"}`}>
                    {selectedSlot.overbookedBy > 0
                      ? am.availability.slotOnlineClosedCapacity
                      : selectedSlot.blocked
                      ? am.availability.slotOnlineStopped
                      : selectedSlot.ended
                        ? am.availability.serviceEnded
                        : am.availability.slotOnlineOpen}
                  </div>
                  <div className="mt-1 text-xs text-on-surface-variant">{selectedSlot.statusLabel}</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">
                  {am.availability.slotStaffActions}
                </div>
              {onPickSlot && (
                <button
                  type="button"
                  onClick={() => {
                    onPickSlot(selectedSlot.service, selectedSlot.time);
                    setSelectedSlot(null);
                  }}
                  className="flex w-full items-center justify-between rounded-lg bg-primary px-3 py-3 text-left text-sm font-semibold text-on-primary transition hover:brightness-105"
                >
                  <span>{am.availability.slotAddReservationAction(selectedSlot.time)}</span>
                  <span aria-hidden="true">+</span>
                </button>
              )}
              </div>

              {selectedSlot.canToggleStop && (
                <div className="space-y-2 rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">
                    {am.availability.slotPublicBookingActions}
                  </div>
                  <button
                    type="button"
                    disabled={savingSlot === `${selectedSlot.service}:${selectedSlot.time}` || (!selectedSlot.blocked && !selectedSlot.available)}
                    onClick={() => void toggleSlotStop(selectedSlot.service, selectedSlot.time, !selectedSlot.blocked)}
                    className={`flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left text-sm font-semibold text-on-surface transition disabled:opacity-60 ${
                      selectedSlot.blocked
                        ? "border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/15"
                        : "border-amber-500/40 bg-amber-500/12 hover:bg-amber-500/18"
                    }`}
                  >
                    <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                      selectedSlot.blocked
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "bg-amber-500/18 text-amber-700 dark:text-amber-300"
                    }`}>
                      {selectedSlot.blocked ? <UnlockIcon /> : <StopOnlineIcon />}
                    </span>
                    <span className="min-w-0">
                      <span className="block">
                        {selectedSlot.blocked
                          ? am.availability.slotResumeAction(selectedSlot.time)
                          : am.availability.slotStopAction(selectedSlot.time)}
                      </span>
                      <span className="mt-1 block text-xs font-normal text-on-surface-variant">
                        {selectedSlot.blocked
                          ? am.availability.slotResumeHint
                          : selectedSlot.available
                            ? am.availability.slotStopHint
                            : am.reservations.stopOnlineBookingDisabled}
                      </span>
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SlotCapacityHelpModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="slot-capacity-help-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-outline-variant/40 bg-surface shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-outline-variant/20 bg-surface-container px-4 py-3">
          <h2 id="slot-capacity-help-title" className="text-sm font-semibold text-on-surface">
            {am.availability.slotCapacityHelpTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={am.reservations.close}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-outline-variant/30 text-on-surface-variant transition hover:bg-surface-container-high hover:text-on-surface"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="space-y-3 px-4 py-4 text-sm leading-relaxed text-on-surface-variant">
          <p>{am.availability.slotCapacityHelpIntro}</p>
          <p>{am.availability.slotCapacityHelpExample}</p>
          <p>{am.availability.slotCapacityHelpReason}</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary transition hover:brightness-105"
          >
            {am.availability.slotCapacityHelpClose}
          </button>
        </div>
      </div>
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
  if (slot.booked > slot.capacity) {
    const overbookedBy = slot.booked - slot.capacity;
    return {
      label: am.availability.overbookedTitle(overbookedBy),
      shortLabel: am.availability.overbookedStateShort,
      className: "bg-rose-600/25 text-on-surface border-rose-300/50 ring-1 ring-rose-300/30",
      dotClass: "bg-rose-100",
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

function slotStatusLabel(slot: { booked: number; capacity: number; remaining: number; overbookedBy?: number }): string {
  return (slot.overbookedBy ?? 0) > 0
    ? am.availability.slotOverbookedStatus(slot.booked, slot.capacity, slot.overbookedBy ?? 0)
    : am.availability.slotStatus(slot.booked, slot.capacity, slot.remaining);
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M4 4l8 8" />
      <path d="M12 4l-8 8" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2.5 1.75 13.25h12.5L8 2.5Z" />
      <path d="M8 6v3.25" />
      <path d="M8 11.75h.01" />
    </svg>
  );
}

function StopOnlineIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2.25a5.75 5.75 0 1 1 0 11.5 5.75 5.75 0 0 1 0-11.5Z" />
      <path d="m4.5 4.5 7 7" />
    </svg>
  );
}

function UnlockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 7V5.75a3 3 0 0 1 5.6-1.5" />
      <path d="M4.5 7h7a.9.9 0 0 1 .9.9v4.1a.9.9 0 0 1-.9.9h-7a.9.9 0 0 1-.9-.9V7.9a.9.9 0 0 1 .9-.9Z" />
    </svg>
  );
}
