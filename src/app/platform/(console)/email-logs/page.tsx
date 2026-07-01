"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, HTMLAttributes } from "react";
import {
  platformJson,
  type PlatformEmailLogEntry,
  type PlatformEmailLogStatus,
  type PlatformEmailLogType,
  type PlatformEmailLogsResponse,
  type PlatformLogTenant,
} from "@/components/platform/api";

type FilterState = {
  tenantId: string;
  type: "" | PlatformEmailLogType;
  status: "" | PlatformEmailLogStatus;
  q: string;
  reservationId: string;
  from: string;
  to: string;
  limit: string;
};

const initialFilters: FilterState = {
  tenantId: "",
  type: "",
  status: "",
  q: "",
  reservationId: "",
  from: "",
  to: "",
  limit: "100",
};

const types: PlatformEmailLogType[] = ["bookingConfirmation", "feedbackRequest"];
const statuses: PlatformEmailLogStatus[] = ["failed", "sent", "skipped"];

export default function PlatformEmailLogsPage() {
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [applied, setApplied] = useState<FilterState>(initialFilters);
  const [emails, setEmails] = useState<PlatformEmailLogEntry[]>([]);
  const [tenants, setTenants] = useState<PlatformLogTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tenantMap = useMemo(() => {
    const map = new Map<string, PlatformLogTenant>();
    tenants.forEach((tenant) => map.set(tenant.id, tenant));
    return map;
  }, [tenants]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    platformJson<PlatformEmailLogsResponse>(`/api/platform/email-logs?${query(applied).toString()}`)
      .then((data) => {
        if (!alive) return;
        setEmails(data.emails);
        setTenants(data.tenants);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Could not load email logs.");
        setEmails([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [applied]);

  function update<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters(e: FormEvent) {
    e.preventDefault();
    setApplied(filters);
  }

  function resetFilters() {
    setFilters(initialFilters);
    setApplied(initialFilters);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-on-surface-variant">Platform observability</p>
          <h1 className="mt-1 font-display-lg text-2xl text-on-surface">Email logs</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Transactional email send attempts, failures, SMTP recipient rejections and bounces across tenants.
          </p>
        </div>
        <div className="rounded-lg border border-outline-variant/50 px-3 py-2 text-sm text-on-surface-variant">
          {loading ? "Loading" : `${emails.length} email attempt${emails.length === 1 ? "" : "s"}`}
        </div>
      </div>

      <form onSubmit={applyFilters} className="rounded-lg border border-outline-variant/50 bg-surface-container p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="text-on-surface-variant">Tenant</span>
            <select value={filters.tenantId} onChange={(e) => update("tenantId", e.target.value)} className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-on-surface">
              <option value="">All tenants</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>{tenant.name} ({tenant.slug})</option>
              ))}
            </select>
          </label>
          <SelectField label="Type" value={filters.type} onChange={(value) => update("type", value as FilterState["type"])} options={types} />
          <SelectField label="Status" value={filters.status} onChange={(value) => update("status", value as FilterState["status"])} options={statuses} />
          <TextField label="Search" value={filters.q} onChange={(value) => update("q", value)} placeholder="recipient, reason, error" />
          <TextField label="Reservation ID" value={filters.reservationId} onChange={(value) => update("reservationId", value)} />
          <label className="space-y-1 text-sm">
            <span className="text-on-surface-variant">Limit</span>
            <select value={filters.limit} onChange={(e) => update("limit", e.target.value)} className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-on-surface">
              {["50", "100", "250", "500"].map((limit) => <option key={limit} value={limit}>{limit}</option>)}
            </select>
          </label>
          <TextField label="From" value={filters.from} onChange={(value) => update("from", value)} type="datetime-local" />
          <TextField label="To" value={filters.to} onChange={(value) => update("to", value)} type="datetime-local" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-90" type="submit">Apply filters</button>
          <button className="rounded-lg border border-outline-variant px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface" type="button" onClick={resetFilters}>Reset</button>
        </div>
      </form>

      <section className="overflow-hidden rounded-lg border border-outline-variant/50 bg-surface-container shadow-sm">
        {error ? (
          <div className="p-6 text-sm text-error">{error}</div>
        ) : loading ? (
          <div className="p-6 text-sm text-on-surface-variant">Loading email logs...</div>
        ) : emails.length === 0 ? (
          <div className="p-6 text-sm text-on-surface-variant">No email attempts match the current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full border-collapse text-left text-sm">
              <thead className="border-b border-outline-variant/50 bg-surface-container-high text-xs uppercase tracking-[0.14em] text-on-surface-variant">
                <tr>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Tenant</th>
                  <th className="px-4 py-3 font-medium">Recipient</th>
                  <th className="px-4 py-3 font-medium">Reservation</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/40">
                {emails.map((email) => (
                  <tr key={email.id} className="align-top hover:bg-surface-container-high/60">
                    <td className="px-4 py-3 whitespace-nowrap text-on-surface-variant">{formatDate(email.createdAt)}</td>
                    <td className="px-4 py-3"><StatusBadge status={email.status} /></td>
                    <td className="px-4 py-3 font-medium text-on-surface">{labelForType(email.type)}</td>
                    <td className="px-4 py-3 text-on-surface-variant">{tenantLabel(tenantMap.get(email.tenantId), email.tenantId)}</td>
                    <td className="px-4 py-3 text-on-surface-variant">{email.toEmail ?? "-"}</td>
                    <td className="px-4 py-3 text-xs text-on-surface-variant"><code>{email.reservationId}</code></td>
                    <td className="px-4 py-3">
                      <div className="max-w-[360px] break-words text-on-surface-variant">
                        {email.reason ?? "-"}
                        {email.error ? <div className="mt-1 text-xs text-error">{email.error}</div> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function query(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    const trimmed = value.trim();
    if (trimmed) params.set(key, trimmed);
  });
  return params;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-on-surface-variant">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-on-surface">
        <option value="">All</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function TextField({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"] }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-on-surface-variant">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type={type} className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-on-surface placeholder:text-on-surface-variant/60" />
    </label>
  );
}

function StatusBadge({ status }: { status: PlatformEmailLogStatus }) {
  const classes: Record<PlatformEmailLogStatus, string> = {
    sent: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    failed: "border-error/40 bg-error/15 text-error",
    skipped: "border-yellow-500/40 bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  };
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${classes[status]}`}>{status}</span>;
}

function labelForType(type: PlatformEmailLogType): string {
  return type === "bookingConfirmation" ? "Booking confirmation" : "Feedback request";
}

function tenantLabel(tenant: PlatformLogTenant | undefined, fallback: string): string {
  return tenant ? `${tenant.name} (${tenant.slug})` : fallback;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(date);
}
