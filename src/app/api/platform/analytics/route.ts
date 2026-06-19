import { NextResponse, type NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { requirePlatform } from "@/lib/reservations/tenant-context";
import { getPool } from "@/lib/reservations/mysql-pool";
import { ensureSchema } from "@/lib/reservations/mysql-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await requirePlatform(req);
  if (!ctx.ok) return ctx.res;

  try {
    await ensureSchema();
    const pool = getPool();

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff = thirtyDaysAgo.toISOString().slice(0, 10);

    // Per-tenant stats
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
         r.tenant_id,
         COUNT(*) AS total,
         SUM(CASE WHEN r.date >= ? THEN 1 ELSE 0 END) AS last30,
         SUM(CASE WHEN r.status NOT IN ('cancelled','no_show') THEN r.party_size ELSE 0 END) AS totalCovers,
         SUM(CASE WHEN r.status = 'no_show' THEN 1 ELSE 0 END) AS noShows,
         SUM(CASE WHEN r.status = 'cancelled' THEN 1 ELSE 0 END) AS cancellations,
         MAX(r.date) AS lastBookingDate
       FROM reservations r
       GROUP BY r.tenant_id`,
      [cutoff],
    );

    const byTenant: Record<string, {
      total: number;
      last30: number;
      totalCovers: number;
      noShows: number;
      cancellations: number;
      lastBookingDate: string | null;
    }> = {};

    for (const r of rows) {
      byTenant[r.tenant_id as string] = {
        total: Number(r.total),
        last30: Number(r.last30),
        totalCovers: Number(r.totalCovers),
        noShows: Number(r.noShows),
        cancellations: Number(r.cancellations),
        lastBookingDate: (r.lastBookingDate as string | null) ?? null,
      };
    }

    // Platform-wide totals
    const [totRow] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN date >= ? THEN 1 ELSE 0 END) AS last30,
              COUNT(DISTINCT tenant_id) AS tenants
       FROM reservations`,
      [cutoff],
    );

    return NextResponse.json({
      totals: {
        reservations: Number(totRow[0]?.total ?? 0),
        last30: Number(totRow[0]?.last30 ?? 0),
        tenants: Number(totRow[0]?.tenants ?? 0),
      },
      byTenant,
    });
  } catch (err) {
    console.error("[platform/analytics] failed:", err);
    return NextResponse.json({ error: "Could not load analytics." }, { status: 500 });
  }
}
