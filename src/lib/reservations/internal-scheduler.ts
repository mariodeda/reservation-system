import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { recordAppEvent } from "@/lib/observability/app-event-store";
import { safeError } from "@/lib/observability/logger";
import { runDishSyncCron } from "./dish-sync";
import { runDueFeedbackRequestCron } from "./feedback-automation";
import { getPool } from "./mysql-pool";
import { runSmtpHealthChecks } from "./smtp-health";

type SchedulerGlobal = typeof globalThis & {
  __reservationInternalScheduler?: { timers: NodeJS.Timeout[] };
};

type InternalJob = {
  name: string;
  everyMs: number;
  initialDelayMs: number;
  run: () => Promise<unknown>;
};

interface LockRow extends RowDataPacket {
  locked: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

async function withNamedLock<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  let conn: PoolConnection | undefined;
  try {
    conn = await getPool().getConnection();
    const [rows] = await conn.query<LockRow[]>("SELECT GET_LOCK(?, 0) AS locked", [name]);
    if (Number(rows[0]?.locked) !== 1) return undefined;
    try {
      return await fn();
    } finally {
      await conn.query("SELECT RELEASE_LOCK(?)", [name]).catch(() => {});
    }
  } finally {
    conn?.release();
  }
}

async function runJob(job: InternalJob) {
  await withNamedLock(`reservation-system:${job.name}`, async () => {
    const startedAt = Date.now();
    try {
      await job.run();
      await recordAppEvent({
        level: "info",
        event: "internal_scheduler.job_completed",
        surface: "system",
        actorType: "system",
        metadata: {
          job: job.name,
          durationMs: Date.now() - startedAt,
        },
      });
    } catch (err) {
      await recordAppEvent({
        level: "error",
        event: "internal_scheduler.job_failed",
        surface: "system",
        actorType: "system",
        reason: err instanceof Error ? err.message : "Internal scheduled job failed.",
        metadata: {
          job: job.name,
          durationMs: Date.now() - startedAt,
          error: safeError(err),
        },
      });
    }
  });
}

function scheduleJob(job: InternalJob): NodeJS.Timeout[] {
  const timers: NodeJS.Timeout[] = [];
  const fire = () => runJob(job).catch((err) => console.error(`[scheduler] ${job.name} failed`, err));
  const first = setTimeout(() => {
    fire();
    const interval = setInterval(fire, job.everyMs);
    interval.unref?.();
    timers.push(interval);
  }, job.initialDelayMs);
  first.unref?.();
  timers.push(first);
  return timers;
}

export function startInternalScheduler() {
  if (process.env.INTERNAL_SCHEDULER_DISABLED === "1") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NODE_ENV !== "production" && process.env.INTERNAL_SCHEDULER_ENABLED !== "1") return;
  const g = globalThis as SchedulerGlobal;
  if (g.__reservationInternalScheduler) return;

  const jobs: InternalJob[] = [
    {
      name: "dish-sync",
      everyMs: 15 * MINUTE,
      initialDelayMs: 30_000,
      run: runDishSyncCron,
    },
    {
      name: "feedback-requests",
      everyMs: 30 * MINUTE,
      initialDelayMs: 60_000,
      run: runDueFeedbackRequestCron,
    },
    {
      name: "smtp-health",
      everyMs: 6 * HOUR,
      initialDelayMs: 90_000,
      run: runSmtpHealthChecks,
    },
  ];

  const timers = jobs.flatMap(scheduleJob);
  g.__reservationInternalScheduler = { timers };
  void recordAppEvent({
    level: "info",
    event: "internal_scheduler.started",
    surface: "system",
    actorType: "system",
    metadata: {
      jobs: jobs.map((job) => ({ name: job.name, everyMs: job.everyMs })),
    },
  }).catch((err) => console.error("[scheduler] could not record startup", err));
}
