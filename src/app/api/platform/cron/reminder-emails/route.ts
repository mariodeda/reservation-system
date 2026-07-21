import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { recordAppEvent } from "@/lib/observability/app-event-store";
import { safeError } from "@/lib/observability/logger";
import { observeSystemRoute } from "@/lib/observability/route-events";
import { withSchedulerJobLock } from "@/lib/reservations/internal-scheduler";
import { runDueReservationReminderCron } from "@/lib/reservations/reminder-automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasCronAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!secret || !token) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  return observeSystemRoute(req, "/api/platform/cron/reminder-emails", runCron, req);
}

async function runCron(req: NextRequest) {
  if (!hasCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const results = await withSchedulerJobLock("reminder-emails", runDueReservationReminderCron);
    if (!results) {
      await recordAppEvent({
        level: "info",
        event: "platform.cron.skipped",
        surface: "system",
        actorType: "system",
        reason: "scheduler_busy",
        metadata: {
          job: "reminder-emails",
          trigger: "external",
          durationMs: Date.now() - startedAt,
        },
      });
      return NextResponse.json({ ok: true, skipped: true, reason: "scheduler_busy" }, { status: 202 });
    }
    const totals = results.reduce(
      (acc, result) => {
        acc.processed += result.processed;
        acc.sent += result.sent;
        acc.skipped += result.skipped;
        acc.failed += result.failed;
        return acc;
      },
      { processed: 0, sent: 0, skipped: 0, failed: 0 },
    );
    await recordAppEvent({
      level: totals.failed === 0 ? "info" : "warn",
      event: "platform.cron.completed",
      surface: "system",
      actorType: "system",
      metadata: {
        job: "reminder-emails",
        trigger: "external",
        durationMs: Date.now() - startedAt,
        tenants: results.length,
        ...totals,
        results,
      },
    });

    return NextResponse.json({
      ok: true,
      tenants: results.length,
      ...totals,
      results,
    });
  } catch (err) {
    await recordAppEvent({
      level: "error",
      event: "platform.cron.failed",
      surface: "system",
      actorType: "system",
      reason: err instanceof Error ? err.message : "Reminder email cron failed.",
      metadata: {
        job: "reminder-emails",
        trigger: "external",
        durationMs: Date.now() - startedAt,
        error: safeError(err),
      },
    });
    throw err;
  }
}
