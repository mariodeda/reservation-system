"use client";

import { useEffect, useRef, useState } from "react";
import type { ReservationStatus, RestaurantTable } from "@/lib/reservations/types";
import { RESERVATION_STATUSES } from "@/lib/reservations/types";
import type { OfferingServices } from "@/lib/reservations/offerings";
import {
  type AdminReservation,
  type EmailStatus,
  type EmailType,
  formatDateLong,
  QUICK_ACTIONS,
  STATUS_META,
  StatusBadge,
} from "./shared";
import { am } from "@/i18n";
import { adminFetch, adminJson, toast } from "./api";
import Tooltip from "@/components/ui/Tooltip";

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
  const [open, setOpen] = useState(r.status !== "completed");
  const [editing, setEditing] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(!!r.feedbackSentAt);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const canEditOrDelete = r.status !== "seated" && r.status !== "completed";

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
  const completed = r.status === "completed";
  const quickActions = QUICK_ACTIONS[r.status];

  useEffect(() => {
    if (r.status === "completed") setOpen(false);
  }, [r.status]);

  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${completed ? "border-emerald-400/30 bg-emerald-400/10" : "border-outline-variant/30 bg-surface-container"} ${dimmed ? "opacity-60" : ""}`}>
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
                <StarIcon />
                {am.customers.vip}
              </span>
            )}
            <span className="text-on-surface-variant text-sm">· {r.partySize} {am.row.guests}</span>
            {multiOffering && offeringLabel && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary border border-primary/30 uppercase tracking-widest">
                {offeringLabel}
              </span>
            )}
            <StatusBadge status={r.status} />
            {r.durationMinsOverride != null && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-sky-400/15 text-sky-300 border border-sky-400/30">
                <ClockIcon />
                {am.availability.durLabel(r.durationMinsOverride)}
              </span>
            )}
            {r.source === "admin" && (
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant/60">{am.row.manual}</span>
            )}
            {hasUnreachableEmail(r.emails) ? (
              <Tooltip content={unreachableEmailTitle(r.emails)}>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-200 border border-rose-500/40">
                  <AlertIcon />
                  {am.email.unreachableBadge}
                </span>
              </Tooltip>
            ) : hasEmailFailure(r.emails) && (
              <Tooltip content={emailFailureTitle(r.emails)}>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                  <AlertIcon />
                  {am.email.failedBadge}
                </span>
              </Tooltip>
            )}
            {typeof r.visitCount === "number" && r.visitCount > 1 && (
              <span className="text-[10px] font-semibold text-sky-300 uppercase tracking-widest">
                {am.customers.nthVisit(r.visitCount)}
              </span>
            )}
          </div>

          {/* Table assignment — full-width, always visible */}
          {!editing && (!completed || open) && (
            <div className="flex flex-col lg:flex-row lg:items-center gap-2">
              <div className="min-w-0 flex-1">
                <TableAssign
                  reservationId={r.id}
                  value={r.tableLabel}
                  tableId={r.tableId}
                  tables={tables}
                  offering={r.offering || "main"}
                  status={r.status}
                  onChanged={onChanged}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end lg:shrink-0">
                {r.status === "completed" && r.email && (
                  feedbackSent ? (
                    <button
                      disabled
                      className="h-9 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 text-xs font-medium text-emerald-300 opacity-80"
                    >
                      {am.feedback.alreadySent}
                    </button>
                  ) : (
                    <button
                      onClick={requestFeedback}
                      disabled={feedbackBusy}
                      className="h-9 rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 text-xs font-semibold text-sky-300 hover:bg-sky-400/15 disabled:opacity-50"
                    >
                      {feedbackBusy ? am.feedback.sending : am.feedback.send}
                    </button>
                  )
                )}
                <button
                  onClick={() => { if (canEditOrDelete) setEditing(true); }}
                  disabled={!canEditOrDelete}
                  className="h-9 rounded-lg border border-outline-variant/40 px-3 text-xs font-semibold text-primary hover:bg-primary/10 disabled:text-on-surface-variant/40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                >
                  {am.row.edit}
                </button>
                <button
                  onClick={remove}
                  disabled={!canEditOrDelete}
                  className="h-9 rounded-lg border border-rose-500/40 px-3 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 disabled:border-outline-variant/30 disabled:text-on-surface-variant/40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                >
                  {am.row.delete}
                </button>
              </div>
            </div>
          )}

          {/* Details — expanded by default, horizontal layout */}
          {!editing && (
            <>
              {open && <EmailStatusSection r={r} />}
              {open && (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-on-surface-variant pt-0.5">
                  {r.email && (
                    <Tooltip content={`${am.row.email}: ${r.email}`}>
                      <span className="inline-flex items-center gap-1.5">
                        <EmailIcon />
                        {r.email}
                      </span>
                    </Tooltip>
                  )}
                  {r.phone && (
                    <Tooltip content={`${am.row.phone}: ${r.phone}`}>
                      <span className="inline-flex items-center gap-1.5">
                        <PhoneIcon />
                        {r.phone}
                      </span>
                    </Tooltip>
                  )}
                  {r.occasion && (
                    <Tooltip content={`${am.row.occasion}: ${r.occasion}`}>
                      <span className="inline-flex items-center gap-1.5">
                        <OccasionIcon />
                        {r.occasion}
                      </span>
                    </Tooltip>
                  )}
                  {r.notes && (
                    <Tooltip content={`${am.row.notes}: ${r.notes}`}>
                      <span className="italic">"{r.notes}"</span>
                    </Tooltip>
                  )}
                  {r.dietaryNotes && (
                    <Tooltip content={`${am.customers.dietaryAlert}: ${r.dietaryNotes}`}>
                      <span className="inline-flex items-center gap-1.5 text-amber-300 font-medium">
                        <WarningIcon />
                        {r.dietaryNotes}
                      </span>
                    </Tooltip>
                  )}
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
              tables={tables}
              onCancel={() => setEditing(false)}
              onSaved={() => { setEditing(false); onChanged(); }}
            />
          )}
        </div>

        {/* Quick status actions — equal width + icons */}
        {!editing && quickActions.length > 0 && (
          <div className="flex w-[150px] shrink-0 flex-col items-stretch gap-1.5 border-l border-outline-variant/30 pl-3">
            {quickActions.map((s) => (
              <button
                key={s}
                disabled={busy}
                onClick={() => setStatus(s)}
                className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition disabled:opacity-50 ${STATUS_META[s].badge} hover:brightness-125`}
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
  status,
  onChanged,
}: {
  reservationId: string;
  value?: string;
  tableId?: string;
  tables?: RestaurantTable[];
  offering?: string;
  status: ReservationStatus;
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
        status={status}
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
  status,
  onChanged,
}: {
  reservationId: string;
  tableId?: string;
  tables: RestaurantTable[];
  status: ReservationStatus;
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
  const canSuggest = status !== "seated" && status !== "completed";

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
        className="flex-1 h-full bg-surface-container text-on-surface px-2.5 text-sm outline-none disabled:opacity-60 min-w-0"
      >
        <option value="" className="bg-surface-container text-on-surface">
          {am.row.tableUnassigned}
        </option>
        {tables.map((t) => (
          <option key={t.id} value={t.id} className="bg-surface-container text-on-surface">
            {t.label} · {am.row.tableSeats(t.capacity)}
          </option>
        ))}
      </select>
      {!assigned && canSuggest && (
        <Tooltip content={am.row.tableSuggest} className="h-full shrink-0">
          <button
            onClick={suggest}
            disabled={saving}
            className="px-3 h-full flex items-center text-xs font-semibold text-primary hover:bg-primary/10 border-l border-outline-variant/30 transition-colors disabled:opacity-50 shrink-0"
          >
            {saving ? (
              <span className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            ) : (
              am.row.tableSuggest
            )}
          </button>
        </Tooltip>
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
          <Tooltip content={am.row.save} className="h-full">
            <button
              onMouseDown={(e) => { e.preventDefault(); commit(); }}
              className="w-9 h-full flex items-center justify-center text-primary hover:bg-primary/20 transition-colors text-sm font-bold"
              aria-label={am.row.save}
            >
              <CheckIcon />
            </button>
          </Tooltip>
        )}
      </div>
    );
  }

  // --- Assigned ---
  if (value) {
    return (
      <div className="group flex items-center gap-0 w-full rounded-lg border border-primary/50 bg-primary/10 hover:border-primary transition-colors h-9 overflow-hidden">
        <Tooltip content={am.row.tableReassign} className="flex-1 h-full min-w-0">
          <button
            onClick={startEdit}
            className="flex items-center gap-0 w-full h-full hover:bg-primary/10 transition-colors min-w-0"
          >
            <span className="flex items-center gap-1.5 pl-3 pr-2.5 h-full text-xs font-semibold text-primary uppercase tracking-widest border-r border-primary/30 shrink-0">
              <TableIcon />
              {am.row.table}
            </span>
            <span className="flex-1 px-2.5 text-sm font-semibold text-on-surface text-left truncate">{value}</span>
            <span className="w-8 h-full flex items-center justify-center text-on-surface-variant/40 group-hover:text-primary/70 transition-colors text-xs shrink-0">
              <PencilIcon />
            </span>
          </button>
        </Tooltip>
        <Tooltip content={am.row.tableClear} className="h-full shrink-0">
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
            aria-label={am.row.tableClear}
            disabled={saving}
            className="w-8 h-full flex items-center justify-center text-on-surface-variant/40 hover:text-rose-400 border-l border-primary/20 transition-colors shrink-0 disabled:opacity-50"
          >
            {saving ? (
              <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            ) : (
              <XIcon />
            )}
          </button>
        </Tooltip>
      </div>
    );
  }

  // --- Unassigned ---
  return (
    <Tooltip content={am.row.assignTable} className="w-full">
      <button
        onClick={startEdit}
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
          <PlusIcon />
        </span>
      </button>
    </Tooltip>
  );
}

function EditForm({
  r,
  offerings,
  tables,
  onCancel,
  onSaved,
}: {
  r: AdminReservation;
  offerings: OfferingServices[];
  tables: RestaurantTable[];
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
    durationMinsOverride: r.durationMinsOverride ?? null as number | null,
  });
  const [selectedTableId, setSelectedTableId] = useState<string>(r.tableId ?? "");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string | number) => setF((p) => ({ ...p, [k]: v }));
  const multiOffering = offerings.length > 1;
  const services = offerings.find((o) => o.id === f.offering)?.services ?? [];
  const offeringTables = tables.filter((t) => t.active && (!t.offering || t.offering === f.offering));
  const hasManagedTables = offeringTables.length > 0;

  async function save() {
    if (!f.name.trim()) {
      toast(am.row.nameRequired, "error");
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { ...f };
      // Only include tableId in the PATCH when it changed — the route triggers
      // assignTable() whenever this key is present, causing a conflict check.
      const originalTableId = r.tableId ?? "";
      if (hasManagedTables && selectedTableId !== originalTableId) {
        body.tableId = selectedTableId || null;
      }
      const res = await adminFetch(`/api/admin/reservations/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
      {hasManagedTables ? (
        <select value={selectedTableId} onChange={(e) => setSelectedTableId(e.target.value)} className={field}>
          <option value="">{am.row.tableUnassigned}</option>
          {offeringTables.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label} ({am.row.tableSeats(t.capacity)})
            </option>
          ))}
        </select>
      ) : (
        <input value={f.tableLabel} onChange={(e) => set("tableLabel", e.target.value)} placeholder={am.row.tablePlaceholder} className={field} />
      )}
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-on-surface-variant">{am.row.durationOverride}</span>
        <select
          value={f.durationMinsOverride ?? ""}
          onChange={(e) => setF((p) => ({ ...p, durationMinsOverride: e.target.value ? Number(e.target.value) : null }))}
          className={field}
        >
          <option value="">{am.row.durationOverrideDefault}</option>
          {[30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240, 300].map((m) => (
            <option key={m} value={m}>{am.availability.durLabel(m)}</option>
          ))}
        </select>
      </label>
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

/* ----------------------------- email tracking ----------------------------- */

const EMAIL_TYPES: EmailType[] = ["bookingConfirmation", "feedbackRequest"];

interface EmailLogEntry {
  id: string;
  type: EmailType;
  status: EmailStatus["status"];
  reason?: string;
  error?: string;
  toEmail?: string;
  createdAt: string;
}

function emailTypeLabel(t: EmailType): string {
  return t === "bookingConfirmation" ? am.email.confirmation : am.email.feedbackRequest;
}

function reasonLabel(reason?: string): string | undefined {
  switch (reason) {
    case "no_smtp": return am.email.reasonNoSmtp;
    case "event_disabled": return am.email.reasonEventDisabled;
    case "no_recipient": return am.email.reasonNoRecipient;
    case "recipient_rejected": return am.email.reasonRecipientRejected;
    case "bounced": return am.email.reasonBounced;
    default: return undefined;
  }
}

function statusText(status: EmailStatus["status"]): string {
  return status === "sent" ? am.email.sent : status === "failed" ? am.email.failed : am.email.skipped;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function statusChipClass(status: EmailStatus["status"]): string {
  if (status === "sent") return "bg-emerald-400/15 text-emerald-300 border-emerald-400/30";
  if (status === "failed") return "bg-rose-500/15 text-rose-300 border-rose-500/30";
  return "bg-zinc-400/10 text-on-surface-variant/70 border-outline-variant/30";
}

function dotClass(status: EmailStatus["status"]): string {
  if (status === "sent") return "bg-emerald-400";
  if (status === "failed") return "bg-rose-400";
  return "bg-zinc-500";
}

function chipTitle(s: EmailStatus): string {
  const parts: string[] = [];
  parts.push(s.status === "sent" ? am.email.sentAt(fmtTime(s.at)) : `${statusText(s.status)} · ${fmtTime(s.at)}`);
  const rl = reasonLabel(s.reason);
  if (rl) parts.push(rl);
  if (s.error) parts.push(s.error);
  if (s.attempts > 1) parts.push(am.email.attempts(s.attempts));
  return parts.join(" — ");
}

function hasEmailFailure(emails?: Partial<Record<EmailType, EmailStatus>>): boolean {
  if (!emails) return false;
  return EMAIL_TYPES.some((t) => emails[t]?.status === "failed");
}

function isUnreachableEmailStatus(s?: EmailStatus): boolean {
  return s?.status === "failed" && (s.reason === "recipient_rejected" || s.reason === "bounced");
}

function hasUnreachableEmail(emails?: Partial<Record<EmailType, EmailStatus>>): boolean {
  if (!emails) return false;
  return EMAIL_TYPES.some((t) => isUnreachableEmailStatus(emails[t]));
}

function unreachableEmailTitle(emails?: Partial<Record<EmailType, EmailStatus>>): string {
  const details = EMAIL_TYPES
    .filter((t) => isUnreachableEmailStatus(emails?.[t]))
    .map((t) => `${emailTypeLabel(t)}: ${emails?.[t]?.error ?? reasonLabel(emails?.[t]?.reason) ?? am.email.failed}`)
    .join("\n");
  return details ? `${am.email.unreachableCallGuest}\n${details}` : am.email.unreachableCallGuest;
}

function emailFailureTitle(emails?: Partial<Record<EmailType, EmailStatus>>): string {
  if (!emails) return "";
  return EMAIL_TYPES
    .filter((t) => emails[t]?.status === "failed")
    .map((t) => `${emailTypeLabel(t)}: ${emails[t]?.error ?? am.email.failed}`)
    .join("\n");
}

/** Per-reservation email send status + lazy-loaded full attempt log (debug). */
function EmailStatusSection({ r }: { r: AdminReservation }) {
  const [showLog, setShowLog] = useState(false);
  const [log, setLog] = useState<EmailLogEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const present = EMAIL_TYPES.filter((t) => r.emails?.[t]);
  if (present.length === 0) return null; // nothing tracked yet — keep the row clean

  async function toggleLog() {
    const next = !showLog;
    setShowLog(next);
    if (next && log === null && !loading) {
      setLoading(true);
      try {
        const d = await adminJson<{ emails: EmailLogEntry[] }>(`/api/admin/reservations/${r.id}/emails`);
        setLog(d.emails);
      } catch {
        toast(am.email.loadError, "error");
        setShowLog(false);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="pt-0.5 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-on-surface-variant/40"><EmailIcon /></span>
        {present.map((t) => {
          const s = r.emails![t]!;
          return (
            <Tooltip key={t} content={chipTitle(s)}>
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${statusChipClass(s.status)}`}
            >
              <span className="font-semibold">{emailTypeLabel(t)}</span>
              <span className="opacity-50">·</span>
              <span>{statusText(s.status)}</span>
              {s.attempts > 1 && <span className="opacity-60">×{s.attempts}</span>}
            </span>
            </Tooltip>
          );
        })}
        <button
          onClick={toggleLog}
          className="text-[10px] text-on-surface-variant/60 hover:text-primary underline decoration-dotted"
        >
          {showLog ? am.email.hideLog : am.email.viewLog}
        </button>
      </div>
      {showLog && (
        <div className="rounded-lg border border-outline-variant/20 bg-surface-container-high/50 p-2 text-[11px] space-y-1.5">
          {loading && <span className="text-on-surface-variant/60">…</span>}
          {!loading && log && log.length === 0 && (
            <span className="text-on-surface-variant/60">{am.email.none}</span>
          )}
          {!loading && log?.map((e) => (
            <div key={e.id} className="flex items-start gap-2">
              <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${dotClass(e.status)}`} />
              <div className="min-w-0">
                <span className="font-semibold">{emailTypeLabel(e.type)}</span>
                <span className="opacity-70"> · {statusText(e.status)}</span>
                <span className="text-on-surface-variant/50"> · {fmtTime(e.createdAt)}</span>
                {reasonLabel(e.reason) && (
                  <span className="text-on-surface-variant/60"> · {reasonLabel(e.reason)}</span>
                )}
                {e.error && (
                  <div className="text-rose-300/80 break-words font-mono text-[10px] mt-0.5">{e.error}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AlertIcon() {
  return (
    <svg className="w-3 h-3 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2.8 1.9 13a1 1 0 0 0 .9 1.5h10.4a1 1 0 0 0 .9-1.5L8 2.8Z" />
      <path d="M8 6.5v3" />
      <path d="M8 12h.01" />
    </svg>
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

function StarIcon() {
  return (
    <svg className="w-3 h-3 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="m8 1.8 1.8 3.7 4.1.6-3 2.9.7 4.1L8 11.2l-3.6 1.9.7-4.1-3-2.9 4.1-.6L8 1.8Z" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 4.5h11v7h-11z" />
      <path d="m3 5 5 4 5-4" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5.4 2.7 6.5 5c.2.5.1 1-.3 1.3l-.7.6a8 8 0 0 0 3.6 3.6l.6-.7c.3-.4.8-.5 1.3-.3l2.3 1.1c.5.2.8.8.6 1.3l-.5 1.7c-.1.5-.6.8-1.1.8A10.7 10.7 0 0 1 1.6 3.7c0-.5.3-1 .8-1.1l1.7-.5c.5-.2 1.1.1 1.3.6Z" />
    </svg>
  );
}

function OccasionIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 4.5v9" />
      <path d="M3.5 7.5h9v6h-9z" />
      <path d="M2.8 5h10.4v2.5H2.8z" />
      <path d="M8 5H5.4a1.4 1.4 0 1 1 1.1-2.3L8 5Zm0 0h2.6a1.4 1.4 0 1 0-1.1-2.3L8 5Z" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 2.8 1.9 12a1.1 1.1 0 0 0 1 1.7h10.2a1.1 1.1 0 0 0 1-1.7L9 2.8a1.1 1.1 0 0 0-2 0Z" />
      <path d="M8 6v3" />
      <path d="M8 11.6h.01" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="w-3 h-3 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3.5l2 1.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3.5 8.3 2.7 2.7 6.3-6.5" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.7 3.3 12.7 6.3" />
      <path d="M3 13h3l7-7a2.1 2.1 0 0 0-3-3l-7 7v3Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  );
}
