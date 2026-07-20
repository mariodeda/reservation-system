"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  type AvailabilityConfig,
  type DaySchedule,
  DEFAULT_OFFERING_ID,
  type Offering,
  type ServiceWindow,
} from "@/lib/reservations/types";
import { getOfferings } from "@/lib/reservations/offerings";
import { SERVICE_NAME_POOL, serviceNameFor } from "@/lib/reservations/service-catalog";
import { adminFetch, adminJson, toast } from "@/components/admin/api";
import Tooltip from "@/components/ui/Tooltip";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { am } from "@/i18n";

const defaultService = (): ServiceWindow => ({
  id: "dinner",
  label: serviceNameFor("dinner").en,
  start: "18:00",
  end: "22:00",
  interval: 30,
  capacity: 20,
});

const emptyWeekly = (): Offering["weekly"] => {
  const w: Offering["weekly"] = {};
  for (let d = 0; d < 7; d++) w[d] = { closed: true, services: [] };
  return w;
};

const newOffering = (label: string): Offering => ({
  id: `offering-${Date.now()}`,
  label,
  weekly: emptyWeekly(),
  dateOverrides: {},
  blockedSlots: {},
});

/**
 * Ensure the config carries an explicit `offerings` array for editing. Legacy
 * configs (no offerings) are normalized into a single primary offering so the
 * whole editor can operate on offerings[activeIdx] uniformly.
 */
function withOfferings(config: AvailabilityConfig): AvailabilityConfig {
  if (config.offerings && config.offerings.length > 0) return config;
  return { ...config, offerings: structuredClone(getOfferings(config)) };
}

const WEEKDAYS = [
  { i: 1, label: "Monday" },
  { i: 2, label: "Tuesday" },
  { i: 3, label: "Wednesday" },
  { i: 4, label: "Thursday" },
  { i: 5, label: "Friday" },
  { i: 6, label: "Saturday" },
  { i: 0, label: "Sunday" },
];

const field =
  "h-8 bg-surface-container-high border border-outline-variant/30 rounded-md px-2 py-1 text-sm focus:border-primary outline-none [color-scheme:dark]";

const SYSTEM_TURN_MINUTES = 120;
const DUR_OPTIONS = [45, 60, 75, 90, 105, 120, 150, 180, 240];
const HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES_60 = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

function timeParts(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return { hour: "00", minute: "00" };
  const hour = HOURS_24.includes(match[1]) ? match[1] : "00";
  const minute = MINUTES_60.includes(match[2]) ? match[2] : "00";
  return { hour, minute };
}

function useUnsavedChangesWarning(enabled: boolean, message: string) {
  const enabledRef = useRef(enabled);
  const messageRef = useRef(message);

  useEffect(() => {
    enabledRef.current = enabled;
    messageRef.current = message;
  }, [enabled, message]);

  useEffect(() => {
    const shouldLeave = () => !enabledRef.current || window.confirm(messageRef.current);
    const sameDestination = (href: string) => {
      const next = new URL(href, window.location.href);
      return next.href === window.location.href;
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!enabledRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    const onClick = (event: MouseEvent) => {
      if (!enabledRef.current || event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download") || sameDestination(anchor.href)) return;
      if (shouldLeave()) return;
      event.preventDefault();
      event.stopPropagation();
    };

    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    window.history.pushState = function pushState(data, unused, url) {
      if (url !== undefined && !sameDestination(String(url)) && !shouldLeave()) return;
      return originalPushState.apply(this, [data, unused, url]);
    };
    window.history.replaceState = function replaceState(data, unused, url) {
      if (url !== undefined && !sameDestination(String(url)) && !shouldLeave()) return;
      return originalReplaceState.apply(this, [data, unused, url]);
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, []);
}

export default function AvailabilityPage() {
  const { slug } = useParams<{ slug: string }>();
  const [config, setConfig] = useState<AvailabilityConfig | null>(null);
  const [activeId, setActiveId] = useState<string>(DEFAULT_OFFERING_ID);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [newClosure, setNewClosure] = useState("");
  const [blockDate, setBlockDate] = useState("");
  const [blockTime, setBlockTime] = useState("");
  const [overrideDate, setOverrideDate] = useState("");

  useUnsavedChangesWarning(dirty && !saving, am.availability.unsavedLeaveWarning);

  useEffect(() => {
    adminJson<{ config: AvailabilityConfig }>("/api/admin/config")
      .then((d) => {
        const cfg = withOfferings(d.config);
        setConfig(cfg);
        setActiveId(cfg.offerings![0].id);
      })
      .catch(() => toast(am.availability.couldNotLoad, "error"));
  }, []);

  function update(fn: (c: AvailabilityConfig) => void) {
    setConfig((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
    setSaved(false);
  }

  /** Apply a mutation to the currently-selected offering. */
  function updateOffering(fn: (o: Offering) => void) {
    update((c) => {
      const o = c.offerings?.find((x) => x.id === activeId);
      if (o) fn(o);
    });
  }

  async function save() {
    if (!config) return;
    // Remember the selection by POSITION — the server forces offerings[0].id to
    // "main" and may dedupe other ids, so matching by id alone would bounce the
    // user back to the first offering (and their edits appear to vanish).
    const activeIdx = Math.max(0, (config.offerings ?? []).findIndex((o) => o.id === activeId));
    setSaving(true);
    try {
      const res = await adminFetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error((d as { error?: string })?.error || "Could not save changes.");
      }
      // reflect server-side sanitisation back into the editor
      const data = await res.json().catch(() => null);
      if (data?.config) {
        const cfg = withOfferings(data.config as AvailabilityConfig);
        setConfig(cfg);
        // Restore the selection by position so editing a non-primary offering
        // keeps it selected after save.
        const restored = cfg.offerings![activeIdx] ?? cfg.offerings![0];
        setActiveId(restored.id);
      }
      setDirty(false);
      setSaved(true);
      toast(am.availability.saved);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      toast(err instanceof Error ? err.message : am.availability.couldNotSave, "error");
    } finally {
      setSaving(false);
    }
  }

  if (!config) return <p className="text-on-surface-variant">{am.availability.loading}</p>;

  const offerings = config.offerings ?? [];
  const active = offerings.find((o) => o.id === activeId) ?? offerings[0];
  const globalTurnMinutes = config.turnMinutes ?? SYSTEM_TURN_MINUTES;
  const manualCapacity = config.capacityMode === "manual";

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">{am.availability.title}</h1>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          {dirty && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-sm font-medium text-amber-700 dark:text-amber-200">
              {am.availability.unsavedIndicator}
            </span>
          )}
          {saved && !dirty && <span className="text-on-surface-variant text-sm">{am.availability.savedIndicator}</span>}
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="ml-auto bg-primary text-on-primary px-5 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-60 sm:ml-0"
          >
            {saving ? am.availability.saving : am.availability.saveChanges}
          </button>
        </div>
      </div>

      {/* Offerings bar — what kinds of experiences this venue takes bookings for
          (Restaurant, Sushi, Cocktails, Events…). Each owns its own schedule. */}
      <OfferingsBar
        offerings={offerings}
        activeId={active?.id ?? DEFAULT_OFFERING_ID}
        onSelect={setActiveId}
        onAdd={() => {
          const o = newOffering(`Offering ${offerings.length + 1}`);
          update((c) => c.offerings!.push(o));
          setActiveId(o.id);
        }}
        onRename={(id, label) => update((c) => {
          const o = c.offerings!.find((x) => x.id === id);
          if (o) o.label = label;
        })}
        onRemove={(id) => {
          if (offerings.length <= 1) return;
          update((c) => {
            c.offerings = c.offerings!.filter((x) => x.id !== id);
          });
          if (activeId === id) setActiveId(offerings.find((o) => o.id !== id)!.id);
        }}
      />

      {/* Booking rules */}
      <section className="bg-surface-container border border-outline-variant/30 rounded-xl p-4">
        <h2 className="font-semibold mb-3">{am.availability.bookingRules}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Num label={am.availability.minParty} value={config.minPartySize} min={1} onChange={(v) => update((c) => (c.minPartySize = v))} />
          <Num label={am.availability.maxParty} value={config.maxPartySize} min={1} onChange={(v) => update((c) => (c.maxPartySize = v))} />
          <Num label={am.availability.bookingWindow} value={config.bookingWindowDays} min={1} onChange={(v) => update((c) => (c.bookingWindowDays = v))} />
          <Num label={am.availability.leadTime} value={config.leadMinutes} min={0} onChange={(v) => update((c) => (c.leadMinutes = v))} />
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-on-surface-variant">{am.availability.tableDuration}</span>
            <select
              value={config.turnMinutes ?? ""}
              onChange={(e) => update((c) => { c.turnMinutes = e.target.value ? Number(e.target.value) : undefined; })}
              className={`${field} w-full`}
            >
              <option value="">{am.availability.durLabel(SYSTEM_TURN_MINUTES)}</option>
              {DUR_OPTIONS.map((m) => (
                <option key={m} value={m}>{am.availability.durLabel(m)}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs text-on-surface-variant mt-2">
          {am.availability.leadHint}
        </p>
        <p className="text-xs text-on-surface-variant mt-1">
          {am.availability.tableDurationHint}
        </p>
      </section>

      {!manualCapacity && (
        <section className="rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-on-surface">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-on-surface-variant">
              {am.availability.tableCapacityBanner}
            </p>
            <a
              href={`/admin/${slug}/tables`}
              className="inline-flex w-fit items-center rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/10"
            >
              {am.availability.manageTables}
            </a>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[7fr_3fr] gap-6 items-start">
        {/* Weekly schedule — for the selected offering */}
        <section className="bg-surface-container border border-outline-variant/30 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-outline-variant/20">
            <h2 className="font-semibold">{am.availability.weeklyHours}</h2>
            {offerings.length > 1 && (
              <p className="text-xs text-on-surface-variant mt-0.5">
                {am.availability.editingPrefix} <span className="text-primary font-medium">{active.label}</span>
              </p>
            )}
          </div>
          {WEEKDAYS.map(({ i, label }, idx) => {
            const day = active.weekly[i] ?? { closed: true, services: [] };
            const isOpen = !day.closed;
            return (
              <div
                key={i}
                className={`grid lg:grid-cols-[120px_minmax(0,1fr)] ${idx > 0 ? "border-t border-outline-variant/20" : ""} ${
                  isOpen ? "bg-surface-container" : "bg-surface-container/60"
                }`}
              >
                <div className={`flex flex-col items-start gap-2 px-4 py-3 ${isOpen ? "" : "opacity-60"}`}>
                  <span className="font-medium text-sm">{label}</span>
                  <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-medium ${isOpen ? "text-on-surface" : "text-on-surface-variant"}`}>
                        {isOpen ? am.availability.open : am.availability.closed}
                      </span>
                      <button
                        role="switch"
                        aria-checked={isOpen}
                        onClick={() =>
                          updateOffering((o) => {
                            const d = (o.weekly[i] ??= { closed: true, services: [] });
                            d.closed = !d.closed;
                            if (!d.closed && d.services.length === 0) d.services.push(defaultService());
                          })
                        }
                        className={`relative shrink-0 w-9 h-5 rounded-full transition-colors focus:outline-none ${isOpen ? "bg-primary" : "bg-outline-variant/50"}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 bg-surface-bright rounded-full shadow transition-all ${isOpen ? "left-[18px]" : "left-0.5"}`} />
                      </button>
                  </div>
                </div>
                <div className={`min-w-0 px-4 pb-4 lg:px-3 lg:py-3 ${isOpen ? "lg:border-l lg:border-outline-variant/10" : "hidden lg:block"}`}>
                  {isOpen ? (
                    <DayServicesEditor
                      services={day.services}
                      inheritedTurnMinutes={globalTurnMinutes}
                      showCapacity={manualCapacity}
                      wide
                      mutate={(fn) => updateOffering((o) => fn((o.weekly[i] ??= { closed: false, services: [] })))}
                    />
                  ) : (
                    <span className="text-xs text-on-surface-variant">{am.availability.closed}</span>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        {/* Right column: Special dates + Closed days + Blocked slots */}
        <div className="space-y-6">

        {/* Special dates (one-off hours) */}
        <section className="bg-surface-container border border-outline-variant/30 rounded-xl p-4">
        <h2 className="font-semibold mb-1">{am.availability.specialDates}</h2>
        <p className="text-xs text-on-surface-variant mb-3">
          {am.availability.specialDatesHint}
        </p>

        <div className="space-y-3 mb-3">
          {Object.keys(active.dateOverrides).length === 0 && (
            <span className="text-on-surface-variant text-sm">{am.availability.none}</span>
          )}
          {Object.entries(active.dateOverrides)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, sched]) => (
              <div key={date} className="bg-surface-container-high border border-outline-variant/30 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2 gap-3">
                  <div className="flex items-center gap-3">
                    <span className="font-medium tabular-nums">{date}</span>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!sched.closed}
                        onChange={(e) =>
                          updateOffering((o) => {
                            const d = o.dateOverrides[date];
                            d.closed = !e.target.checked;
                            if (!d.closed && d.services.length === 0) d.services.push(defaultService());
                          })
                        }
                      />
                      {sched.closed ? <span className="text-on-surface-variant">{am.availability.closed}</span> : <span className="text-on-surface">{am.availability.open}</span>}
                    </label>
                  </div>
                  <button
                    onClick={() => updateOffering((o) => delete o.dateOverrides[date])}
                    className="text-rose-400 hover:text-rose-300 text-sm"
                  >
                    {am.availability.remove}
                  </button>
                </div>
                {!sched.closed && (
                  <DayServicesEditor
                    services={sched.services}
                    inheritedTurnMinutes={globalTurnMinutes}
                    mutate={(fn) => updateOffering((o) => fn(o.dateOverrides[date]))}
                  />
                )}
              </div>
            ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <input type="date" value={overrideDate} onChange={(e) => setOverrideDate(e.target.value)} className={`${field} min-w-[9rem] flex-1 sm:flex-none`} />
          <button
            onClick={() => {
              if (!overrideDate) return;
              if (active.dateOverrides[overrideDate]) {
                toast(am.availability.dateAlreadyExists, "error");
                return;
              }
              updateOffering((o) => {
                o.dateOverrides[overrideDate] = { closed: false, services: [defaultService()] };
              });
              setOverrideDate("");
            }}
            className="min-h-8 flex-1 bg-surface-container-high border border-outline-variant/30 rounded-lg px-3 text-sm hover:border-primary sm:flex-none"
          >
            {am.availability.addSpecialDate}
          </button>
        </div>
      </section>

      {/* Closures */}
      <section className="bg-surface-container border border-outline-variant/30 rounded-xl p-4">
        <h2 className="font-semibold mb-1">{am.availability.closedDays}</h2>
        <p className="text-xs text-on-surface-variant mb-3">
          {am.availability.closedDaysHint}
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {config.closures.length === 0 && (
            <span className="text-on-surface-variant text-sm">{am.availability.none}</span>
          )}
          {[...config.closures].sort().map((d) => (
            <span key={d} className="flex items-center gap-2 bg-surface-container-high border border-outline-variant/30 rounded-full pl-3 pr-1 py-1 text-sm">
              {d}
              <button
                onClick={() => update((c) => (c.closures = c.closures.filter((x) => x !== d)))}
                className="w-5 h-5 rounded-full hover:bg-rose-500/20 text-rose-400 inline-flex items-center justify-center"
                aria-label={`Remove ${d}`}
              >
                <XIcon className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input type="date" value={newClosure} onChange={(e) => setNewClosure(e.target.value)} className={`${field} min-w-[9rem] flex-1 sm:flex-none`} />
          <button
            onClick={() => {
              if (newClosure && !config.closures.includes(newClosure))
                update((c) => c.closures.push(newClosure));
              setNewClosure("");
            }}
            className="min-h-8 flex-1 bg-surface-container-high border border-outline-variant/30 rounded-lg px-3 text-sm hover:border-primary sm:flex-none"
          >
            {am.availability.addClosedDay}
          </button>
        </div>
      </section>

      {/* Blocked slots */}
      <section className="bg-surface-container border border-outline-variant/30 rounded-xl p-4">
        <h2 className="font-semibold mb-1">{am.availability.blockedSlotsTitle}</h2>
        <p className="text-xs text-on-surface-variant mb-3">
          {am.availability.blockedSlotsHint}
        </p>
        <div className="space-y-2 mb-3">
          {Object.entries(active.blockedSlots).filter(([, t]) => t.length).length === 0 && (
            <span className="text-on-surface-variant text-sm">{am.availability.none}</span>
          )}
          {Object.entries(active.blockedSlots)
            .filter(([, times]) => times.length)
            .sort()
            .map(([d, times]) => (
              <div key={d} className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-on-surface-variant w-28">{d}</span>
                {times.map((tm) => (
                  <span key={tm} className="flex items-center gap-1 bg-surface-container-high border border-outline-variant/30 rounded-full pl-2 pr-1 py-0.5 text-xs">
                    {tm}
                    <button
                      onClick={() =>
                        updateOffering((o) => {
                          o.blockedSlots[d] = o.blockedSlots[d].filter((x) => x !== tm);
                          if (!o.blockedSlots[d].length) delete o.blockedSlots[d];
                        })
                      }
                      className="text-rose-400 inline-flex items-center justify-center"
                      aria-label={`Unblock ${d} ${tm}`}
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input type="date" value={blockDate} onChange={(e) => setBlockDate(e.target.value)} className={`${field} min-w-[9rem] flex-1 sm:flex-none`} />
          <TimeInp label={am.availability.blockedSlotTime} value={blockTime || "00:00"} onChange={setBlockTime} compact />
          <button
            onClick={() => {
              if (!blockDate || !blockTime) return;
              updateOffering((o) => {
                o.blockedSlots[blockDate] ??= [];
                if (!o.blockedSlots[blockDate].includes(blockTime))
                  o.blockedSlots[blockDate].push(blockTime);
              });
              setBlockTime("");
            }}
            className="min-h-8 flex-1 bg-surface-container-high border border-outline-variant/30 rounded-lg px-3 text-sm hover:border-primary sm:flex-none"
          >
            {am.availability.blockSlot}
          </button>
        </div>
      </section>

        </div>{/* end right column */}
      </div>{/* end grid */}
    </div>
  );
}

function XIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

/**
 * Offerings bar — selects which offering's schedule is being edited, and lets
 * staff add / rename / remove offerings. Single-offering venues see only a
 * subtle "Add offering" affordance so the UI stays uncluttered.
 */
function OfferingsBar({
  offerings,
  activeId,
  onSelect,
  onAdd,
  onRename,
  onRemove,
}: {
  offerings: Offering[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, label: string) => void;
  onRemove: (id: string) => void;
}) {
  const [removeOpen, setRemoveOpen] = useState(false);
  if (offerings.length <= 1) {
    const only = offerings[0];
    return (
      <section className="bg-surface-container border border-outline-variant/30 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="font-semibold">{am.availability.offerings}</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            {only ? am.availability.offeringsHint : am.availability.offeringsHintEmpty}
          </p>
        </div>
        <button
          onClick={onAdd}
          className="bg-surface-container-high border border-outline-variant/30 rounded-lg px-3 py-2 text-sm hover:border-primary shrink-0"
        >
          {am.availability.addOffering}
        </button>
      </section>
    );
  }

  const active = offerings.find((o) => o.id === activeId) ?? offerings[0];
  return (
    <section className="bg-surface-container border border-outline-variant/30 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-semibold">{am.availability.offerings}</h2>
        <button
          onClick={onAdd}
          className="bg-surface-container-high border border-outline-variant/30 rounded-lg px-3 py-1.5 text-sm hover:border-primary"
        >
          {am.availability.addOffering}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {offerings.map((o) => {
          const isActive = o.id === active.id;
          return (
            <button
              key={o.id}
              onClick={() => onSelect(o.id)}
              className={`px-3 py-1.5 rounded-full text-sm border transition ${
                isActive
                  ? "bg-primary/15 text-primary border-primary/40 font-semibold"
                  : "border-outline-variant/30 text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {/* Inline editor for the selected offering */}
      <div className="flex items-end gap-2 flex-wrap border-t border-outline-variant/20 pt-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-none">
          <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">{am.availability.offeringName}</span>
          <input
            value={active.label}
            onChange={(e) => onRename(active.id, e.target.value)}
            className={`${field} w-full sm:w-44`}
            maxLength={60}
          />
        </label>
        <button
          onClick={() => setRemoveOpen(true)}
          className="text-rose-400 hover:text-rose-300 text-sm h-9 px-2"
        >
          {am.availability.removeOffering}
        </button>
      </div>
      <ConfirmDialog
        open={removeOpen}
        title={am.availability.removeOfferingDialogTitle}
        body={am.availability.removeOfferingConfirm(active.label)}
        warning={am.availability.removeOfferingDialogWarning}
        confirmLabel={am.availability.removeOffering}
        cancelLabel={am.row.cancel}
        destructive
        onCancel={() => setRemoveOpen(false)}
        onConfirm={() => {
          setRemoveOpen(false);
          onRemove(active.id);
        }}
      />
    </section>
  );
}

/**
 * Reusable editor for one day's service windows. `mutate` receives a function
 * that is applied to the live DaySchedule (weekly day or date override) inside
 * the parent's structuredClone updater.
 */
function DayServicesEditor({
  services,
  mutate,
  inheritedTurnMinutes,
  showCapacity = false,
  wide = false,
}: {
  services: ServiceWindow[];
  mutate: (fn: (day: DaySchedule) => void) => void;
  inheritedTurnMinutes: number;
  showCapacity?: boolean;
  wide?: boolean;
}) {
  const wideColumns =
    showCapacity
      ? "lg:grid-cols-[minmax(6rem,1.15fr)_repeat(2,minmax(7.25rem,0.85fr))_minmax(4rem,0.6fr)_minmax(5rem,0.7fr)_minmax(5.5rem,0.9fr)_auto]"
      : "lg:grid-cols-[minmax(6rem,1.25fr)_repeat(2,minmax(7.25rem,0.9fr))_minmax(4rem,0.65fr)_minmax(5.5rem,1fr)_auto]";
  return (
    <div className="space-y-2">
      {wide && services.length > 0 && (
        <div className={`hidden lg:grid ${wideColumns} lg:gap-2 px-1 text-[10px] uppercase tracking-widest text-on-surface-variant`}>
          <HeaderTip label={am.availability.serviceName} tip={am.availability.serviceNameHint} />
          <HeaderTip label={am.availability.serviceFrom} tip={am.availability.serviceFromHint} />
          <HeaderTip label={am.availability.serviceTo} tip={am.availability.serviceToHint} />
          <HeaderTip label={am.availability.serviceInterval} tip={am.availability.serviceIntervalHint} />
          {showCapacity && <HeaderTip label={am.availability.serviceCapacity} tip={am.availability.serviceCapacityHint} />}
          <HeaderTip label={am.availability.serviceDuration} tip={am.availability.serviceDurationHint} />
          <HeaderTip label={am.availability.actions} tip={am.availability.actionsHint} />
        </div>
      )}
      {services.map((s, si) => (
        <div
          key={si}
          className={`grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 ${wide ? wideColumns : ""} gap-2 items-end bg-surface-container-high/45 border border-outline-variant/20 rounded-lg p-2`}
        >
          <label className="flex flex-col gap-1">
            <span className={`text-[10px] uppercase tracking-widest text-on-surface-variant ${wide ? "lg:sr-only" : ""}`}>{am.availability.serviceName}</span>
            <select
              value={SERVICE_NAME_POOL.some((service) => service.id === s.id) ? s.id : ""}
              onChange={(event) => mutate((d) => {
                const selected = serviceNameFor(event.target.value, d.services[si].label);
                d.services[si].id = selected.id;
                d.services[si].label = selected.en;
              })}
              className={`${field} w-full`}
              aria-label={am.availability.serviceName}
            >
              {!SERVICE_NAME_POOL.some((service) => service.id === s.id) && (
                <option value="">{s.label || am.availability.serviceName}</option>
              )}
              {SERVICE_NAME_POOL.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.en} / {service.it}
                </option>
              ))}
            </select>
          </label>
          <TimeInp label={am.availability.serviceFrom} value={s.start} compact={wide} onChange={(v) => mutate((d) => (d.services[si].start = v))} />
          <TimeInp label={am.availability.serviceTo} value={s.end} compact={wide} onChange={(v) => mutate((d) => (d.services[si].end = v))} />
          <NumInp label={am.availability.serviceInterval} value={s.interval} w="w-full" min={5} compact={wide} onChange={(v) => mutate((d) => (d.services[si].interval = v))} />
          {showCapacity && (
            <NumInp label={am.availability.serviceCapacity} value={s.capacity} w="w-full" min={0} compact={wide} onChange={(v) => mutate((d) => (d.services[si].capacity = v))} />
          )}
          <label className="flex flex-col gap-1">
            <span className={`text-[10px] uppercase tracking-widest text-on-surface-variant ${wide ? "lg:sr-only" : ""}`}>{am.availability.serviceDuration}</span>
            <select
              value={s.turnMinutes ?? ""}
              onChange={(e) => mutate((d) => { const v = e.target.value; d.services[si].turnMinutes = v ? Number(v) : undefined; })}
              className={`${field} w-full`}
              aria-label={am.availability.serviceDuration}
            >
              <option value="">{am.availability.durLabel(inheritedTurnMinutes)}</option>
              {DUR_OPTIONS.map((m) => (
                <option key={m} value={m}>{am.availability.durLabel(m)}</option>
              ))}
            </select>
          </label>
          <button
            onClick={() => mutate((d) => d.services.splice(si, 1))}
            className="text-rose-400 hover:text-rose-300 text-sm h-8 px-2 justify-self-start sm:justify-self-end"
          >
            {am.availability.remove}
          </button>
        </div>
      ))}
      <button
        onClick={() => mutate((d) => d.services.push(defaultService()))}
        className="text-sm text-primary hover:underline"
      >
        {am.availability.addService}
      </button>
    </div>
  );
}

function HeaderTip({ label, tip }: { label: string; tip: string }) {
  return (
    <Tooltip content={tip}>
      <span className="inline-flex w-fit cursor-help items-center border-b border-dotted border-outline-variant/60 leading-tight">
        {label}
      </span>
    </Tooltip>
  );
}

function Num({ label, value, onChange, min }: { label: string; value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-on-surface-variant">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        step="1"
        onChange={(e) => onChange(Number(e.target.value))}
        className={`${field} w-full`}
      />
    </label>
  );
}
function Inp({ label, value, onChange, type = "text", w = "", compact = false }: { label: string; value: string; onChange: (v: string) => void; type?: string; w?: string; compact?: boolean }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={`text-[10px] uppercase tracking-widest text-on-surface-variant ${compact ? "lg:sr-only" : ""}`}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${field} ${w}`}
        aria-label={compact ? label : undefined}
      />
    </label>
  );
}
function TimeInp({ label, value, onChange, compact = false }: { label: string; value: string; onChange: (v: string) => void; compact?: boolean }) {
  const { hour, minute } = timeParts(value);
  return (
    <fieldset className="flex min-w-[7.25rem] flex-col gap-1">
      <legend className={`text-[10px] uppercase tracking-widest text-on-surface-variant ${compact ? "lg:sr-only" : ""}`}>{label}</legend>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
        <select
          value={hour}
          onChange={(e) => onChange(`${e.target.value}:${minute}`)}
          className={`${field} min-w-[50px] w-full tabular-nums`}
          aria-label={`${label} hour`}
        >
          {HOURS_24.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
        <span className="text-sm font-medium text-on-surface-variant" aria-hidden="true">:</span>
        <select
          value={minute}
          onChange={(e) => onChange(`${hour}:${e.target.value}`)}
          className={`${field} min-w-[50px] w-full tabular-nums`}
          aria-label={`${label} minute`}
        >
          {MINUTES_60.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}
function NumInp({ label, value, onChange, w = "", min, compact = false }: { label: string; value: number; onChange: (v: number) => void; w?: string; min?: number; compact?: boolean }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={`text-[10px] uppercase tracking-widest text-on-surface-variant ${compact ? "lg:sr-only" : ""}`}>{label}</span>
      <input type="number" value={value} min={min} step="1" onChange={(e) => onChange(Number(e.target.value))} className={`${field} ${w}`} aria-label={compact ? label : undefined} />
    </label>
  );
}
