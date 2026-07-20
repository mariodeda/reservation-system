"use client";

import { useCallback, useEffect, useState } from "react";
import { am } from "@/i18n";
import { adminFetch, adminJson, toast } from "./api";
import type { OfferingServices } from "@/lib/reservations/offerings";
import type { RestaurantTable, WaitlistEntry } from "@/lib/reservations/types";
import Tooltip from "@/components/ui/Tooltip";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

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
      <div className="w-full flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5">
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
        <div className="px-3 pb-3 space-y-2 sm:px-4 sm:pb-4">
          <div className="rounded-lg border border-outline-variant/30 bg-surface-container-high/50 p-3 text-xs text-on-surface-variant">
            <p className="font-medium text-on-surface">{am.waitlist.subtitle}</p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
              <span><strong className="text-on-surface">{am.waitlist.flowTitle}:</strong> {am.waitlist.flowAdd}</span>
              <span>{am.waitlist.flowNotify}</span>
              <span>{am.waitlist.flowSeat}</span>
            </div>
          </div>
          {adding && (
            <AddForm
              date={date}
              offerings={offerings}
              onAdded={() => { setAdding(false); refresh(); }}
            />
          )}
          {entries.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-1 text-center sm:py-3">{am.waitlist.none}</p>
          ) : (
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
                {am.waitlist.activeQueue}
              </div>
              {entries.map((e) => (
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
              ))}
            </div>
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
  const [removeOpen, setRemoveOpen] = useState(false);
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
    setBusy(true);
    try {
      const res = await adminFetch(`/api/admin/waitlist/${entry.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setRemoveOpen(false);
      onChanged();
    } catch {
      toast(am.waitlist.couldNotSave, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
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
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-on-surface-variant">
            <PagerIcon className="h-3 w-3" />
            {entry.pagerLabel}
          </span>
        )}
        <Tooltip content={am.waitlist.quoted} className="ml-auto">
          <span className="text-sm tabular-nums text-on-surface-variant">
            {am.waitlist.waitingFor(waited)}
            {entry.quotedWaitMin != null && (
              <span className="text-on-surface-variant/50"> / {am.waitlist.quotedMin(entry.quotedWaitMin)}</span>
            )}
          </span>
        </Tooltip>
      </div>

      {(entry.phone || entry.notes) && (
        <div className="flex flex-wrap gap-x-4 text-sm text-on-surface-variant mt-1">
          {entry.phone && (
            <span className="inline-flex items-center gap-1.5">
              <PhoneIcon className="h-3.5 w-3.5" />
              {entry.phone}
            </span>
          )}
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
            title={am.waitlist.seatHint}
          >
            {am.waitlist.seat}
          </button>
          {entry.status !== "notified" && (
            <button onClick={() => patch({ status: "notified" }, am.waitlist.notified)} disabled={busy} title={am.waitlist.notifyHint} className="text-xs text-sky-400 hover:text-sky-300 disabled:opacity-50">
              {am.waitlist.notify}
            </button>
          )}
          <button onClick={() => patch({ status: "left" }, am.waitlist.markedLeft)} disabled={busy} title={am.waitlist.leftHint} className="text-xs text-on-surface-variant hover:text-on-surface disabled:opacity-50">
            {am.waitlist.left}
          </button>
          <button onClick={() => setRemoveOpen(true)} disabled={busy} className="text-xs text-rose-400 hover:text-rose-300 disabled:opacity-50 ml-auto">
            {am.waitlist.remove}
          </button>
        </div>
      )}
    </div>
    <ConfirmDialog
      open={removeOpen}
      title={am.waitlist.removeDialogTitle}
      body={am.waitlist.removeConfirm(entry.name)}
      warning={am.waitlist.removeDialogWarning}
      confirmLabel={am.waitlist.remove}
      cancelLabel={am.waitlist.cancel}
      busyLabel={am.row.saving}
      destructive
      busy={busy}
      onCancel={() => setRemoveOpen(false)}
      onConfirm={remove}
    />
    </>
  );
}

function PagerIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="5" width="16" height="11" rx="2" />
      <path d="M8 19h8" />
      <path d="M9 9h6" />
      <path d="M9 12h3" />
    </svg>
  );
}

function PhoneIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v2a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 3.2 2 2 0 0 1 4.11 1h2a2 2 0 0 1 2 1.72c.12.91.33 1.8.62 2.65a2 2 0 0 1-.45 2.11L7.4 8.36a16 16 0 0 0 6 6l.88-.88a2 2 0 0 1 2.11-.45c.85.29 1.74.5 2.65.62A2 2 0 0 1 22 16.92z" />
    </svg>
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

  async function seatParty() {
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
    <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-2">
      <div className="col-span-2 sm:col-span-4 text-xs font-semibold uppercase tracking-widest text-emerald-300">
        {am.waitlist.seatFormTitle}
      </div>
      <label className="space-y-1">
        <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">{am.waitlist.time}</span>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
      </label>
      <label className="space-y-1">
        <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">{am.waitlist.service}</span>
        <select value={service} onChange={(e) => setService(e.target.value)} className={field}>
          {services.length === 0 && <option value="dinner">{am.reservations.defaultService}</option>}
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
        <button onClick={seatParty} disabled={busy} className="bg-primary text-on-primary px-4 py-1.5 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-60">
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
