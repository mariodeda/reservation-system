"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { type AdminReservation, formatDateLong, todayInTz } from "@/components/admin/shared";
import { am } from "@/i18n";
import ReservationRow from "@/components/admin/ReservationRow";
import DayOccupancy from "@/components/admin/DayOccupancy";
import WaitlistPanel from "@/components/admin/WaitlistPanel";
import { adminJson, toast } from "@/components/admin/api";
import {
  RESERVATION_STATUSES,
  type AvailabilityConfig,
  type DayAvailability,
  type ReservationStatus,
  type RestaurantTable,
  type TableState,
} from "@/lib/reservations/types";
import { offeringServiceMap, type OfferingServices } from "@/lib/reservations/offerings";

/** Floor-view entry returned by GET /api/admin/tables?date= */
interface FloorEntry {
  table: RestaurantTable;
  state: TableState;
  reservations: { id: string; time: string; partySize: number; name: string; status: string; service: string }[];
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const NAVBTN =
  "h-9 min-w-9 px-2 flex items-center justify-center rounded-lg border border-outline-variant/30 text-on-surface-variant hover:text-primary transition";

export default function ReservationsPage() {
  const { slug } = useParams<{ slug: string }>();
  const initialDate = useRef(todayInTz());
  const [date, setDate] = useState(initialDate.current);
  const [items, setItems] = useState<AdminReservation[]>([]);
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | "all">("all");
  const [offeringFilter, setOfferingFilter] = useState<string | "all">("all");
  const [query, setQuery] = useState("");
  const [config, setConfig] = useState<AvailabilityConfig | null>(null);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [seed, setSeed] = useState<{ offering?: string; service?: string; time?: string }>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<AdminReservation[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const tz = config?.timezone ?? "Europe/Rome";
  const searching = query.trim().length >= 2;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminJson<{ reservations: AdminReservation[] }>(
        `/api/admin/reservations?date=${date}`,
      );
      setItems(data.reservations ?? []);
      setRefreshKey((k) => k + 1);
    } catch {
      toast(am.reservations.couldNotLoad, "error");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    adminJson<{ config: AvailabilityConfig }>("/api/admin/config")
      .then((d) => {
        setConfig(d.config);
        // Correct the initial date if user hasn't navigated away and timezone matters
        setDate((current) => {
          if (current === initialDate.current) return todayInTz(d.config.timezone);
          return current;
        });
      })
      .catch(() => {});
    adminJson<{ tables: RestaurantTable[] }>("/api/admin/tables")
      .then((d) => setTables(d.tables ?? []))
      .catch(() => {});
  }, []);

  const hasTables = tables.some((t) => t.active);

  const offerings = useMemo<OfferingServices[]>(
    () => (config ? offeringServiceMap(config) : []),
    [config],
  );
  const multiOffering = offerings.length > 1;

  // global search across all dates (debounced)
  useEffect(() => {
    if (!searching) {
      setResults(null);
      return;
    }
    setSearchLoading(true);
    const id = setTimeout(async () => {
      try {
        const data = await adminJson<{ reservations: AdminReservation[] }>(
          `/api/admin/reservations?q=${encodeURIComponent(query.trim())}`,
        );
        setResults(data.reservations ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [query, searching]);

  const applyFilters = (list: AdminReservation[]) =>
    list.filter(
      (r) =>
        (statusFilter === "all" || r.status === statusFilter) &&
        (offeringFilter === "all" || (r.offering || "main") === offeringFilter),
    );
  const visible = applyFilters(items);
  const searchResults = applyFilters(results ?? []);

  const activeCovers = items
    .filter((r) => !["cancelled", "no_show"].includes(r.status))
    .reduce((s, r) => s + r.partySize, 0);

  function exportCsv() {
    const offeringLabel = (id?: string) =>
      offerings.find((o) => o.id === (id || "main"))?.label ?? (id || "main");
    // Service ids are only unique within an offering, so include the offering
    // column for multi-offering venues to keep the export unambiguous.
    const cols = [
      "Date", "Time", ...(multiOffering ? ["Offering"] : []), "Service", "Name", "Party",
      "Phone", "Email", "Status", "Occasion", "Notes", "Reference",
    ];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [cols.join(",")].concat(
      visible.map((r) =>
        [r.date, r.time, ...(multiOffering ? [offeringLabel(r.offering)] : []), r.service, r.name, r.partySize, r.phone, r.email, r.status, r.occasion ?? "", r.notes ?? "", r.reference]
          .map(esc)
          .join(","),
      ),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reservations-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">{am.reservations.title}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowWalkIn((s) => !s); setShowForm(false); }}
            className="border border-outline-variant/40 text-on-surface-variant hover:text-primary px-4 py-2 rounded-lg text-sm font-semibold transition"
          >
            {showWalkIn ? am.reservations.close : am.walkIn.button}
          </button>
          <button
            onClick={() => {
              setSeed({});
              setShowForm((s) => !s);
              setShowWalkIn(false);
            }}
            className="bg-primary text-on-primary px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110"
          >
            {showForm ? am.reservations.close : am.reservations.newReservation}
          </button>
        </div>
      </div>

      {showWalkIn && (
        <WalkInForm
          date={date}
          offerings={offerings}
          tz={tz}
          onCreated={() => { setShowWalkIn(false); load(); }}
        />
      )}

      {!searching && (
        <>
          {/* date nav + day tools */}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setDate(shiftDate(date, -1))} className={NAVBTN} aria-label="Previous day">
              ‹
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-surface-container border border-outline-variant/30 rounded-lg px-3 py-1.5 text-sm"
            />
            <button onClick={() => setDate(shiftDate(date, 1))} className={NAVBTN} aria-label="Next day">
              ›
            </button>
            <button onClick={() => setDate(todayInTz(tz))} className={`${NAVBTN} px-3 text-sm`}>
              {am.reservations.today}
            </button>
            <span className="text-on-surface-variant text-sm ml-1">
              {formatDateLong(date)} · {activeCovers} {am.reservations.covers}
            </span>
            <div className="ml-auto flex gap-2">
              <button
                onClick={exportCsv}
                disabled={visible.length === 0}
                className={`${NAVBTN} px-3 text-sm disabled:opacity-40`}
              >
                {am.reservations.exportCsv}
              </button>
              <button
                onClick={() => window.open(`/admin/${slug}/print?date=${date}`, "_blank")}
                className={`${NAVBTN} px-3 text-sm`}
              >
                {am.reservations.print}
              </button>
            </div>
          </div>

          {/* capacity overview — one per offering; click a slot to start a booking there */}
          <div className="space-y-2">
            {(offerings.length ? offerings : [{ id: "main", label: "", services: [] }]).map((o) => (
              <DayOccupancy
                key={o.id}
                date={date}
                offering={o.id}
                heading={multiOffering ? o.label : undefined}
                refreshKey={refreshKey}
                onPickSlot={(service, time) => {
                  setSeed({ offering: o.id, service, time });
                  setShowForm(true);
                }}
              />
            ))}
          </div>

          {hasTables && <TableTimelineView date={date} refreshKey={refreshKey} />}

          {hasTables && <FloorView date={date} refreshKey={refreshKey} />}

          <WaitlistPanel
            date={date}
            offerings={offerings}
            tables={tables}
            tz={tz}
            refreshKey={refreshKey}
            onSeated={load}
          />

          {showForm && (
            <NewReservationForm
              date={date}
              offerings={offerings}
              seed={seed}
              onCreated={() => {
                setShowForm(false);
                load();
              }}
            />
          )}
        </>
      )}

      {/* offering filter (only when more than one offering) */}
      {multiOffering && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-widest text-on-surface-variant mr-1">{am.reservations.offeringLabel}</span>
          <Chip active={offeringFilter === "all"} onClick={() => setOfferingFilter("all")}>
            {am.reservations.all}
          </Chip>
          {offerings.map((o) => (
            <Chip key={o.id} active={offeringFilter === o.id} onClick={() => setOfferingFilter(o.id)}>
              {o.label}
            </Chip>
          ))}
        </div>
      )}

      {/* filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Chip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
          {am.reservations.all}
        </Chip>
        {RESERVATION_STATUSES.map((s) => (
          <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
            {s.replace("_", "-")}
          </Chip>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={am.reservations.searchPlaceholder}
          maxLength={200}
          className="ml-auto bg-surface-container border border-outline-variant/30 rounded-lg px-3 py-1.5 text-sm w-72 max-w-full"
        />
      </div>

      {searching ? (
        <SearchResultsView
          loading={searchLoading}
          results={searchResults}
          query={query.trim()}
          onChanged={() => {
            // refresh both the search results and the (background) day list
            setQuery((q) => q);
            load();
          }}
          onJumpToDate={(d) => {
            setQuery("");
            setDate(d);
          }}
          offerings={offerings}
          tables={tables}
        />
      ) : loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant border border-dashed border-outline-variant/40 rounded-xl">
          {am.reservations.noReservationsDay}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((r) => (
            <ReservationRow key={r.id} r={r} onChanged={load} offerings={offerings} tables={tables} />
          ))}
        </div>
      )}
    </div>
  );
}

function SearchResultsView({
  loading,
  results,
  query,
  onChanged,
  onJumpToDate,
  offerings,
  tables,
}: {
  loading: boolean;
  results: AdminReservation[];
  query: string;
  onChanged: () => void;
  onJumpToDate: (date: string) => void;
  offerings: OfferingServices[];
  tables: RestaurantTable[];
}) {
  if (loading && results.length === 0) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-surface-container animate-pulse" />
        ))}
      </div>
    );
  }
  if (results.length === 0) {
    return (
      <div className="text-center py-16 text-on-surface-variant border border-dashed border-outline-variant/40 rounded-xl">
        {am.reservations.noMatch(query)}
      </div>
    );
  }

  // Group results by date for easier navigation
  const dateGroups = results.reduce<Map<string, AdminReservation[]>>((acc, r) => {
    const group = acc.get(r.date) ?? [];
    group.push(r);
    acc.set(r.date, group);
    return acc;
  }, new Map());

  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-variant">
        {am.reservations.results(results.length, query)}
      </p>
      {[...dateGroups.entries()].map(([d, rows]) => (
        <div key={d} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-on-surface-variant">{formatDateLong(d)}</span>
            <button
              onClick={() => onJumpToDate(d)}
              className="text-xs text-primary hover:underline"
            >
              {am.reservations.viewDay}
            </button>
          </div>
          {rows.map((r) => (
            <ReservationRow key={r.id} r={r} onChanged={onChanged} offerings={offerings} tables={tables} showDate />
          ))}
        </div>
      ))}
    </div>
  );
}

function timeInTz(tz: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  const h = String(Number(parts.hour) % 24).padStart(2, "0");
  return `${h}:${parts.minute}`;
}

function WalkInForm({
  date,
  offerings,
  tz,
  onCreated,
}: {
  date: string;
  offerings: OfferingServices[];
  tz: string;
  onCreated: () => void;
}) {
  const nowTime = useMemo(() => timeInTz(tz), [tz]);
  const [name, setName] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [table, setTable] = useState("");
  const [offering, setOffering] = useState(offerings[0]?.id ?? "main");
  const services = offerings.find((o) => o.id === offering)?.services ?? [];
  const [service, setService] = useState(services[0]?.id ?? "dinner");
  const multiOffering = offerings.length > 1;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError(am.walkIn.nameRequired); return; }
    setBusy(true);
    setError("");
    try {
      await adminJson("/api/admin/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          time: nowTime,
          offering,
          service,
          partySize,
          name: name.trim(),
          email: "",
          phone: "",
          tableLabel: table.trim() || undefined,
          status: "seated",
          source: "admin",
        }),
      });
      toast(am.walkIn.added);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : am.reservations.couldNotCreate);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="bg-surface-container border border-primary/30 rounded-xl p-4 space-y-3"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold">{am.walkIn.title}</span>
        <span className="text-xs text-on-surface-variant">{am.walkIn.subtitle}</span>
        <span className="ml-auto text-xs text-primary font-semibold tabular-nums">{nowTime}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={am.walkIn.name}
          className={`${field} col-span-2`}
          autoFocus
        />
        <input
          type="number"
          min={1}
          value={partySize}
          onChange={(e) => setPartySize(Number(e.target.value))}
          placeholder={am.walkIn.partySize}
          className={field}
        />
        <input
          value={table}
          onChange={(e) => setTable(e.target.value)}
          placeholder={am.walkIn.table}
          className={field}
        />
        {multiOffering && (
          <select
            value={offering}
            onChange={(e) => {
              const id = e.target.value;
              setOffering(id);
              const svcs = offerings.find((o) => o.id === id)?.services ?? [];
              if (!svcs.some((s) => s.id === service)) setService(svcs[0]?.id ?? "dinner");
            }}
            className={`${field} col-span-2 sm:col-span-1`}
          >
            {offerings.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        )}
        {services.length > 1 && (
          <select value={service} onChange={(e) => setService(e.target.value)} className={`${field} col-span-2 sm:col-span-1`}>
            {services.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        )}
        <button
          type="submit"
          disabled={busy}
          className="bg-primary text-on-primary rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-60 h-9 col-span-2 sm:col-span-1"
        >
          {busy ? am.walkIn.adding : am.walkIn.add}
        </button>
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}
    </form>
  );
}

const TIMELINE_STATUS: Record<string, string> = {
  seated:    "bg-sky-400/55 border border-sky-400/40",
  confirmed: "bg-amber-400/55 border border-amber-400/40",
  pending:   "bg-amber-400/40 border border-amber-400/30",
  completed: "bg-emerald-400/35 border border-emerald-400/25",
  cancelled: "bg-zinc-500/25 border border-zinc-500/20",
  no_show:   "bg-rose-400/30 border border-rose-400/20",
};

/** Horizontal per-table timeline showing bookings across the day. */
function TableTimelineView({ date, refreshKey }: { date: string; refreshKey: number }) {
  const [floor, setFloor] = useState<FloorEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    adminJson<{ floor: FloorEntry[] }>(`/api/admin/tables?date=${date}`)
      .then((d) => setFloor(d.floor ?? []))
      .catch(() => setFloor([]))
      .finally(() => setLoading(false));
  }, [date, refreshKey]);

  if (loading) return <div className="h-28 rounded-xl bg-surface-container animate-pulse" />;

  const activeTables = floor.filter((f) => f.table.active);
  if (activeTables.length === 0) return null;

  const toMins = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const fmtTime = (mins: number) => {
    const h = Math.floor(mins / 60).toString().padStart(2, "0");
    const m = (mins % 60).toString().padStart(2, "0");
    return `${h}:${m}`;
  };

  const allTimes = activeTables.flatMap((f) => f.reservations.map((r) => r.time));
  const SLOT = 30;
  let startMins: number;
  let endMins: number;
  if (allTimes.length > 0) {
    const mins = allTimes.map(toMins);
    startMins = Math.floor((Math.min(...mins) - SLOT) / SLOT) * SLOT;
    endMins = Math.ceil((Math.max(...mins) + 90) / SLOT) * SLOT;
  } else {
    startMins = 11 * 60;
    endMins = 23 * 60;
  }
  startMins = Math.max(0, startMins);
  endMins = Math.min(24 * 60, endMins);

  const slots: string[] = [];
  for (let m = startMins; m < endMins; m += SLOT) slots.push(fmtTime(m));

  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container overflow-hidden">
      <div className="px-4 py-2.5 border-b border-outline-variant/20 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold">{am.floor.title} · {am.reservations.calendarTitle}</span>
        <div className="ml-auto flex items-center gap-4 text-[11px] text-on-surface-variant">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-400/55" /> {am.floor.reserved}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-sky-400/55" /> {am.floor.seated}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-surface-container-high border border-outline-variant/30" /> {am.floor.free}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="p-3" style={{ minWidth: `${6 + slots.length * 2.75}rem` }}>
          {/* Time header */}
          <div className="flex items-center mb-1.5 pl-24">
            {slots.map((t, i) => (
              <div key={t} className="w-10 shrink-0 text-[9px] tabular-nums text-center text-on-surface-variant/60">
                {i % 2 === 0 ? t : ""}
              </div>
            ))}
          </div>

          {/* Table rows */}
          {activeTables.map(({ table, reservations }) => {
            const resMap = new Map(reservations.map((r) => [r.time, r]));
            return (
              <div key={table.id} className="flex items-center mb-1 group">
                <div className="w-24 shrink-0 text-xs font-medium truncate pr-2 text-on-surface-variant group-hover:text-on-surface transition-colors">
                  {table.label}
                </div>
                <div className="flex gap-0.5">
                  {slots.map((t) => {
                    const res = resMap.get(t);
                    const cls = res
                      ? (TIMELINE_STATUS[res.status] ?? "bg-primary/35 border border-primary/25")
                      : "bg-surface-container-high/60";
                    return (
                      <div
                        key={t}
                        className={`w-10 h-7 rounded-sm ${cls}`}
                        title={res ? `${t} · ${res.name} (${res.partySize}) · ${res.status}` : `${t} · free`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const FLOOR_STATE: Record<TableState, { dot: string; label: () => string }> = {
  free: { dot: "bg-emerald-400", label: () => am.floor.free },
  reserved: { dot: "bg-amber-400", label: () => am.floor.reserved },
  seated: { dot: "bg-sky-400", label: () => am.floor.seated },
  inactive: { dot: "bg-zinc-600", label: () => am.tables.inactive },
};

/** Color-coded floor view for the selected day. Collapsible. */
function FloorView({ date, refreshKey }: { date: string; refreshKey: number }) {
  const [open, setOpen] = useState(false);
  const [floor, setFloor] = useState<FloorEntry[]>([]);

  useEffect(() => {
    if (!open) return;
    adminJson<{ floor: FloorEntry[] }>(`/api/admin/tables?date=${date}`)
      .then((d) => setFloor(d.floor ?? []))
      .catch(() => setFloor([]));
  }, [date, open, refreshKey]);

  const counts = floor.reduce<Record<string, number>>((acc, f) => {
    acc[f.state] = (acc[f.state] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold"
      >
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          <path d="M6 8L1 3h10L6 8z" />
        </svg>
        {am.floor.title}
        <span className="ml-auto flex items-center gap-3 text-xs font-normal text-on-surface-variant">
          {(["free", "reserved", "seated"] as TableState[]).map((s) =>
            counts[s] ? (
              <span key={s} className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${FLOOR_STATE[s].dot}`} />
                {counts[s]} {FLOOR_STATE[s].label()}
              </span>
            ) : null,
          )}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {floor.length === 0 ? (
            <p className="col-span-full text-sm text-on-surface-variant py-4 text-center">{am.floor.none}</p>
          ) : (
            floor.map(({ table, state, reservations }) => (
              <div
                key={table.id}
                className="rounded-lg border border-outline-variant/30 bg-surface-container-high p-2.5 space-y-1"
                title={reservations.map((r) => `${r.time} · ${r.name} (${r.partySize})`).join("\n")}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{table.label}</span>
                  <span className={`w-2.5 h-2.5 rounded-full ${FLOOR_STATE[state].dot}`} />
                </div>
                <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">
                  {am.tables.seatsN(table.capacity)}
                </div>
                {reservations.length > 0 && (
                  <div className="text-[11px] text-on-surface-variant tabular-nums truncate">
                    {reservations.map((r) => r.time).join(", ")}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs capitalize border transition min-h-[32px] ${
        active
          ? "bg-primary/15 text-primary border-primary/40"
          : "border-outline-variant/30 text-on-surface-variant hover:text-on-surface"
      }`}
    >
      {children}
    </button>
  );
}

const field =
  "h-9 bg-surface-container-high border border-outline-variant/30 rounded-lg px-3 py-1.5 text-sm w-full focus:border-primary outline-none [color-scheme:dark]";

function NewReservationForm({
  date,
  offerings,
  seed,
  onCreated,
}: {
  date: string;
  offerings: OfferingServices[];
  seed: { offering?: string; service?: string; time?: string };
  onCreated: () => void;
}) {
  const initialOffering = seed.offering ?? offerings[0]?.id ?? "main";
  const initialServices = offerings.find((o) => o.id === initialOffering)?.services ?? [];
  const [form, setForm] = useState({
    date,
    time: seed.time ?? "19:00",
    offering: initialOffering,
    service: seed.service ?? initialServices[0]?.id ?? "dinner",
    partySize: 2,
    name: "",
    email: "",
    phone: "",
    occasion: "",
    notes: "",
  });
  const [day, setDay] = useState<DayAvailability | null>(null);
  const [customTime, setCustomTime] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));
  const multiOffering = offerings.length > 1;
  const services = offerings.find((o) => o.id === form.offering)?.services ?? [];

  // load the day's availability for the selected offering so staff can pick a
  // slot and see how full it is
  useEffect(() => {
    adminJson<DayAvailability>(`/api/availability?date=${form.date}&offering=${encodeURIComponent(form.offering)}`)
      .then(setDay)
      .catch(() => setDay(null));
  }, [form.date, form.offering]);

  const svcSlots = day?.services.find((s) => s.id === form.service)?.slots ?? [];

  // Keep the selected time valid for the current offering/service/date. Without
  // this, switching offering or service can leave a time that isn't a real slot
  // (the <select> would inject a synthetic option) and submit an invalid booking.
  useEffect(() => {
    if (customTime || svcSlots.length === 0) return;
    if (svcSlots.some((s) => s.time === form.time)) return;
    const next = svcSlots.find((s) => s.available)?.time ?? svcSlots[0].time;
    setForm((f) => ({ ...f, time: next }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, form.service, form.offering, customTime]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError(am.reservations.guestNameRequired);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await adminJson("/api/admin/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      toast(am.reservations.added);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : am.reservations.couldNotCreate);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="bg-surface-container border border-outline-variant/30 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
      {multiOffering && (
        <select
          value={form.offering}
          onChange={(e) => {
            const id = e.target.value;
            const svcs = offerings.find((o) => o.id === id)?.services ?? [];
            setForm((f) => ({ ...f, offering: id, service: svcs.some((s) => s.id === f.service) ? f.service : (svcs[0]?.id ?? f.service) }));
          }}
          className={`${field} col-span-2 sm:col-span-4`}
        >
          {offerings.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      )}
      <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className={field} />
      <select value={form.service} onChange={(e) => set("service", e.target.value)} className={field}>
        {services.length === 0 && <option value="dinner">{am.reservations.defaultService}</option>}
        {services.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      {!customTime && svcSlots.length > 0 ? (
        <select value={form.time} onChange={(e) => set("time", e.target.value)} className={field}>
          {!svcSlots.some((s) => s.time === form.time) && <option value={form.time}>{form.time}</option>}
          {svcSlots.map((s) => (
            <option key={s.time} value={s.time}>
              {s.time} · {s.remaining}/{s.capacity} left
            </option>
          ))}
        </select>
      ) : (
        <input type="time" value={form.time} onChange={(e) => set("time", e.target.value)} className={field} />
      )}
      <input type="number" min={1} value={form.partySize} onChange={(e) => set("partySize", Number(e.target.value))} placeholder={am.reservations.guests} className={field} />

      <label className="col-span-2 sm:col-span-4 flex items-center gap-2 text-xs text-on-surface-variant -mt-1">
        <input type="checkbox" checked={customTime} onChange={(e) => setCustomTime(e.target.checked)} />
        {am.reservations.customTime}
      </label>

      <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={am.reservations.guestNamePlaceholder} className={`${field} col-span-2`} />
      <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder={am.reservations.phone} className={field} />
      <input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder={am.reservations.email} className={field} />
      <input value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder={am.reservations.notesPlaceholder} className={`${field} col-span-2 sm:col-span-3`} />
      <button type="submit" disabled={busy} className="bg-primary text-on-primary rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-60">
        {busy ? am.row.saving : am.reservations.add}
      </button>
      {error && <p className="col-span-full text-sm text-rose-400">{error}</p>}
    </form>
  );
}
