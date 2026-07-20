"use client";

import { useEffect, useMemo, useState } from "react";
import { platformJson } from "@/components/platform/api";

type CronRunStatus = "success" | "warning" | "failed";
type CronRunTrigger = "external" | "internal";

interface CronRun {
  id: string;
  job: string;
  label: string;
  status: CronRunStatus;
  trigger: CronRunTrigger;
  event: string;
  createdAt: string;
  durationMs?: number;
  reason?: string;
  summary: Record<string, number | string | boolean>;
  metadata?: Record<string, unknown>;
}

interface CronJob {
  name: string;
  label: string;
  description: string;
  cadence: string;
  endpoint: string;
  lastRun?: CronRun;
}

interface CronRunsResponse {
  jobs: CronJob[];
  runs: CronRun[];
}

const ALL_JOBS = "all";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatDuration(ms: number | undefined) {
  if (!Number.isFinite(ms)) return "n/a";
  if ((ms ?? 0) < 1000) return `${Math.round(ms ?? 0)} ms`;
  return `${((ms ?? 0) / 1000).toFixed(1)} s`;
}

function statusClass(status: CronRunStatus) {
  if (status === "failed") return "border-error/40 bg-error/10 text-error";
  if (status === "warning") return "border-amber-400/40 bg-amber-400/10 text-on-surface";
  return "border-emerald-400/35 bg-emerald-400/10 text-on-surface";
}

function triggerLabel(trigger: CronRunTrigger) {
  return trigger === "internal" ? "Internal scheduler" : "External cron endpoint";
}

function summaryText(summary: Record<string, number | string | boolean>) {
  const entries = Object.entries(summary);
  if (!entries.length) return "No counters";
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(" · ");
}

export default function PlatformCronRunsPage() {
  const [data, setData] = useState<CronRunsResponse>({ jobs: [], runs: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [job, setJob] = useState(ALL_JOBS);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ limit: "250" });
    if (job !== ALL_JOBS) params.set("job", job);
    platformJson<CronRunsResponse>(`/api/platform/cron-runs?${params.toString()}`)
      .then((next) => {
        if (!alive) return;
        setData(next);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Could not load cron runs.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [job]);

  const filteredRuns = data.runs;
  const failedCount = useMemo(() => data.runs.filter((run) => run.status === "failed").length, [data.runs]);
  const warningCount = useMemo(() => data.runs.filter((run) => run.status === "warning").length, [data.runs]);

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">Cron jobs</h1>
          <p className="mt-1 max-w-3xl text-sm text-on-surface-variant">
            Monitor external cron endpoint runs and the internal scheduler from the same event stream.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-xs text-on-surface-variant">
          <span>{data.runs.length} runs loaded</span>
          <span className="text-outline">·</span>
          <span>{failedCount} failed</span>
          <span className="text-outline">·</span>
          <span>{warningCount} warnings</span>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      <section className="grid gap-3 md:grid-cols-3">
        {data.jobs.map((cronJob) => (
          <article key={cronJob.name} className="rounded-lg border border-outline-variant/30 bg-surface-container p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-on-surface">{cronJob.label}</h2>
                <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">{cronJob.description}</p>
              </div>
              {cronJob.lastRun ? (
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClass(cronJob.lastRun.status)}`}>
                  {cronJob.lastRun.status}
                </span>
              ) : (
                <span className="shrink-0 rounded-full border border-outline-variant/35 bg-surface-container-high px-2 py-0.5 text-[11px] text-on-surface-variant">
                  no runs
                </span>
              )}
            </div>
            <dl className="mt-4 space-y-2 text-xs">
              <div>
                <dt className="text-on-surface-variant">Cadence</dt>
                <dd className="mt-0.5 text-on-surface">{cronJob.cadence}</dd>
              </div>
              <div>
                <dt className="text-on-surface-variant">Endpoint</dt>
                <dd className="mt-0.5 font-mono text-on-surface">{cronJob.endpoint}</dd>
              </div>
              <div>
                <dt className="text-on-surface-variant">Last run</dt>
                <dd className="mt-0.5 text-on-surface">
                  {cronJob.lastRun ? `${formatDate(cronJob.lastRun.createdAt)} · ${triggerLabel(cronJob.lastRun.trigger)} · ${formatDuration(cronJob.lastRun.durationMs)}` : "No recorded run yet"}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </section>

      <section className="rounded-lg border border-outline-variant/30 bg-surface-container">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/30 px-4 py-3">
          <div>
            <h2 className="font-semibold text-on-surface">Recent runs</h2>
            <p className="text-xs text-on-surface-variant">Successful, warning, and failed cron executions from app events.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-on-surface-variant">
            Job
            <select
              value={job}
              onChange={(event) => setJob(event.target.value)}
              className="h-9 rounded-lg border border-outline-variant/30 bg-surface-container-high px-2 text-sm text-on-surface outline-none focus:border-primary"
            >
              <option value={ALL_JOBS}>All jobs</option>
              {data.jobs.map((cronJob) => <option key={cronJob.name} value={cronJob.name}>{cronJob.label}</option>)}
            </select>
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-outline-variant/40 bg-surface-container-high text-xs uppercase tracking-[0.14em] text-on-surface-variant">
              <tr>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Job</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Trigger</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Summary</th>
                <th className="px-4 py-3 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-8 text-center text-on-surface-variant" colSpan={7}>Loading cron runs...</td>
                </tr>
              ) : filteredRuns.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-on-surface-variant" colSpan={7}>No cron runs recorded yet.</td>
                </tr>
              ) : filteredRuns.map((run) => (
                <tr key={run.id} className="align-top border-b border-outline-variant/15 last:border-0 hover:bg-surface-container-high/55">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-on-surface-variant">{formatDate(run.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-on-surface">{run.label}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-on-surface-variant">{run.event}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass(run.status)}`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-on-surface">{triggerLabel(run.trigger)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-on-surface">{formatDuration(run.durationMs)}</td>
                  <td className="min-w-[260px] px-4 py-3 text-xs text-on-surface-variant">{summaryText(run.summary)}</td>
                  <td className="min-w-[180px] px-4 py-3 text-xs text-on-surface-variant">
                    {run.reason || "none"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
