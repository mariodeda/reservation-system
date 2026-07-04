import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { observeSystemRoute } from "@/lib/observability/route-events";
import { runDueFeedbackRequestCron } from "@/lib/reservations/feedback-automation";

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
  return observeSystemRoute(req, "/api/platform/cron/feedback-requests", runCron, req);
}

async function runCron(req: NextRequest) {
  if (!hasCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runDueFeedbackRequestCron();
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

  return NextResponse.json({
    ok: true,
    tenants: results.length,
    ...totals,
    results,
  });
}
