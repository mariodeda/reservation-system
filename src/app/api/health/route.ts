import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/lib/reservations/mysql-pool";
import { observeSystemRoute } from "@/lib/observability/route-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/health — liveness + readiness probe for load balancers and monitoring. */
export async function GET(req: NextRequest) {
  return observeSystemRoute(req, "/api/health", health, req);
}

async function health(_req: NextRequest) {
  try {
    const pool = getPool();
    await pool.query("SELECT 1");
    return NextResponse.json({ ok: true, db: "up" });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
