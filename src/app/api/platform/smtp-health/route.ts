import { NextResponse, type NextRequest } from "next/server";
import { observePlatformRoute } from "@/lib/observability/route-events";
import { runSmtpHealthChecks } from "@/lib/reservations/smtp-health";
import { requirePlatform } from "@/lib/reservations/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ctx = await requirePlatform(req);
  return observePlatformRoute(req, "/api/platform/smtp-health", runManualCheck, req, ctx);
}

async function runManualCheck(_req: NextRequest, ctx: Awaited<ReturnType<typeof requirePlatform>>) {
  if (!ctx.ok) return ctx.res;
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
