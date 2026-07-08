import { NextResponse, type NextRequest } from "next/server";
import { listAppEvents, type AppEvent } from "@/lib/observability/app-event-store";
import { observePlatformRoute } from "@/lib/observability/route-events";
import { requirePlatform } from "@/lib/reservations/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CronJobName = "dish-sync" | "feedback-requests" | "reminder-emails" | "smtp-health";
type CronRunStatus = "success" | "warning" | "failed";
type CronRunTrigger = "external" | "internal";

interface CronJobDefinition {
  name: CronJobName;
  label: string;
  description: string;
  cadence: string;
  endpoint: string;
}

interface CronRun {
  id: string;
  job: CronJobName;
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

const JOBS: CronJobDefinition[] = [
  {
    name: "dish-sync",
    label: "DISH sync",
    description: "Imports enabled DISH tenants across their rolling booking window.",
    cadence: "Every 15 minutes internally, or external POST /api/platform/cron/dish-sync.",
    endpoint: "/api/platform/cron/dish-sync",
  },
  {
    name: "feedback-requests",
    label: "Review request emails",
    description: "Sends due post-visit review requests for eligible completed reservations.",
    cadence: "Every 30 minutes internally, or external POST /api/platform/cron/feedback-requests.",
    endpoint: "/api/platform/cron/feedback-requests",
  },
  {
    name: "reminder-emails",
    label: "Reminder emails",
    description: "Sends due pre-visit reminders for eligible upcoming reservations.",
    cadence: "Every 30 minutes internally, or external POST /api/platform/cron/reminder-emails.",
    endpoint: "/api/platform/cron/reminder-emails",
  },
  {
    name: "smtp-health",
    label: "SMTP health checks",
    description: "Verifies per-tenant SMTP configuration and stores the latest health result.",
    cadence: "Every 6 hours internally, or external POST /api/platform/cron/smtp-health.",
    endpoint: "/api/platform/cron/smtp-health",
  },
];

function text(params: URLSearchParams, key: string, max = 120): string | undefined {
  const value = String(params.get(key) ?? "").trim();
  return value ? value.slice(0, max) : undefined;
}

function numberParam(params: URLSearchParams, key: string): number | undefined {
  const value = Number(text(params, key, 16));
  return Number.isInteger(value) ? value : undefined;
}

function jobFromMetadata(metadata: Record<string, unknown> | undefined): CronJobName | null {
  const job = metadata?.job;
  return job === "dish-sync" || job === "feedback-requests" || job === "reminder-emails" || job === "smtp-health" ? job : null;
}

function triggerFromEvent(event: AppEvent): CronRunTrigger {
  return event.event.startsWith("internal_scheduler.") ? "internal" : "external";
}

function statusFromEvent(event: AppEvent): CronRunStatus {
  if (event.event.endsWith(".failed") || event.level === "error") return "failed";
  if (event.level === "warn") return "warning";
  return "success";
}

function durationFromMetadata(metadata: Record<string, unknown> | undefined): number | undefined {
  const value = Number(metadata?.durationMs);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function summaryFromMetadata(metadata: Record<string, unknown> | undefined): Record<string, number | string | boolean> {
  if (!metadata) return {};
  const skip = new Set(["job", "trigger", "durationMs", "results", "error"]);
  const out: Record<string, number | string | boolean> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (skip.has(key)) continue;
    if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") out[key] = value;
  }
  return out;
}

function toRun(event: AppEvent): CronRun | null {
  const job = jobFromMetadata(event.metadata);
  if (!job) return null;
  const def = JOBS.find((item) => item.name === job);
  if (!def) return null;
  return {
    id: event.id,
    job,
    label: def.label,
    status: statusFromEvent(event),
    trigger: triggerFromEvent(event),
    event: event.event,
    createdAt: event.createdAt,
    durationMs: durationFromMetadata(event.metadata),
    reason: event.reason,
    summary: summaryFromMetadata(event.metadata),
    metadata: event.metadata,
  };
}

export async function GET(req: NextRequest) {
  return observePlatformRoute(req, "/api/platform/cron-runs", listCronRuns, req);
}

async function listCronRuns(req: NextRequest) {
  const ctx = await requirePlatform(req);
  if (!ctx.ok) return ctx.res;

  try {
    const params = req.nextUrl.searchParams;
    const job = text(params, "job", 40);
    const limit = Math.min(500, Math.max(20, numberParam(params, "limit") ?? 200));
    const events = await listAppEvents({ surface: "system", limit });
    const runs = events
      .filter((event) => (
        event.event === "platform.cron.completed" ||
        event.event === "platform.cron.failed" ||
        event.event === "internal_scheduler.job_completed" ||
        event.event === "internal_scheduler.job_failed"
      ))
      .map(toRun)
      .filter(Boolean) as CronRun[];
    const filteredRuns = job ? runs.filter((run) => run.job === job) : runs;
    const latestByJob = new Map<CronJobName, CronRun>();
    for (const run of runs) {
      if (!latestByJob.has(run.job)) latestByJob.set(run.job, run);
    }

    return NextResponse.json({
      jobs: JOBS.map((definition) => ({
        ...definition,
        lastRun: latestByJob.get(definition.name),
      })),
      runs: filteredRuns.slice(0, limit),
    });
  } catch (err) {
    console.error("[platform/cron-runs] failed:", err);
    return NextResponse.json({ error: "Could not load cron runs." }, { status: 500 });
  }
}
