"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, HTMLAttributes } from "react";
import {
  platformJson,
  type PlatformLogEvent,
  type PlatformLogLevel,
  type PlatformLogsResponse,
  type PlatformLogSurface,
  type PlatformLogActorType,
  type PlatformLogTenant,
} from "@/components/platform/api";

type FilterState = {
  tenantId: string;
  level: "" | PlatformLogLevel;
  surface: "" | PlatformLogSurface;
  actorType: "" | PlatformLogActorType;
  event: string;
  q: string;
  reference: string;
  requestId: string;
  reservationId: string;
  status: string;
  reason: string;
  from: string;
  to: string;
  limit: string;
};

const initialFilters: FilterState = {
  tenantId: "",
  level: "",
  surface: "",
  actorType: "",
  event: "",
  q: "",
  reference: "",
  requestId: "",
  reservationId: "",
  status: "",
  reason: "",
  from: "",
  to: "",
  limit: "100",
};

const levels: PlatformLogLevel[] = ["error", "warn", "info", "debug"];
const surfaces: PlatformLogSurface[] = ["public", "admin", "platform", "system"];
const actors: PlatformLogActorType[] = ["guest", "staff", "platform", "impersonation", "system", "unknown"];

export default function PlatformLogsPage() {
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [applied, setApplied] = useState<FilterState>(initialFilters);
  const [events, setEvents] = useState<PlatformLogEvent[]>([]);
  const [tenants, setTenants] = useState<PlatformLogTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tenantName = useMemo(() => {
    const map = new Map<string, PlatformLogTenant>();
    tenants.forEach((tenant) => map.set(tenant.id, tenant));
    return map;
  }, [tenants]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    platformJson<PlatformLogsResponse>(`/api/platform/logs?${query(applied).toString()}`)
      .then((data) => {
        if (!alive) return;
        setEvents(data.events);
        setTenants(data.tenants);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Could not load logs.");
        setEvents([]);
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
          <h1 className="mt-1 font-display-lg text-2xl text-on-surface">Logs</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Cross-tenant application events, public API activity, staff actions and platform changes.
          </p>
        </div>
        <div className="rounded-lg border border-outline-variant/50 px-3 py-2 text-sm text-on-surface-variant">
          {loading ? "Loading" : `${events.length} event${events.length === 1 ? "" : "s"}`}
        </div>
      </div>

      <form
        onSubmit={applyFilters}
        className="rounded-lg border border-outline-variant/50 bg-surface-container p-4 shadow-sm"
      >
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="text-on-surface-variant">Tenant</span>
            <select
              value={filters.tenantId}
              onChange={(e) => update("tenantId", e.target.value)}
              className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-on-surface"
            >
              <option value="">All tenants</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name} ({tenant.slug})
                </option>
              ))}
            </select>
          </label>

          <SelectField label="Level" value={filters.level} onChange={(value) => update("level", value as FilterState["level"])} options={levels} />
          <SelectField label="Surface" value={filters.surface} onChange={(value) => update("surface", value as FilterState["surface"])} options={surfaces} />
          <SelectField label="Actor" value={filters.actorType} onChange={(value) => update("actorType", value as FilterState["actorType"])} options={actors} />

          <TextField label="Event" value={filters.event} onChange={(value) => update("event", value)} placeholder="public.booking.created" />
          <TextField label="Search" value={filters.q} onChange={(value) => update("q", value)} placeholder="reason, id, reference" />
          <TextField label="Reference" value={filters.reference} onChange={(value) => update("reference", value)} placeholder="ABC123" />
          <TextField label="Status" value={filters.status} onChange={(value) => update("status", value)} placeholder="429" inputMode="numeric" />
          <TextField label="Request ID" value={filters.requestId} onChange={(value) => update("requestId", value)} />
          <TextField label="Reservation ID" value={filters.reservationId} onChange={(value) => update("reservationId", value)} />
          <TextField label="Reason contains" value={filters.reason} onChange={(value) => update("reason", value)} />

          <label className="space-y-1 text-sm">
            <span className="text-on-surface-variant">Limit</span>
            <select
              value={filters.limit}
              onChange={(e) => update("limit", e.target.value)}
              className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-on-surface"
            >
              {["50", "100", "250", "500"].map((limit) => <option key={limit} value={limit}>{limit}</option>)}
            </select>
          </label>

          <TextField label="From" value={filters.from} onChange={(value) => update("from", value)} type="datetime-local" />
          <TextField label="To" value={filters.to} onChange={(value) => update("to", value)} type="datetime-local" />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-90" type="submit">
            Apply filters
          </button>
          <button
            className="rounded-lg border border-outline-variant px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            type="button"
            onClick={resetFilters}
          >
            Reset
          </button>
        </div>
      </form>

      <section className="overflow-hidden rounded-lg border border-outline-variant/50 bg-surface-container shadow-sm">
        {error ? (
          <div className="p-6 text-sm text-error">{error}</div>
        ) : loading ? (
          <div className="p-6 text-sm text-on-surface-variant">Loading logs...</div>
        ) : events.length === 0 ? (
          <div className="p-6 text-sm text-on-surface-variant">No events match the current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full border-collapse text-left text-sm">
              <thead className="border-b border-outline-variant/50 bg-surface-container-high text-xs uppercase tracking-[0.14em] text-on-surface-variant">
                <tr>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Level</th>
                  <th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-4 py-3 font-medium">Tenant</th>
                  <th className="px-4 py-3 font-medium">Surface</th>
                  <th className="px-4 py-3 font-medium">Actor</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Identifiers</th>
                  <th className="px-4 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/40">
                {events.map((event) => (
                  <tr key={event.id} className="align-top hover:bg-surface-container-high/60">
                    <td className="px-4 py-3 whitespace-nowrap text-on-surface-variant">{formatDate(event.createdAt)}</td>
                    <td className="px-4 py-3"><LevelBadge level={event.level} /></td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-on-surface">{event.event}</div>
                      {event.reason ? <div className="mt-1 max-w-[260px] break-words text-xs text-on-surface-variant">{event.reason}</div> : null}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">
                      {event.tenantId ? tenantLabel(tenantName.get(event.tenantId), event.tenantId) : "Platform"}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">{event.surface}</td>
                    <td className="px-4 py-3 text-on-surface-variant">
                      <div>{event.actorType}</div>
                      {event.actorIdHash ? <code className="text-xs">{event.actorIdHash}</code> : null}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">{event.status ?? "-"}</td>
                    <td className="px-4 py-3 text-xs text-on-surface-variant">
                      <Identifier label="Ref" value={event.reference} />
                      <Identifier label="Req" value={event.requestId} />
                      <Identifier label="Res" value={event.reservationId} />
                    </td>
                    <td className="px-4 py-3">
                      <Metadata event={event} />
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

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-on-surface-variant">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-on-surface"
      >
        <option value="">All</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-on-surface-variant">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        inputMode={inputMode}
        className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-on-surface placeholder:text-on-surface-variant/60"
      />
    </label>
  );
}

function LevelBadge({ level }: { level: PlatformLogLevel }) {
  const classes: Record<PlatformLogLevel, string> = {
    error: "border-error/40 bg-error/15 text-error",
    warn: "border-yellow-500/40 bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
    info: "border-primary/40 bg-primary/15 text-primary",
    debug: "border-outline-variant bg-surface-container-high text-on-surface-variant",
  };
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${classes[level]}`}>
      {level}
    </span>
  );
}

function Identifier({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="mb-1 max-w-[220px] truncate">
      <span className="text-on-surface-variant/70">{label}: </span>
      <code>{value}</code>
    </div>
  );
}

function Metadata({ event }: { event: PlatformLogEvent }) {
  if (!event.metadata || Object.keys(event.metadata).length === 0) {
    return <span className="text-xs text-on-surface-variant">-</span>;
  }
  return (
    <details className="group">
      <summary className="cursor-pointer text-sm text-primary hover:underline">Metadata</summary>
      <pre className="mt-2 max-h-56 w-[320px] max-w-[calc(100vw-2rem)] overflow-auto rounded-lg border border-outline-variant bg-surface p-3 text-xs text-on-surface">
        {JSON.stringify(event.metadata, null, 2)}
      </pre>
    </details>
  );
}

function tenantLabel(tenant: PlatformLogTenant | undefined, fallback: string): string {
  return tenant ? `${tenant.name} (${tenant.slug})` : fallback;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}
