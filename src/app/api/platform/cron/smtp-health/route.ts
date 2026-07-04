import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { observeSystemRoute } from "@/lib/observability/route-events";
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
  const results = await runSmtpHealthChecks();
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
}
