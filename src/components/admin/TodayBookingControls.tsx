"use client";

import { useEffect, useRef, useState } from "react";
import { am } from "@/i18n";
import { adminFetch, adminJson, toast } from "./api";

interface TodayBookingControlService {
  offering: string;
  offeringLabel: string;
  service: string;
  serviceLabel: string;
  start: string;
  end: string;
  cutoffTime: string;
  disabled: boolean;
  cutoffPassed: boolean;
}

interface TodayBookingControlsResponse {
  date: string;
  timezone: string;
  leadMinutes: number;
  services: TodayBookingControlService[];
}

export default function TodayBookingControls() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<TodayBookingControlsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const stopped = data?.services.filter((s) => s.disabled).length ?? 0;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open]);

  async function load() {
    setLoading(true);
    try {
      setData(await adminJson<TodayBookingControlsResponse>("/api/admin/today-booking-controls"));
    } catch {
      toast(am.bookingControls.saveError, "error");
    } finally {
      setLoading(false);
    }
  }

  async function toggle(service: TodayBookingControlService, disabled: boolean) {
    const key = `${service.offering}:${service.service}`;
    setSavingKey(key);
    try {
      const res = await adminFetch("/api/admin/today-booking-controls", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offering: service.offering, service: service.service, disabled }),
      });
      const next = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(next.error || am.bookingControls.saveError);
      setData(next as TodayBookingControlsResponse);
      toast(am.bookingControls.saved);
    } catch (err) {
      toast(err instanceof Error ? err.message : am.bookingControls.saveError, "error");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={am.bookingControls.title}
        aria-label={am.bookingControls.button}
        className={`relative h-8 px-2.5 flex items-center gap-1.5 rounded-lg border transition text-xs font-semibold ${
          stopped > 0
            ? "border-amber-400/40 bg-amber-400/15 text-amber-200 hover:bg-amber-400/20"
            : "border-outline-variant/40 text-on-surface-variant hover:text-primary hover:bg-surface-container-high"
        }`}
      >
        <PauseIcon />
        <span className="hidden lg:inline">{am.bookingControls.button}</span>
        {stopped > 0 && (
          <span className="min-w-[16px] h-4 rounded-full bg-amber-400 text-surface text-[9px] font-bold flex items-center justify-center px-1 leading-none tabular-nums">
            {stopped}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-outline-variant/40 bg-surface-container shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-outline-variant/20">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-on-surface">{am.bookingControls.title}</span>
              {stopped > 0 && (
                <span className="rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/30 px-2 py-0.5 text-[10px] font-semibold">
                  {am.bookingControls.activeCount(stopped)}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-on-surface-variant">{am.bookingControls.subtitle}</p>
          </div>

          <div className="max-h-[420px] overflow-y-auto p-2">
            {loading && !data ? (
              <div className="px-3 py-6 text-sm text-on-surface-variant">{am.bookingControls.loading}</div>
            ) : !data || data.services.length === 0 ? (
              <div className="px-3 py-6 text-sm text-on-surface-variant">{am.bookingControls.none}</div>
            ) : (
              <div className="space-y-1.5">
                {data.services.map((service) => (
                  <ServiceControl
                    key={`${service.offering}:${service.service}`}
                    service={service}
                    saving={savingKey === `${service.offering}:${service.service}`}
                    multiOffering={new Set(data.services.map((s) => s.offering)).size > 1}
                    onToggle={(disabled) => toggle(service, disabled)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ServiceControl({
  service,
  saving,
  multiOffering,
  onToggle,
}: {
  service: TodayBookingControlService;
  saving: boolean;
  multiOffering: boolean;
  onToggle: (disabled: boolean) => void;
}) {
  const locked = service.cutoffPassed || saving;
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${service.disabled ? "border-amber-400/40 bg-amber-400/10" : "border-outline-variant/25 bg-surface-container-high/35"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-on-surface truncate">{service.serviceLabel}</span>
            <span className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${service.disabled ? "bg-amber-400/20 text-amber-300" : "bg-emerald-400/15 text-emerald-300"}`}>
              {service.disabled ? am.bookingControls.stopped : am.bookingControls.accepting}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            {multiOffering ? `${service.offeringLabel} · ` : ""}{service.start}-{service.end}
          </p>
          <p className="mt-0.5 text-[11px] text-on-surface-variant/70">
            {service.cutoffPassed ? am.bookingControls.cutoffPassed : am.bookingControls.cutoffHint(service.cutoffTime)}
          </p>
        </div>
        <label className={`inline-flex items-center gap-2 text-xs font-medium ${locked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
          <span>{am.bookingControls.stop}</span>
          <input
            type="checkbox"
            checked={service.disabled}
            disabled={locked}
            onChange={(e) => onToggle(e.target.checked)}
            className="sr-only peer"
          />
          <span className="relative h-5 w-9 rounded-full bg-outline-variant/35 peer-checked:bg-amber-400/80 transition after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4" />
        </label>
      </div>
    </div>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M5.2 3.5v9" />
      <path d="M10.8 3.5v9" />
    </svg>
  );
}
