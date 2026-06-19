"use client";

import { useCallback, useEffect, useState } from "react";
import { am } from "@/i18n/admin";
import { adminFetch, adminJson, toast } from "./api";
import type { OfferingServices } from "@/lib/reservations/offerings";
import type { RestaurantTable, WaitlistEntry } from "@/lib/reservations/types";

const field =
  "h-9 bg-surface-container-high border border-outline-variant/30 rounded-lg px-3 py-1.5 text-sm w-full focus:border-primary outline-none [color-scheme:dark]";

function nowTime(tz: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(new Date()).map((x) => [x.type, x.value]),
  );
  return `${String(Number(p.hour) % 24).padStart(2, "0")}:${p.minute}`;
}

export default function WaitlistPanel({
  date,
  offerings,
  tables,
  tz,
  refreshKey,
  onSeated,
}: {
  date: string;
  offerings: OfferingServices[];
  tables: RestaurantTable[];
  tz: string;
  refreshKey: number;
  onSeated: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [adding, setAdding] = useState(false);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const d = await adminJson<{ waitlist: WaitlistEntry[] }>(`/api/admin/waitlist?date=${date}&active=1`);
      setEntries(d.waitlist ?? []);
    } catch {
      setEntries([]);
    }
  }, [date]);

  useEffect(() => {
    if (open) load();
  }, [open, load, refreshKey]);

  // Live "waiting for N min" ticker.
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [open]);

  const refresh = () => { load(); };

  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container">
      <div className="w-full flex items-center gap-2 px-4 py-2.5">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-sm font-semibold">
          <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
            <path d="M6 8L1 3h10L6 8z" />
          </svg>
          {am.waitlist.title}
          {entries.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-400/20 text-amber-300 border border-amber-400/30">
              {am.waitlist.waitingN(entries.length)}
            </span>
          )}
        </button>
        <button
          onClick={() => { setOpen(true); setAdding((a) => !a); }}
          className="ml-auto text-xs text-primary hover:underline"
        >
          {adding ? am.waitlist.cancel : am.waitlist.add}
        </button>
      </div>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          {adding && (
            <AddForm
              date={date}
              offerings={offerings}
              onAdded={() => { setAdding(false); refresh(); }}
            />
          )}
          {entries.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-3 text-center">{am.waitlist.none}</p>
          ) : (
            entries.map((e) => (
              <WaitRow
                key={e.id}
                entry={e}
                offerings={offerings}
                tables={tables}
                tz={tz}
                tick={tick}
                onChanged={refresh}
                onSeated={() => { refresh(); onSeated(); }}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function elapsedMin(createdAt: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(createdAt)) / 60_000));
}

function WaitRow({
  entry,
  offerings,
  tables,
  tz,
  tick,
  onChanged,
  onSeated,
}: {
  entry: WaitlistEntry;
  offerings: OfferingServices[];
  tables: RestaurantTable[];
  tz: string;
  tick: number;
  onChanged: () => void;
  onSeated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [seating, setSeating] = useState(false);
  void tick; // re-render trigger for the live elapsed counter
  const waited = elapsedMin(entry.createdAt);
  const offeringLabel = offerings.find((o) => o.id === entry.offering)?.label;
  const multiOffering = offerings.length > 1;

  async function patch(body: Record<string, unknown>, okMsg?: string) {
    setBusy(true);
    try {
      const res = await adminFetch(`/api/admin/waitlist/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      if (okMsg) toast(okMsg);
      onChanged();
    } catch {
      toast(am.waitlist.couldNotSave, "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(am.waitlist.removeConfirm(entry.name))) return;
    setBusy(true);
    try {
      const res = await adminFetch(`/api/admin/waitlist/${entry.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      onChanged();
    } catch {
      toast(am.waitlist.couldNotSave, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-outline-variant/30 bg-surface-container-high p-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold">{entry.name}</span>
        <span className="text-on-surface-variant text-sm">· {entry.partySize} {am.row.guests}</span>
        <span
          className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
            entry.status === "notified"
              ? "bg-sky-400/15 text-sky-300 border-sky-400/30"
              : "bg-amber-400/15 text-amber-300 border-amber-400/30"
          }`}
        >
          {entry.status === "notified" ? am.waitlist.statusNotified : am.waitlist.statusWaiting}
        </span>
        {multiOffering && offeringLabel && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary border border-primary/30 uppercase tracking-widest">
            {offeringLabel}
          </span>
        )}
        {entry.pagerLabel && (
          <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">⧉ {entry.pagerLabel}</span>
        )}
        <span className="ml-auto text-sm tabular-nums text-on-surface-variant" title={am.waitlist.quoted}>
          {am.waitlist.waitingFor(waited)}
          {entry.quotedWaitMin != null && (
            <span className="text-on-surface-variant/50"> / {am.waitlist.quotedMin(entry.quotedWaitMin)}</span>
          )}
        </span>
      </div>

      {(entry.phone || entry.notes) && (
        <div className="flex flex-wrap gap-x-4 text-sm text-on-surface-variant mt-1">
          {entry.phone && <span>☎ {entry.phone}</span>}
          {entry.notes && <span className="italic">&quot;{entry.notes}&quot;</span>}
        </div>
      )}

      {seating ? (
        <SeatForm
          entry={entry}
          offerings={offerings}
          tables={tables}
          tz={tz}
          onCancel={() => setSeating(false)}
          onSeated={() => { setSeating(false); onSeated(); }}
        />
      ) : (
        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={() => setSeating(true)}
            disabled={busy}
            className="text-xs px-2.5 py-1.5 rounded-lg border bg-emerald-400/15 text-emerald-300 border-emerald-400/30 hover:brightness-125 disabled:opacity-50"
          >
            {am.waitlist.seat}
          </button>
          {entry.status !== "notified" && (
            <button onClick={() => patch({ status: "notified" }, am.waitlist.notified)} disabled={busy} className="text-xs text-sky-400 hover:text-sky-300 disabled:opacity-50">
              {am.waitlist.notify}
            </button>
          )}
          <button onClick={() => patch({ status: "left" }, am.waitlist.markedLeft)} disabled={busy} className="text-xs text-on-surface-variant hover:text-on-surface disabled:opacity-50">
            {am.waitlist.left}
          </button>
          <button onClick={remove} disabled={busy} className="text-xs text-rose-400 hover:text-rose-300 disabled:opacity-50 ml-auto">
            {am.waitlist.remove}
          </button>
        </div>
      )}
    </div>
  );
}

function SeatForm({
  entry,
  offerings,
  tables,
  tz,
  onCancel,
  onSeated,
}: {
  entry: WaitlistEntry;
  offerings: OfferingServices[];
  tables: RestaurantTable[];
  tz: string;
  onCancel: () => void;
  onSeated: () => void;
}) {
  const services = offerings.find((o) => o.id === entry.offering)?.services ?? [];
  const seatable = tables.filter((t) => t.active && (t.offering == null || t.offering === entry.offering));
  const [time, setTime] = useState(() => nowTime(tz));
  const [service, setService] = useState(services[0]?.id ?? "dinner");
  const [tableId, setTableId] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      const res = await adminFetch(`/api/admin/waitlist/${entry.id}/seat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ time, service, tableId: tableId || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d as { error?: string }).error || am.waitlist.couldNotSave);
      toast(d.tableWarning ? am.waitlist.seatedNoTable : tableId ? am.waitlist.seatedWithTable : am.waitlist.seated);
      onSeated();
    } catch (err) {
      toast(err instanceof Error ? err.message : am.waitlist.couldNotSave, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
      <label className="space-y-1">
        <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">{am.waitlist.time}</span>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
      </label>
      <label className="space-y-1">
        <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">{am.waitlist.service}</span>
        <select value={service} onChange={(e) => setService(e.target.value)} className={field}>
          {services.length === 0 && <option value="dinner">Dinner</option>}
          {services.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </label>
      <label className="col-span-2 space-y-1">
        <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">{am.waitlist.table}</span>
        <select value={tableId} onChange={(e) => setTableId(e.target.value)} className={field} disabled={seatable.length === 0}>
          <option value="">{am.waitlist.noTable}</option>
          {seatable.map((t) => <option key={t.id} value={t.id}>{t.label} · {am.row.tableSeats(t.capacity)}</option>)}
        </select>
      </label>
      <div className="col-span-2 sm:col-span-4 flex gap-2">
        <button onClick={confirm} disabled={busy} className="bg-primary text-on-primary px-4 py-1.5 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-60">
          {busy ? am.waitlist.seating : am.waitlist.confirm}
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 rounded-lg text-sm border border-outline-variant/40 text-on-surface-variant hover:text-on-surface">
          {am.waitlist.cancel}
        </button>
      </div>
    </div>
  );
}

function AddForm({
  date,
  offerings,
  onAdded,
}: {
  date: string;
  offerings: OfferingServices[];
  onAdded: () => void;
}) {
  const multiOffering = offerings.length > 1;
  const [f, setF] = useState({
    name: "",
    partySize: 2,
    phone: "",
    offering: offerings[0]?.id ?? "main",
    pagerLabel: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string | number) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) { toast(am.waitlist.nameRequired, "error"); return; }
    setBusy(true);
    try {
      await adminJson("/api/admin/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          name: f.name.trim(),
          partySize: f.partySize,
          phone: f.phone.trim() || undefined,
          offering: f.offering,
          pagerLabel: f.pagerLabel.trim() || undefined,
          notes: f.notes.trim() || undefined,
        }),
      });
      toast(am.waitlist.added);
      onAdded();
    } catch {
      toast(am.waitlist.couldNotSave, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="bg-surface-container border border-primary/30 rounded-lg p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
      <input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={am.waitlist.name} className={`${field} col-span-2`} autoFocus />
      <input type="number" min={1} value={f.partySize} onChange={(e) => set("partySize", Number(e.target.value))} placeholder={am.waitlist.partySize} className={field} />
      <input value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder={am.waitlist.phone} className={field} />
      {multiOffering && (
        <select value={f.offering} onChange={(e) => set("offering", e.target.value)} className={`${field} col-span-2`}>
          {offerings.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      )}
      <input value={f.pagerLabel} onChange={(e) => set("pagerLabel", e.target.value)} placeholder={am.waitlist.pager} className={field} />
      <input value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder={am.waitlist.notes} className={`${field} ${multiOffering ? "col-span-1" : "col-span-2"}`} />
      <button type="submit" disabled={busy} className="bg-primary text-on-primary rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-60 h-9 col-span-2 sm:col-span-1">
        {busy ? am.waitlist.adding : am.waitlist.addBtn}
      </button>
    </form>
  );
}
