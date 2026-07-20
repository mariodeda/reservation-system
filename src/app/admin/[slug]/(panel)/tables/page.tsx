"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { am } from "@/i18n";
import { adminJson, toast } from "@/components/admin/api";
import type { AvailabilityConfig, RestaurantTable } from "@/lib/reservations/types";
import { offeringServiceMap, type OfferingServices } from "@/lib/reservations/offerings";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const field =
  "h-9 bg-surface-container-high border border-outline-variant/30 rounded-lg px-3 py-1.5 text-sm w-full focus:border-primary outline-none [color-scheme:dark]";

export default function TablesPage() {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [offerings, setOfferings] = useState<OfferingServices[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const multiOffering = offerings.length > 1;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminJson<{ tables: RestaurantTable[] }>("/api/admin/tables");
      setTables(data.tables ?? []);
    } catch {
      toast(am.tables.couldNotLoad, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    adminJson<{ config: AvailabilityConfig }>("/api/admin/config")
      .then((d) => setOfferings(offeringServiceMap(d.config)))
      .catch(() => {});
  }, [load]);

  // Group active + inactive, sorted by zone then sortOrder.
  const byZone = useMemo(() => {
    const groups = new Map<string, RestaurantTable[]>();
    for (const t of tables) {
      const key = t.zone || "";
      const list = groups.get(key) ?? [];
      list.push(t);
      groups.set(key, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [tables]);

  const activeCount = tables.filter((t) => t.active).length;
  const totalSeats = tables.filter((t) => t.active).reduce((s, t) => s + t.capacity, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{am.tables.title}</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">{am.tables.subtitle}</p>
        </div>
        <button
          onClick={() => setAdding((a) => !a)}
          className="bg-primary text-on-primary px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110"
        >
          {adding ? am.tables.cancel : am.tables.add}
        </button>
      </div>

      {tables.length > 0 && (
        <p className="text-sm text-on-surface-variant">
          {am.tables.tablesN(activeCount)} · {am.tables.seatsN(totalSeats)}
        </p>
      )}

      {adding && (
        <TableForm
          offerings={offerings}
          multiOffering={multiOffering}
          onSaved={() => { setAdding(false); load(); }}
          onCancel={() => setAdding(false)}
        />
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : tables.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant border border-dashed border-outline-variant/40 rounded-xl">
          {am.tables.none}
        </div>
      ) : (
        <div className="space-y-5">
          {byZone.map(([zone, list]) => (
            <div key={zone} className="space-y-2">
              {zone && (
                <h2 className="text-xs uppercase tracking-widest text-on-surface-variant">{zone}</h2>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {list.map((t) => (
                  <TableCard
                    key={t.id}
                    table={t}
                    offerings={offerings}
                    multiOffering={multiOffering}
                    onChanged={load}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TableCard({
  table,
  offerings,
  multiOffering,
  onChanged,
}: {
  table: RestaurantTable;
  offerings: OfferingServices[];
  multiOffering: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const offeringLabel = offerings.find((o) => o.id === table.offering)?.label;

  async function deactivate() {
    setBusy(true);
    try {
      await adminJson(`/api/admin/tables/${table.id}`, { method: "DELETE" });
      toast(am.tables.deactivated);
      setDeactivateOpen(false);
      onChanged();
    } catch {
      toast(am.tables.couldNotSave, "error");
    } finally {
      setBusy(false);
    }
  }

  async function reactivate() {
    setBusy(true);
    try {
      await adminJson(`/api/admin/tables/${table.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      });
      toast(am.tables.updated);
      onChanged();
    } catch {
      toast(am.tables.couldNotSave, "error");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <TableForm
        table={table}
        offerings={offerings}
        multiOffering={multiOffering}
        onSaved={() => { setEditing(false); onChanged(); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  // Short visual identifier for the avatar chip
  const abbrev = (() => {
    if (table.label.length <= 4) return table.label;
    const parts = table.label.trim().split(/\s+/);
    if (parts.length > 1) {
      const num = parts.find((p) => /^\d+$/.test(p));
      return num ? `${parts[0][0].toUpperCase()}${num}` : `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return table.label.substring(0, 3).toUpperCase();
  })();

  return (
    <>
    <div className={`flex flex-wrap items-center gap-3 rounded-xl border border-outline-variant/30 bg-surface-container p-3 ${table.active ? "" : "opacity-50"}`}>
      {/* Avatar chip — short abbreviation, never overflows */}
      <div className="w-10 h-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center font-bold shrink-0 text-xs text-center leading-tight overflow-hidden">
        {abbrev}
      </div>
      <div className="flex-1 min-w-0">
        {/* Full label — single line, truncated on overflow */}
        <span className="font-semibold text-sm block truncate">{table.label}</span>
        {/* Secondary meta — no wrap, shrink-proof */}
        <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden">
          <span className="text-xs text-on-surface-variant whitespace-nowrap">{am.tables.seatsN(table.capacity)}</span>
          {table.minParty > 1 && (
            <span className="text-[10px] text-on-surface-variant whitespace-nowrap">· {am.tables.minParty} {table.minParty}</span>
          )}
          {table.joinable && (
            <span className="text-[10px] uppercase tracking-widest text-sky-300 whitespace-nowrap">{am.tables.joinable}</span>
          )}
          {multiOffering && offeringLabel && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary border border-primary/30 uppercase tracking-widest whitespace-nowrap shrink-0">
              {offeringLabel}
            </span>
          )}
          {!table.active && (
            <span className="text-[10px] uppercase tracking-widest text-on-surface-variant/60 whitespace-nowrap">{am.tables.inactive}</span>
          )}
        </div>
      </div>
      <div className="flex w-full items-center justify-end gap-3 shrink-0 sm:w-auto">
        <button onClick={() => setEditing(true)} className="text-primary hover:underline text-xs whitespace-nowrap">
          {am.tables.edit}
        </button>
        {table.active ? (
          <button onClick={() => setDeactivateOpen(true)} disabled={busy} className="text-rose-400 hover:text-rose-300 text-xs disabled:opacity-50 whitespace-nowrap">
            {am.tables.deactivate}
          </button>
        ) : (
          <button onClick={reactivate} disabled={busy} className="text-emerald-400 hover:text-emerald-300 text-xs disabled:opacity-50 whitespace-nowrap">
            {am.tables.active}
          </button>
        )}
      </div>
    </div>
    <ConfirmDialog
      open={deactivateOpen}
      title={am.tables.deactivateDialogTitle}
      body={am.tables.deactivateConfirm(table.label)}
      warning={am.tables.deactivateDialogWarning}
      confirmLabel={am.tables.deactivate}
      cancelLabel={am.tables.cancel}
      busyLabel={am.tables.saving}
      destructive
      busy={busy}
      onCancel={() => setDeactivateOpen(false)}
      onConfirm={deactivate}
    />
    </>
  );
}

function TableForm({
  table,
  offerings,
  multiOffering,
  onSaved,
  onCancel,
}: {
  table?: RestaurantTable;
  offerings: OfferingServices[];
  multiOffering: boolean;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState({
    label: table?.label ?? "",
    capacity: table?.capacity ?? 2,
    minParty: table?.minParty ?? 1,
    zone: table?.zone ?? "",
    offering: table?.offering ?? "",
    joinable: table?.joinable ?? false,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string | number | boolean) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    if (!f.label.trim()) { toast(am.tables.labelRequired, "error"); return; }
    setBusy(true);
    try {
      const body = {
        label: f.label.trim(),
        capacity: f.capacity,
        minParty: f.minParty,
        zone: f.zone.trim() || undefined,
        offering: f.offering || null,
        joinable: f.joinable,
      };
      if (table) {
        await adminJson(`/api/admin/tables/${table.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast(am.tables.updated);
      } else {
        await adminJson("/api/admin/tables", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast(am.tables.created);
      }
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : am.tables.couldNotSave, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-surface-container border border-primary/30 rounded-xl p-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-4">
      <label className="col-span-2 sm:col-span-1 space-y-1">
        <span className="text-xs text-on-surface-variant">{am.tables.label}</span>
        <input value={f.label} onChange={(e) => set("label", e.target.value)} placeholder={am.tables.labelPlaceholder} maxLength={50} className={field} autoFocus />
      </label>
      <label className="space-y-1">
        <span className="text-xs text-on-surface-variant">{am.tables.capacity}</span>
        <input type="number" min={1} value={f.capacity} onChange={(e) => set("capacity", Number(e.target.value))} className={field} />
      </label>
      <label className="space-y-1">
        <span className="text-xs text-on-surface-variant">{am.tables.minParty}</span>
        <input type="number" min={1} value={f.minParty} onChange={(e) => set("minParty", Number(e.target.value))} className={field} />
      </label>
      <label className="col-span-2 sm:col-span-1 space-y-1">
        <span className="text-xs text-on-surface-variant">{am.tables.zone}</span>
        <input value={f.zone} onChange={(e) => set("zone", e.target.value)} placeholder={am.tables.zonePlaceholder} maxLength={60} className={field} />
      </label>
      {multiOffering && (
        <label className="col-span-2 space-y-1">
          <span className="text-xs text-on-surface-variant">{am.tables.offering}</span>
          <select value={f.offering} onChange={(e) => set("offering", e.target.value)} className={field}>
            <option value="">{am.tables.anyOffering}</option>
            {offerings.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
      )}
      <label className="col-span-2 flex items-center gap-2 text-sm text-on-surface-variant">
        <input type="checkbox" checked={f.joinable} onChange={(e) => set("joinable", e.target.checked)} />
        {am.tables.joinable} <span className="text-xs text-on-surface-variant/60">— {am.tables.joinableHint}</span>
      </label>
      <div className="col-span-2 sm:col-span-4 flex gap-2">
        <button onClick={save} disabled={busy} className="bg-primary text-on-primary px-4 py-1.5 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-60">
          {busy ? (table ? am.tables.saving : am.tables.creating) : (table ? am.tables.save : am.tables.create)}
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 rounded-lg text-sm border border-outline-variant/40 text-on-surface-variant hover:text-on-surface">
          {am.tables.cancel}
        </button>
      </div>
    </div>
  );
}
