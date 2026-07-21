import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { recordAppEvent } from "@/lib/observability/app-event-store";
import { safeError } from "@/lib/observability/logger";
import { observeSystemRoute } from "@/lib/observability/route-events";
import { withSchedulerJobLock } from "@/lib/reservations/internal-scheduler";
import { runSmtpHealthChecks } from "@/lib/reservations/smtp-health";

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
  return observeSystemRoute(req, "/api/platform/cron/smtp-health", runCron, req);
}

async function runCron(req: NextRequest) {
  if (!hasCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  try {
    const results = await withSchedulerJobLock("smtp-health", runSmtpHealthChecks);
    if (!results) {
      await recordAppEvent({
        level: "info",
        event: "platform.cron.skipped",
        surface: "system",
        actorType: "system",
        reason: "scheduler_busy",
        metadata: {
          job: "smtp-health",
          trigger: "external",
          durationMs: Date.now() - startedAt,
        },
      });
      return NextResponse.json({ ok: true, skipped: true, reason: "scheduler_busy" }, { status: 202 });
    }
    const failed = results.filter((result) => result.status === "failed").length;
    const notConfigured = results.filter((result) => result.status === "not_configured").length;
    const ok = results.filter((result) => result.status === "ok").length;
    await recordAppEvent({
      level: failed > 0 ? "warn" : "info",
      event: "platform.cron.completed",
      surface: "system",
      actorType: "system",
      metadata: {
        job: "smtp-health",
        trigger: "external",
        durationMs: Date.now() - startedAt,
        checked: results.length,
        ok,
        failed,
        notConfigured,
        results: results.map((r) => ({
          tenantId: r.tenantId,
          status: r.status,
          reason: r.reason,
          checkedAt: r.checkedAt,
          latencyMs: r.latencyMs,
        })),
      },
    });
    return NextResponse.json({
      ok: true,
      checked: results.length,
      results: results.map((r) => ({
        tenantId: r.tenantId,
        status: r.status,
        reason: r.reason,
        checkedAt: r.checkedAt,
        latencyMs: r.latencyMs,
      })),
    });
  } catch (err) {
    await recordAppEvent({
      level: "error",
      event: "platform.cron.failed",
      surface: "system",
      actorType: "system",
      reason: err instanceof Error ? err.message : "SMTP health cron failed.",
      metadata: {
        job: "smtp-health",
        trigger: "external",
        durationMs: Date.now() - startedAt,
        error: safeError(err),
      },
    });
    throw err;
  }
}
