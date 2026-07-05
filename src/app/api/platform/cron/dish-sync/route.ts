import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { recordAppEvent } from "@/lib/observability/app-event-store";
import { safeError } from "@/lib/observability/logger";
import { observeSystemRoute } from "@/lib/observability/route-events";
import { runDishSyncCron } from "@/lib/reservations/dish-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function hasCronAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!secret || !token) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  return observeSystemRoute(req, "/api/platform/cron/dish-sync", runCron, req);
}

async function runCron(req: NextRequest) {
  if (!hasCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const results = await runDishSyncCron();
    const totals = results.reduce(
      (acc, result) => {
        acc.imported += result.imported;
        acc.updated += result.updated;
        acc.skipped += result.skipped;
        acc.errors += result.errors;
        if (result.ok) acc.successful += 1;
        else acc.failed += 1;
        return acc;
      },
      { successful: 0, failed: 0, imported: 0, updated: 0, skipped: 0, errors: 0 },
    );
    await recordAppEvent({
      level: totals.failed === 0 ? "info" : "warn",
      event: "platform.cron.completed",
      surface: "system",
      actorType: "system",
      metadata: {
        job: "dish-sync",
        trigger: "external",
        durationMs: Date.now() - startedAt,
        tenants: results.length,
        ...totals,
        results,
      },
    });

    return NextResponse.json({
      ok: totals.failed === 0,
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
      reason: err instanceof Error ? err.message : "DISH sync cron failed.",
      metadata: {
        job: "dish-sync",
        trigger: "external",
        durationMs: Date.now() - startedAt,
        error: safeError(err),
      },
    });
    throw err;
  }
}
