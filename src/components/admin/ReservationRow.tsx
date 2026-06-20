"use client";

import { useRef, useState } from "react";
import type { ReservationStatus, RestaurantTable } from "@/lib/reservations/types";
import { RESERVATION_STATUSES } from "@/lib/reservations/types";
import type { OfferingServices } from "@/lib/reservations/offerings";
import {
  type AdminReservation,
  formatDateLong,
  QUICK_ACTIONS,
  STATUS_META,
  StatusBadge,
} from "./shared";
import { am } from "@/i18n";
import { adminFetch, adminJson, toast } from "./api";

const field =
  "bg-surface-container-high border border-outline-variant/30 rounded-lg px-2 py-1.5 text-sm w-full focus:border-primary outline-none";

export default function ReservationRow({
  r,
  onChanged,
  offerings = [],
  tables = [],
  showDate = false,
}: {
  r: AdminReservation;
  onChanged: () => void;
  offerings?: OfferingServices[];
  tables?: RestaurantTable[];
  showDate?: boolean;
}) {
  const multiOffering = offerings.length > 1;
  const offeringLabel = offerings.find((o) => o.id === (r.offering || "main"))?.label;
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(!!r.feedbackSentAt);
  const [feedbackBusy, setFeedbackBusy] = useState(false);

  async function setStatus(status: ReservationStatus) {
    setBusy(true);
    try {
      const res = await adminFetch(`/api/admin/reservations/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      toast(am.row.markedAs(STATUS_META[status].label.toLowerCase()));
      onChanged();
    } catch {
      toast(am.row.updateError, "error");
    } finally {
      setBusy(false);
    }
  }

  async function requestFeedback() {
    setFeedbackBusy(true);
    try {
      const res = await adminFetch(`/api/admin/reservations/${r.id}/feedback`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Failed");
      setFeedbackSent(true);
      toast(am.feedback.sent);
    } catch (err) {
      toast(err instanceof Error ? err.message : am.feedback.sendError, "error");
    } finally {
      setFeedbackBusy(false);
    }
  }

  async function remove() {
    if (!confirm(am.row.deleteConfirm(r.name))) return;
    setBusy(true);
    try {
      const res = await adminFetch(`/api/admin/reservations/${r.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast(am.row.deleted);
      onChanged();
    } catch {
      toast(am.row.deleteError, "error");
    } finally {
      setBusy(false);
    }
  }

  const dimmed = r.status === "cancelled" || r.status === "no_show";

  return (
    <div className={`rounded-xl border border-outline-variant/30 bg-surface-container p-3 sm:p-4 ${dimmed ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        {/* Time / service col */}
        <div className={`text-center shrink-0 ${showDate ? "w-20" : "w-14"}`}>
          {showDate && (
            <div className="text-[10px] font-medium text-on-surface-variant">
              {formatDateLong(r.date).replace(/, \d{4}$/, "")}
            </div>
          )}
          <div className="text-lg font-semibold text-primary tabular-nums">{r.time}</div>
          <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">{r.service}</div>
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Name row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold truncate max-w-[180px] sm:max-w-[260px]">{r.name}</span>
            {r.customerVip && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 uppercase tracking-widest">
                ★ {am.customers.vip}
              </span>
            )}
            <span className="text-on-surface-variant text-sm">· {r.partySize} {am.row.guests}</span>
            {multiOffering && offeringLabel && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary border border-primary/30 uppercase tracking-widest">
                {offeringLabel}
              </span>
            )}
            <StatusBadge status={r.status} />
            {r.source === "admin" && (
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant/60">{am.row.manual}</span>
            )}
            {typeof r.visitCount === "number" && r.visitCount > 1 && (
              <span className="text-[10px] font-semibold text-sky-300 uppercase tracking-widest">
                {am.customers.nthVisit(r.visitCount)}
              </span>
            )}
          </div>

          {/* Table assignment — full-width, always visible */}
          {!editing && (
            <TableAssign
              reservationId={r.id}
              value={r.tableLabel}
              tableId={r.tableId}
              tables={tables}
              offering={r.offering || "main"}
              onChanged={onChanged}
            />
          )}

          {/* Details — expanded by default, horizontal layout */}
          {!editing && (
            <>
              {open && (
                <div className="flex flex-wrap items-baseline gap-x-5 gap-y-0.5 text-sm text-on-surface-variant pt-0.5">
                  {r.email && <span>✉ {r.email}</span>}
                  {r.phone && <span>☎ {r.phone}</span>}
                  {r.occasion && <span>🎉 {r.occasion}</span>}
                  {r.notes && <span className="italic">"{r.notes}"</span>}
                  {r.dietaryNotes && (
                    <span className="text-amber-300 font-medium" title={am.customers.dietaryAlert}>
                      ⚠ {r.dietaryNotes}
                    </span>
                  )}
                  <span className="ml-auto flex gap-3 flex-wrap items-center">
                    {r.status === "completed" && r.email && (
                      feedbackSent ? (
                        <span className="text-[10px] text-emerald-400">{am.feedback.sent}</span>
                      ) : (
                        <button
                          onClick={requestFeedback}
                          disabled={feedbackBusy}
                          className="text-xs text-sky-400 hover:text-sky-300 disabled:opacity-50"
                        >
                          {feedbackBusy ? am.feedback.sending : am.feedback.send}
                        </button>
                      )
                    )}
                    <button
                      onClick={() => setEditing(true)}
                      className="text-primary hover:underline text-xs"
                    >
                      {am.row.edit}
                    </button>
                    <button onClick={remove} className="text-rose-400 hover:text-rose-300 text-xs">
                      {am.row.delete}
                    </button>
                  </span>
                </div>
              )}
              <button
                onClick={() => setOpen((o) => !o)}
                className="flex items-center gap-1 text-[11px] text-on-surface-variant/60 hover:text-on-surface-variant transition-colors"
              >
                <svg
                  className={`w-3 h-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
                  viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"
                >
                  <path d="M6 8L1 3h10L6 8z" />
                </svg>
                {open ? am.row.collapse : am.row.expand} · #{r.reference}
              </button>
            </>
          )}

          {editing && (
            <EditForm
              r={r}
              offerings={offerings}
              onCancel={() => setEditing(false)}
              onSaved={() => { setEditing(false); onChanged(); }}
            />
          )}
        </div>

        {/* Quick status actions — equal width + icons */}
        {!editing && (
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {QUICK_ACTIONS[r.status].map((s) => (
              <button
                key={s}
                disabled={busy}
                onClick={() => setStatus(s)}
                className={`text-xs px-2.5 py-1.5 rounded-lg border transition disabled:opacity-50 min-w-[5.5rem] flex items-center justify-center gap-1.5 ${STATUS_META[s].badge} hover:brightness-125`}
              >
                <ActionIcon from={r.status} to={s} />
                {actionLabel(r.status, s)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Full-width table assignment row. When the venue has managed tables, this is a
 * conflict-aware picker (assign by tableId; the server rejects double-bookings).
 * With no managed tables it falls back to the legacy free-text label editor.
 */
function TableAssign({
  reservationId,
  value,
  tableId,
  tables = [],
  offering = "main",
  onChanged,
}: {
  reservationId: string;
  value?: string;
  tableId?: string;
  tables?: RestaurantTable[];
  offering?: string;
  onChanged: () => void;
}) {
  const applicable = tables.filter(
    (t) => t.active && (t.offering == null || t.offering === offering),
  );
  if (applicable.length > 0) {
    return (
      <ManagedTableAssign
        reservationId={reservationId}
        tableId={tableId}
        tables={applicable}
        onChanged={onChanged}
      />
    );
  }
  return <FreeTextTableAssign reservationId={reservationId} value={value} onChanged={onChanged} />;
}

/** Conflict-aware managed-table picker (assigns by tableId). */
function ManagedTableAssign({
  reservationId,
  tableId,
  tables,
  onChanged,
}: {
  reservationId: string;
  tableId?: string;
  tables: RestaurantTable[];
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);

  async function assign(next: string | null) {
    setSaving(true);
    try {
      const res = await adminFetch(`/api/admin/reservations/${reservationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d as { error?: string }).error || am.row.tableConflict);
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : am.row.tableError, "error");
    } finally {
      setSaving(false);
    }
  }

  async function suggest() {
    setSaving(true);
    try {
      const d = await adminJson<{ table: RestaurantTable | null }>(
        `/api/admin/reservations/${reservationId}/table`,
      );
      if (!d.table) { toast(am.row.tableSuggestNone); return; }
      await assign(d.table.id);
    } catch {
      toast(am.row.tableError, "error");
    } finally {
      setSaving(false);
    }
  }

  const assigned = tableId && tables.some((t) => t.id === tableId);

  return (
    <div className={`flex items-center gap-0 w-full rounded-lg border h-9 overflow-hidden ${assigned ? "border-primary/50 bg-primary/10" : "border-dashed border-outline-variant/50"}`}>
      <span className={`flex items-center gap-1.5 pl-3 pr-2.5 h-full text-xs font-semibold uppercase tracking-widest border-r shrink-0 ${assigned ? "text-primary border-primary/30" : "text-on-surface-variant/60 border-outline-variant/30"}`}>
        <TableIcon />
        {am.row.table}
      </span>
      <select
        value={tableId ?? ""}
        disabled={saving}
        onChange={(e) => assign(e.target.value || null)}
        className="flex-1 h-full bg-transparent px-2.5 text-sm text-on-surface outline-none disabled:opacity-60 [color-scheme:dark] min-w-0"
      >
        <option value="">{am.row.tableUnassigned}</option>
        {tables.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label} · {am.row.tableSeats(t.capacity)}
          </option>
        ))}
      </select>
      {!assigned && (
        <button
          onClick={suggest}
          disabled={saving}
          title={am.row.tableSuggest}
          className="px-3 h-full flex items-center text-xs font-semibold text-primary hover:bg-primary/10 border-l border-outline-variant/30 transition-colors disabled:opacity-50 shrink-0"
        >
          {saving ? (
            <span className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          ) : (
            am.row.tableSuggest
          )}
        </button>
      )}
    </div>
  );
}

/** Legacy free-text table label editor (venues without managed tables). */
function FreeTextTableAssign({
  reservationId,
  value,
  onChanged,
}: {
  reservationId: string;
  value?: string;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(value ?? "");
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function commit() {
    const next = draft.trim();
    if (next === (value ?? "")) { setEditing(false); return; }
    setSaving(true);
    try {
      const res = await adminFetch(`/api/admin/reservations/${reservationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableLabel: next || null }),
      });
      if (!res.ok) throw new Error();
      onChanged();
    } catch {
      toast(am.row.tableError, "error");
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    if (e.key === "Escape") { setEditing(false); }
  }

  // --- Edit mode ---
  if (editing) {
    return (
      <div className="flex items-center gap-0 rounded-lg border border-primary bg-primary/10 overflow-hidden h-9">
        <span className="flex items-center gap-1.5 pl-3 pr-2 text-xs font-semibold text-primary uppercase tracking-widest shrink-0 border-r border-primary/30">
          <TableIcon />
          {am.row.table}
        </span>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          placeholder={am.row.tablePlaceholder}
          maxLength={50}
          className="flex-1 bg-transparent px-2.5 text-sm text-on-surface outline-none placeholder:text-on-surface-variant/40 min-w-0"
        />
        {saving ? (
          <span className="w-9 flex items-center justify-center text-primary/60">
            <span className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </span>
        ) : (
          <button
            onMouseDown={(e) => { e.preventDefault(); commit(); }}
            className="w-9 h-full flex items-center justify-center text-primary hover:bg-primary/20 transition-colors text-sm font-bold"
            title={am.row.save}
          >
            ✓
          </button>
        )}
      </div>
    );
  }

  // --- Assigned ---
  if (value) {
    return (
      <div className="group flex items-center gap-0 w-full rounded-lg border border-primary/50 bg-primary/10 hover:border-primary transition-colors h-9 overflow-hidden">
        <button
          onClick={startEdit}
          title={am.row.tableReassign}
          className="flex items-center gap-0 flex-1 h-full hover:bg-primary/10 transition-colors min-w-0"
        >
          <span className="flex items-center gap-1.5 pl-3 pr-2.5 h-full text-xs font-semibold text-primary uppercase tracking-widest border-r border-primary/30 shrink-0">
            <TableIcon />
            {am.row.table}
          </span>
          <span className="flex-1 px-2.5 text-sm font-semibold text-on-surface text-left truncate">{value}</span>
          <span className="w-8 h-full flex items-center justify-center text-on-surface-variant/40 group-hover:text-primary/70 transition-colors text-xs shrink-0">
            ✎
          </span>
        </button>
        <button
          onClick={async () => {
            setSaving(true);
            try {
              const res = await adminFetch(`/api/admin/reservations/${reservationId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tableLabel: null }),
              });
              if (!res.ok) throw new Error();
              onChanged();
            } catch {
              toast(am.row.tableError, "error");
            } finally {
              setSaving(false);
            }
          }}
          title={am.row.tableClear}
          disabled={saving}
          className="w-8 h-full flex items-center justify-center text-on-surface-variant/40 hover:text-rose-400 border-l border-primary/20 transition-colors shrink-0 disabled:opacity-50"
        >
          {saving ? (
            <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          ) : (
            "×"
          )}
        </button>
      </div>
    );
  }

  // --- Unassigned ---
  return (
    <button
      onClick={startEdit}
      title={am.row.assignTable}
      className="group flex items-center gap-0 w-full rounded-lg border border-dashed border-outline-variant/50 hover:border-primary/60 hover:bg-primary/5 transition-colors h-9 overflow-hidden"
    >
      <span className="flex items-center gap-1.5 pl-3 pr-2.5 h-full text-xs font-medium text-on-surface-variant/60 uppercase tracking-widest border-r border-outline-variant/30 group-hover:text-primary/60 group-hover:border-primary/20 transition-colors shrink-0">
        <TableIcon />
        {am.row.table}
      </span>
      <span className="flex-1 px-2.5 text-sm text-on-surface-variant/40 group-hover:text-primary/60 transition-colors text-left">
        {am.row.assignTable}
      </span>
      <span className="w-9 h-full flex items-center justify-center text-on-surface-variant/30 group-hover:text-primary/50 transition-colors text-base leading-none">
        +
      </span>
    </button>
  );
}

function EditForm({
  r,
  offerings,
  onCancel,
  onSaved,
}: {
  r: AdminReservation;
  offerings: OfferingServices[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    date: r.date,
    time: r.time,
    offering: r.offering || "main",
    service: r.service,
    partySize: r.partySize,
    name: r.name,
    email: r.email,
    phone: r.phone,
    occasion: r.occasion ?? "",
    notes: r.notes ?? "",
    tableLabel: r.tableLabel ?? "",
    status: r.status as ReservationStatus,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string | number) => setF((p) => ({ ...p, [k]: v }));
  const multiOffering = offerings.length > 1;
  const services = offerings.find((o) => o.id === f.offering)?.services ?? [];

  async function save() {
    if (!f.name.trim()) {
      toast(am.row.nameRequired, "error");
      return;
    }
    setBusy(true);
    try {
      const res = await adminFetch(`/api/admin/reservations/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      if (!res.ok) throw new Error();
      toast(am.row.updated);
      onSaved();
    } catch {
      toast(am.row.saveError, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1 grid grid-cols-2 gap-2">
      {multiOffering && (
        <select
          value={f.offering}
          onChange={(e) => {
            const offId = e.target.value;
            const svcs = offerings.find((o) => o.id === offId)?.services ?? [];
            // keep service valid for the newly-selected offering
            setF((p) => ({ ...p, offering: offId, service: svcs.some((s) => s.id === p.service) ? p.service : (svcs[0]?.id ?? p.service) }));
          }}
          className={`${field} col-span-2`}
        >
          {offerings.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      )}
      <input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} className={field} />
      <input type="time" value={f.time} onChange={(e) => set("time", e.target.value)} className={field} />
      <select value={f.service} onChange={(e) => set("service", e.target.value)} className={field}>
        {!services.some((s) => s.id === f.service) && <option value={f.service}>{f.service}</option>}
        {services.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>
      <input type="number" min={1} max={1000} step="1" value={f.partySize} onChange={(e) => set("partySize", Number(e.target.value))} className={field} />
      <input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={am.row.name} className={`${field} col-span-2`} />
      <input value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder={am.row.phone} className={field} />
      <input value={f.email} onChange={(e) => set("email", e.target.value)} placeholder={am.row.email} className={field} />
      <select value={f.status} onChange={(e) => set("status", e.target.value as ReservationStatus)} className={field}>
        {RESERVATION_STATUSES.map((s) => (
          <option key={s} value={s}>{STATUS_META[s].label}</option>
        ))}
      </select>
      <input value={f.occasion} onChange={(e) => set("occasion", e.target.value)} placeholder={am.row.occasion} className={field} />
      <input value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder={am.row.notes} className={`${field} col-span-2`} />
      <input value={f.tableLabel} onChange={(e) => set("tableLabel", e.target.value)} placeholder={am.row.tablePlaceholder} className={field} />
      <div className="col-span-2 flex gap-2">
        <button onClick={save} disabled={busy} className="bg-primary text-on-primary px-4 py-1.5 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-60">
          {busy ? am.row.saving : am.row.save}
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 rounded-lg text-sm border border-outline-variant/40 text-on-surface-variant hover:text-on-surface">
          {am.row.cancel}
        </button>
      </div>
    </div>
  );
}

function actionLabel(from: ReservationStatus, to: ReservationStatus): string {
  if (to === "confirmed" && (from === "cancelled" || from === "no_show")) return am.actions.reinstate;
  return STATUS_META[to].label;
}

function ActionIcon({ from, to }: { from: ReservationStatus; to: ReservationStatus }) {
  const isReinstate = to === "confirmed" && (from === "cancelled" || from === "no_show");
  let d: string;
  if (isReinstate) {
    d = "M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3";
  } else if (to === "seated") {
    d = "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z";
  } else if (to === "cancelled" || to === "no_show") {
    d = "M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z";
  } else {
    d = "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z";
  }
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M2 3h12v2H2V3zm0 4h12v1H2V7zm1 3h10v1H3v-1zm-1 3h12v1H2v-1z"/>
    </svg>
  );
}
