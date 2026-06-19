import { NextResponse, type NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { requireAdmin } from "@/lib/reservations/tenant-context";
import { getPool } from "@/lib/reservations/mysql-pool";
import { ensureSchema } from "@/lib/reservations/mysql-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function periodDates(period: string): { from: string; to: string } {
  const days = period === "7d" ? 7 : period === "90d" ? 90 : period === "365d" ? 365 : 30;
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - days + 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;
  const tid = ctx.tenant.id;
  const period = req.nextUrl.searchParams.get("period") ?? "30d";
  const { from, to } = periodDates(period);

  try {
    await ensureSchema();
    const pool = getPool();

    // Daily covers + reservations
    const [dayRows] = await pool.query<RowDataPacket[]>(
      `SELECT \`date\`, COUNT(*) AS reservations, SUM(party_size) AS covers
       FROM reservations
       WHERE tenant_id = ? AND \`date\` >= ? AND \`date\` <= ?
         AND status NOT IN ('cancelled','no_show')
       GROUP BY \`date\` ORDER BY \`date\``,
      [tid, from, to],
    );

    // Status breakdown
    const [statusRows] = await pool.query<RowDataPacket[]>(
      `SELECT status, COUNT(*) AS cnt FROM reservations
       WHERE tenant_id = ? AND \`date\` >= ? AND \`date\` <= ?
       GROUP BY status`,
      [tid, from, to],
    );
    const byStatus: Record<string, number> = {};
    for (const r of statusRows) byStatus[r.status as string] = Number(r.cnt);

    // Source split
    const [srcRows] = await pool.query<RowDataPacket[]>(
      `SELECT source, COUNT(*) AS cnt FROM reservations
       WHERE tenant_id = ? AND \`date\` >= ? AND \`date\` <= ?
       GROUP BY source`,
      [tid, from, to],
    );
    const bySource: Record<string, number> = { web: 0, admin: 0 };
    for (const r of srcRows) bySource[r.source as string] = Number(r.cnt);

    // By offering + service (service ids are only unique within an offering).
    // COALESCE so any pre-migration NULL/'' rows fold into 'main' rather than
    // forming a separate duplicate bucket.
    const [svcRows] = await pool.query<RowDataPacket[]>(
      `SELECT COALESCE(NULLIF(offering,''),'main') AS offering, service, COUNT(*) AS reservations, SUM(party_size) AS covers
       FROM reservations
       WHERE tenant_id = ? AND \`date\` >= ? AND \`date\` <= ?
         AND status NOT IN ('cancelled','no_show')
       GROUP BY COALESCE(NULLIF(offering,''),'main'), service ORDER BY reservations DESC`,
      [tid, from, to],
    );

    // By offering (rolled up)
    const [offRows] = await pool.query<RowDataPacket[]>(
      `SELECT COALESCE(NULLIF(offering,''),'main') AS offering, COUNT(*) AS reservations, SUM(party_size) AS covers
       FROM reservations
       WHERE tenant_id = ? AND \`date\` >= ? AND \`date\` <= ?
         AND status NOT IN ('cancelled','no_show')
       GROUP BY COALESCE(NULLIF(offering,''),'main') ORDER BY reservations DESC`,
      [tid, from, to],
    );

    // Avg party size + avg lead days
    const [aggRow] = await pool.query<RowDataPacket[]>(
      `SELECT AVG(party_size) AS avgPartySize,
              AVG(DATEDIFF(\`date\`, DATE(created_at))) AS avgLeadDays
       FROM reservations
       WHERE tenant_id = ? AND \`date\` >= ? AND \`date\` <= ?
         AND status NOT IN ('cancelled','no_show')`,
      [tid, from, to],
    );

    // New vs returning (based on first-ever reservation date)
    const [nvrRows] = await pool.query<RowDataPacket[]>(
      `SELECT
         SUM(CASE WHEN g.first_date >= ? THEN 1 ELSE 0 END) AS new_guests,
         SUM(CASE WHEN g.first_date < ? THEN 1 ELSE 0 END) AS returning_guests
       FROM (
         SELECT LOWER(TRIM(email)) AS email, MIN(\`date\`) AS first_date
         FROM reservations WHERE tenant_id = ? GROUP BY LOWER(TRIM(email))
       ) AS g
       WHERE g.email IN (
         SELECT DISTINCT LOWER(TRIM(email)) FROM reservations
         WHERE tenant_id = ? AND \`date\` >= ? AND \`date\` <= ?
           AND status NOT IN ('cancelled','no_show') AND TRIM(email) != ''
       )`,
      [from, from, tid, tid, from, to],
    );

    // Feedback summary for reservations within the period
    const [fbRows] = await pool.query<RowDataPacket[]>(
      `SELECT
         COUNT(f.token) AS total_sent,
         COUNT(f.filled_at) AS total_filled,
         AVG(f.rating) AS avg_rating,
         SUM(CASE WHEN f.rating = 1 THEN 1 ELSE 0 END) AS r1,
         SUM(CASE WHEN f.rating = 2 THEN 1 ELSE 0 END) AS r2,
         SUM(CASE WHEN f.rating = 3 THEN 1 ELSE 0 END) AS r3,
         SUM(CASE WHEN f.rating = 4 THEN 1 ELSE 0 END) AS r4,
         SUM(CASE WHEN f.rating = 5 THEN 1 ELSE 0 END) AS r5
       FROM reservation_feedback f
       JOIN reservations r ON r.id = f.reservation_id
       WHERE f.tenant_id = ? AND r.\`date\` >= ? AND r.\`date\` <= ?`,
      [tid, from, to],
    );
    const fb = fbRows[0] ?? {};

    // No-show / cancellation rates (over ALL reservations in the period).
    const totalAll = Object.values(byStatus).reduce((s, n) => s + n, 0);
    const noShow = byStatus.no_show ?? 0;
    const cancelled = byStatus.cancelled ?? 0;
    const rates = {
      total: totalAll,
      noShow,
      cancelled,
      noShowRate: totalAll ? Math.round((noShow / totalAll) * 1000) / 10 : 0,
      cancelledRate: totalAll ? Math.round((cancelled / totalAll) * 1000) / 10 : 0,
    };

    // Peak demand — weekday (0=Sun…6=Sat) × hour-of-day covers heatmap.
    const [heatRows] = await pool.query<RowDataPacket[]>(
      `SELECT (DAYOFWEEK(\`date\`) - 1) AS weekday, CAST(SUBSTRING(\`time\`,1,2) AS UNSIGNED) AS hour,
              COUNT(*) AS reservations, SUM(party_size) AS covers
       FROM reservations
       WHERE tenant_id = ? AND \`date\` >= ? AND \`date\` <= ?
         AND status NOT IN ('cancelled','no_show')
       GROUP BY weekday, hour`,
      [tid, from, to],
    );

    // Party-size distribution.
    const [partyRows] = await pool.query<RowDataPacket[]>(
      `SELECT party_size AS size, COUNT(*) AS reservations
       FROM reservations
       WHERE tenant_id = ? AND \`date\` >= ? AND \`date\` <= ?
         AND status NOT IN ('cancelled','no_show')
       GROUP BY party_size ORDER BY party_size`,
      [tid, from, to],
    );

    // Table utilization — covers + turns per managed table (new in Phase 1).
    const [tableRows] = await pool.query<RowDataPacket[]>(
      `SELECT r.table_id AS tableId, t.label AS label,
              COUNT(*) AS turns, SUM(r.party_size) AS covers
       FROM reservations r
       JOIN tables t ON t.id = r.table_id AND t.tenant_id = r.tenant_id
       WHERE r.tenant_id = ? AND r.\`date\` >= ? AND r.\`date\` <= ?
         AND r.table_id IS NOT NULL AND r.status NOT IN ('cancelled','no_show')
       GROUP BY r.table_id, t.label ORDER BY covers DESC`,
      [tid, from, to],
    );

    // Waitlist summary (new in Phase 2).
    const [wlRows] = await pool.query<RowDataPacket[]>(
      `SELECT status, COUNT(*) AS cnt, AVG(quoted_wait_min) AS avgQuoted
       FROM waitlist
       WHERE tenant_id = ? AND \`date\` >= ? AND \`date\` <= ?
       GROUP BY status`,
      [tid, from, to],
    );
    const wlByStatus: Record<string, number> = {};
    let wlQuotedSum = 0;
    let wlQuotedCount = 0;
    for (const r of wlRows) {
      wlByStatus[r.status as string] = Number(r.cnt);
      if (r.avgQuoted != null) {
        wlQuotedSum += Number(r.avgQuoted) * Number(r.cnt);
        wlQuotedCount += Number(r.cnt);
      }
    }
    const wlTotal = Object.values(wlByStatus).reduce((s, n) => s + n, 0);
    const wlSeated = wlByStatus.seated ?? 0;
    const waitlist = {
      total: wlTotal,
      seated: wlSeated,
      left: wlByStatus.left ?? 0,
      expired: wlByStatus.expired ?? 0,
      waiting: (wlByStatus.waiting ?? 0) + (wlByStatus.notified ?? 0),
      avgQuotedWait: wlQuotedCount ? Math.round(wlQuotedSum / wlQuotedCount) : 0,
      conversionRate: wlTotal ? Math.round((wlSeated / wlTotal) * 1000) / 10 : 0,
    };

    return NextResponse.json({
      period,
      from,
      to,
      byDay: dayRows.map((r) => ({
        date: r.date as string,
        reservations: Number(r.reservations),
        covers: Number(r.covers),
      })),
      byStatus,
      bySource,
      byService: svcRows.map((r) => ({
        offering: (r.offering as string) || "main",
        service: r.service as string,
        reservations: Number(r.reservations),
        covers: Number(r.covers),
      })),
      byOffering: offRows.map((r) => ({
        offering: (r.offering as string) || "main",
        reservations: Number(r.reservations),
        covers: Number(r.covers),
      })),
      avgPartySize: Number(aggRow[0]?.avgPartySize ?? 0) || 0,
      avgLeadDays: Number(aggRow[0]?.avgLeadDays ?? 0) || 0,
      newVsReturning: {
        new: Number(nvrRows[0]?.new_guests ?? 0),
        returning: Number(nvrRows[0]?.returning_guests ?? 0),
      },
      feedback: {
        sent: Number(fb.total_sent ?? 0),
        filled: Number(fb.total_filled ?? 0),
        avgRating: fb.avg_rating != null ? Math.round(Number(fb.avg_rating) * 10) / 10 : null,
        byRating: [1, 2, 3, 4, 5].map((s) => Number(fb[`r${s}`] ?? 0)),
      },
      rates,
      heatmap: heatRows.map((r) => ({
        weekday: Number(r.weekday),
        hour: Number(r.hour),
        reservations: Number(r.reservations),
        covers: Number(r.covers),
      })),
      partySizes: partyRows.map((r) => ({
        size: Number(r.size),
        reservations: Number(r.reservations),
      })),
      tableUtilization: tableRows.map((r) => ({
        tableId: r.tableId as string,
        label: r.label as string,
        turns: Number(r.turns),
        covers: Number(r.covers),
      })),
      waitlist,
    });
  } catch (err) {
    console.error("[analytics] failed:", err);
    return NextResponse.json({ error: "Could not load analytics." }, { status: 500 });
  }
}
