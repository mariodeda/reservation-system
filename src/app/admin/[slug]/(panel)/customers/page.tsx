"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { am } from "@/i18n";
import { adminJson, adminFetch, toast } from "@/components/admin/api";
import type { CustomerProfile, Reservation } from "@/lib/reservations/types";
import { STATUS_META, formatDateLong } from "@/components/admin/shared";
import Tooltip from "@/components/ui/Tooltip";

type SortBy = "lastVisit" | "name" | "visits";

type ReservationWithDetail = Reservation & {
  reference?: string;
  feedback?: { sentAt: string } | null;
};

export default function CustomersPage() {
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("lastVisit");
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50", sortBy });
      if (query.trim()) params.set("q", query.trim());
      const data = await adminJson<{ customers: CustomerProfile[]; total: number }>(
        `/api/admin/customers?${params}`,
      );
      setCustomers(data.customers ?? []);
      setTotal(data.total ?? 0);
    } catch {
      toast(am.customers.couldNotLoad, "error");
    } finally {
      setLoading(false);
    }
  }, [query, page, sortBy]);

  // Debounce search, immediate on sort/page change
  useEffect(() => {
    const id = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(id);
  }, [load]);

  function handleQueryChange(q: string) {
    setQuery(q);
    setPage(1);
  }

  function handleSortChange(s: SortBy) {
    setSortBy(s);
    setPage(1);
  }

  function exportCsv() {
    const cols = ["Name", "Email", "Phone", "Visits", "Total Covers", "No-shows", "Cancellations", "First Visit", "Last Visit", "VIP", "Dietary Notes"];
    const esc = (v: unknown) => {
      const raw = String(v ?? "");
      const safe = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const lines = [cols.join(",")].concat(
      customers.map((c) =>
        [c.name, c.email, c.phone, c.visitCount, c.totalCovers, c.noShowCount, c.cancelledCount, c.firstVisit ?? "", c.lastVisit ?? "", c.vip ? "Yes" : "No", c.dietaryNotes ?? ""]
          .map(esc).join(","),
      ),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "customers.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const LIMIT = 50;
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{am.customers.title}</h1>
          {!loading && (
            <p className="text-on-surface-variant text-sm mt-0.5">
              {am.customers.customerCount(total)}
            </p>
          )}
        </div>
        <button
          onClick={exportCsv}
          disabled={customers.length === 0}
          className="text-sm border border-outline-variant/40 text-on-surface-variant hover:text-primary px-3 py-1.5 rounded-lg transition disabled:opacity-40"
        >
          {am.customers.exportCsv}
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder={am.customers.searchPlaceholder}
          className="bg-surface-container border border-outline-variant/30 rounded-lg px-3 py-1.5 text-sm w-72 max-w-full"
        />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-on-surface-variant">{am.customers.sortLabel}:</span>
          {(["lastVisit", "name", "visits"] as SortBy[]).map((s) => (
            <button
              key={s}
              onClick={() => handleSortChange(s)}
              className={`px-3 py-1 rounded-full text-xs border transition ${
                sortBy === s
                  ? "bg-primary/15 text-primary border-primary/40"
                  : "border-outline-variant/30 text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {s === "lastVisit" ? am.customers.sortLastVisit : s === "name" ? am.customers.sortName : am.customers.sortVisits}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : customers.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant border border-dashed border-outline-variant/40 rounded-xl">
          {am.customers.noResults}
        </div>
      ) : (
        <div className="space-y-2">
          {customers.map((c) => (
            <CustomerRow
              key={c.email}
              customer={c}
              expanded={expandedEmail === c.email}
              onToggle={() => setExpandedEmail(expandedEmail === c.email ? null : c.email)}
              onUpdated={load}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="h-9 px-3 rounded-lg border border-outline-variant/30 text-on-surface-variant disabled:opacity-30 hover:text-primary transition"
            aria-label="Previous page"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <span className="text-sm text-on-surface-variant">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="h-9 px-3 rounded-lg border border-outline-variant/30 text-on-surface-variant disabled:opacity-30 hover:text-primary transition"
            aria-label="Next page"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ CustomerRow */

function CustomerRow({
  customer,
  expanded,
  onToggle,
  onUpdated,
}: {
  customer: CustomerProfile;
  expanded: boolean;
  onToggle: () => void;
  onUpdated: () => void;
}) {
  const [detail, setDetail] = useState<{ profile: CustomerProfile; reservations: ReservationWithDetail[] } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editing, setEditing] = useState(false);

  // Load detail on expand
  useEffect(() => {
    if (!expanded || detail) return;
    setLoadingDetail(true);
    adminJson<{ profile: CustomerProfile; reservations: ReservationWithDetail[] }>(
      `/api/admin/customers/${encodeURIComponent(customer.email)}`,
    )
      .then((d) => setDetail(d))
      .catch(() => toast(am.customers.couldNotLoad, "error"))
      .finally(() => setLoadingDetail(false));
  }, [expanded, customer.email, detail]);

  const initials = customer.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const AVATAR_COLORS = [
    "bg-amber-400/20 text-amber-300",
    "bg-emerald-400/20 text-emerald-300",
    "bg-sky-400/20 text-sky-300",
    "bg-violet-400/20 text-violet-300",
    "bg-rose-400/20 text-rose-300",
  ];
  const avatarColor = AVATAR_COLORS[(customer.email.charCodeAt(0) + customer.email.charCodeAt(1)) % AVATAR_COLORS.length];

  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container overflow-hidden">
      {/* Summary row */}
      <button
        onClick={onToggle}
        className="w-full text-left p-4 flex items-center gap-3 hover:bg-surface-container-high transition-colors"
      >
        {/* Avatar */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm shrink-0 ${avatarColor}`}>
          {initials || "?"}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Tooltip content={customer.name} className="min-w-0 max-w-full">
              <span className="font-semibold truncate">{customer.name}</span>
            </Tooltip>
            {customer.vip && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 uppercase tracking-widest shrink-0">
                <StarIcon className="h-3 w-3" />
                {am.customers.vip}
              </span>
            )}
            {customer.dietaryNotes && (
              <Tooltip content={customer.dietaryNotes}>
                <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-300 shrink-0">
                  <AlertIcon className="h-3 w-3" />
                  {am.customers.dietaryAlert}
                </span>
              </Tooltip>
            )}
            {customer.noShowCount > 0 && (
              <Tooltip content={`${customer.noShowCount} no-show${customer.noShowCount > 1 ? "s" : ""}`}>
                <span className="inline-flex items-center gap-0.5 text-[10px] text-rose-400 shrink-0">
                  <XIcon className="h-3 w-3" />
                  {customer.noShowCount} {am.customers.noShows.toLowerCase()}
                </span>
              </Tooltip>
            )}
          </div>
          <div className="text-xs text-on-surface-variant mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            <span>{customer.email}</span>
            {customer.phone && <span>{customer.phone}</span>}
          </div>
        </div>

        {/* Stats */}
        <div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0 text-right">
          <span className="text-sm font-semibold">
            {customer.visitCount} {customer.visitCount === 1 ? "visit" : "visits"}
          </span>
          <span className="text-xs text-on-surface-variant">
            {customer.lastVisit ? `Last: ${formatDateLong(customer.lastVisit).replace(/, \d{4}$/, "")}` : "Ã¢â‚¬â€"}
          </span>
        </div>

        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-on-surface-variant/60 shrink-0 transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
          viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"
        >
          <path d="M6 8L1 3h10L6 8z" />
        </svg>
      </button>

      {/* Detail panel */}
      {expanded && (
        <div className="border-t border-outline-variant/30 bg-surface-container-high">
          {loadingDetail ? (
            <div className="p-4 space-y-2">
              {[0, 1].map((i) => <div key={i} className="h-8 rounded bg-surface-container animate-pulse" />)}
            </div>
          ) : detail ? (
            editing ? (
              <ProfileEditForm
                profile={detail.profile}
                onSaved={(updated) => {
                  setDetail({ ...detail, profile: updated });
                  setEditing(false);
                  onUpdated();
                }}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <ProfileView
                profile={detail.profile}
                reservations={detail.reservations}
                onEdit={() => setEditing(true)}
              />
            )
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ ProfileView */

function ProfileView({
  profile,
  reservations,
  onEdit,
}: {
  profile: CustomerProfile;
  reservations: ReservationWithDetail[];
  onEdit: () => void;
}) {
  const now = new Date().toISOString().slice(0, 10);
  const past = reservations.filter((r) => r.date < now || ["completed", "cancelled", "no_show"].includes(r.status));
  const upcoming = reservations.filter((r) => r.date >= now && !["completed", "cancelled", "no_show"].includes(r.status));

  const totalBookings = profile.visitCount + profile.noShowCount + profile.cancelledCount;
  const reliabilityPct = totalBookings > 0 ? Math.round((profile.visitCount / totalBookings) * 100) : null;

  return (
    <div className="p-4 space-y-5">
      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: am.customers.totalVisits, value: profile.visitCount },
          { label: am.customers.totalCovers, value: profile.totalCovers },
          { label: am.customers.firstVisit, value: profile.firstVisit ? formatDateLong(profile.firstVisit).replace(/, \d{4}$/, "") : "Ã¢â‚¬â€" },
          { label: am.customers.lastVisit, value: profile.lastVisit ? formatDateLong(profile.lastVisit).replace(/, \d{4}$/, "") : "Ã¢â‚¬â€" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg bg-surface-container p-3 text-center">
            <div className="text-lg font-semibold tabular-nums">{s.value}</div>
            <div className="text-[10px] uppercase tracking-widest text-on-surface-variant mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Reliability strip Ã¢â‚¬â€ only show if there's something interesting */}
      {(profile.noShowCount > 0 || profile.cancelledCount > 0) && (
        <div className="flex items-center gap-4 flex-wrap text-xs rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-2">
          {reliabilityPct !== null && (
            <span className={`font-semibold ${reliabilityPct < 70 ? "text-rose-400" : reliabilityPct < 90 ? "text-amber-300" : "text-emerald-400"}`}>
              {am.customers.reliability}: {reliabilityPct}%
            </span>
          )}
          {profile.noShowCount > 0 && (
            <span className="text-rose-300">{am.customers.noShows}: {profile.noShowCount}</span>
          )}
          {profile.cancelledCount > 0 && (
            <span className="text-on-surface-variant">{am.customers.cancellations}: {profile.cancelledCount}</span>
          )}
        </div>
      )}

      {/* Notes */}
      {(profile.dietaryNotes || profile.staffNotes) && (
        <div className="space-y-2">
          {profile.dietaryNotes && (
            <div className="rounded-lg bg-amber-400/10 border border-amber-400/30 px-3 py-2 text-sm">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 uppercase tracking-widest mb-0.5">
                <AlertIcon className="h-3.5 w-3.5" />
                {am.customers.dietaryNotes}
              </span>
              <span className="text-on-surface">{profile.dietaryNotes}</span>
            </div>
          )}
          {profile.staffNotes && (
            <div className="rounded-lg bg-surface-container border border-outline-variant/30 px-3 py-2 text-sm">
              <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest block mb-0.5">
                {am.customers.staffNotes}
              </span>
              <span className="text-on-surface whitespace-pre-wrap">{profile.staffNotes}</span>
            </div>
          )}
        </div>
      )}

      <button
        onClick={onEdit}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        Edit profile
        <ChevronRightIcon className="h-3 w-3" />
      </button>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <ReservationTable title="Upcoming" reservations={upcoming} />
      )}

      {/* History */}
      <ReservationTable
        title={am.customers.visitHistory}
        reservations={past}
        emptyText={am.customers.noHistory}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ ReservationTable */

function ReservationTable({
  title,
  reservations,
  emptyText,
}: {
  title: string;
  reservations: ReservationWithDetail[];
  emptyText?: string;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant mb-2">{title}</h3>
      {reservations.length === 0 ? (
        <p className="text-sm text-on-surface-variant/60">{emptyText}</p>
      ) : (
        <div className="rounded-lg border border-outline-variant/30 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant/30 bg-surface-container text-xs text-on-surface-variant uppercase tracking-widest">
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Time</th>
                <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">Service</th>
                <th className="px-3 py-2 text-left font-medium">Guests</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">Occasion</th>
                <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Ref</th>
                <th className="px-3 py-2 text-left font-medium hidden lg:table-cell">Rating</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((r, i) => (
                <tr
                  key={r.id}
                  className={`border-b border-outline-variant/20 last:border-0 ${i % 2 === 0 ? "" : "bg-outline-variant/5"}`}
                >
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                    {formatDateLong(r.date).replace(/, \d{4}$/, "")}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.time}</td>
                  <td className="px-3 py-2 capitalize hidden sm:table-cell">{r.service}</td>
                  <td className="px-3 py-2 tabular-nums">{r.partySize}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_META[r.status].badge}`}>
                      {STATUS_META[r.status].label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-on-surface-variant/70 hidden sm:table-cell">{r.occasion ?? "Ã¢â‚¬â€"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-on-surface-variant/60 hidden md:table-cell">
                    #{r.reference ?? ""}
                  </td>
                  <td className="px-3 py-2 hidden lg:table-cell">
                    {r.feedback?.sentAt ? (
                      <span className="text-on-surface-variant/60 text-xs">requested</span>
                    ) : (
                      <span className="text-on-surface-variant/30 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ ProfileEditForm */

function ProfileEditForm({
  profile,
  onSaved,
  onCancel,
}: {
  profile: CustomerProfile;
  onSaved: (updated: CustomerProfile) => void;
  onCancel: () => void;
}) {
  const [vip, setVip] = useState(profile.vip);
  const [staffNotes, setStaffNotes] = useState(profile.staffNotes ?? "");
  const [dietaryNotes, setDietaryNotes] = useState(profile.dietaryNotes ?? "");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function save() {
    setSaving(true);
    try {
      const data = await adminJson<{ ok: boolean; profile: CustomerProfile }>(
        `/api/admin/customers/${encodeURIComponent(profile.email)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vip,
            staffNotes: staffNotes.trim() || null,
            dietaryNotes: dietaryNotes.trim() || null,
          }),
        },
      );
      toast(am.customers.saved);
      onSaved(data.profile);
    } catch {
      toast(am.customers.couldNotSave, "error");
    } finally {
      setSaving(false);
    }
  }

  const field = "bg-surface-container border border-outline-variant/30 rounded-lg px-3 py-2 text-sm w-full focus:border-primary outline-none resize-none";

  return (
    <div className="p-4 space-y-4">
      {/* VIP toggle */}
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <button
          type="button"
          onClick={() => setVip((v) => !v)}
          className={`relative w-10 h-6 rounded-full transition-colors ${vip ? "bg-amber-400" : "bg-outline-variant/40"}`}
          aria-checked={vip}
          role="switch"
        >
          <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-surface-bright shadow transition-transform ${vip ? "translate-x-4" : ""}`} />
        </button>
        <span className="text-sm font-medium">
          {am.customers.vipToggle}
          {vip && (
            <span className="ml-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 uppercase tracking-widest">
              <StarIcon className="h-3 w-3" />
              {am.customers.vip}
            </span>
          )}
        </span>
      </label>

      {/* Dietary notes */}
      <div>
        <label className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant block mb-1.5">
          <span className="inline-flex items-center gap-1">
            <AlertIcon className="h-3.5 w-3.5" />
            {am.customers.dietaryNotes}
          </span>
        </label>
        <textarea
          value={dietaryNotes}
          onChange={(e) => setDietaryNotes(e.target.value)}
          placeholder={am.customers.dietaryPlaceholder}
          rows={2}
          className={field}
        />
      </div>

      {/* Staff notes */}
      <div>
        <label className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant block mb-1.5">
          {am.customers.staffNotes}
        </label>
        <textarea
          ref={textareaRef}
          value={staffNotes}
          onChange={(e) => setStaffNotes(e.target.value)}
          placeholder={am.customers.staffNotesPlaceholder}
          rows={3}
          className={field}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="bg-primary text-on-primary px-4 py-1.5 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-60"
        >
          {saving ? am.customers.saving : am.customers.save}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-1.5 rounded-lg text-sm border border-outline-variant/40 text-on-surface-variant hover:text-on-surface"
        >
          {am.customers.cancel}
        </button>
      </div>
    </div>
  );
}

function ChevronLeftIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function StarIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="m12 2.8 2.78 5.63 6.22.9-4.5 4.39 1.06 6.19L12 17l-5.56 2.91 1.06-6.19L3 9.33l6.22-.9L12 2.8z" />
    </svg>
  );
}

function AlertIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3 10 18H2L12 3z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
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

