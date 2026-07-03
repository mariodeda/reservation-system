import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { observeSystemRoute } from "@/lib/observability/route-events";
import { runDishSyncCron } from "@/lib/reservations/dish-sync";
import { requirePlatform } from "@/lib/reservations/tenant-context";

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
    const ctx = await requirePlatform(req);
    if (!ctx.ok) return ctx.res;
  }

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

  return NextResponse.json({
    ok: totals.failed === 0,
    tenants: results.length,
    ...totals,
    results,
  });
}
