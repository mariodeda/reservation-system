import { NextResponse, type NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { requireAdmin } from "@/lib/reservations/tenant-context";
import { getPool } from "@/lib/reservations/mysql-pool";
import { ensureSchema } from "@/lib/reservations/mysql-schema";
import { nowInTz } from "@/lib/reservations/availability";
import { observeAdminRoute } from "@/lib/observability/route-events";
import {
  externalReservationLabel,
  isExternalReservationSource,
  type ExternalReservationSource,
} from "@/lib/reservations/external-sources";
import type { ReservationSource } from "@/lib/reservations/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function periodDates(period: string, timezone: string): { from: string; to: string } {
  const days = period === "7d" ? 7 : period === "90d" ? 90 : period === "365d" ? 365 : 30;
  const to = new Date(`${nowInTz(timezone).dateStr}T00:00:00Z`);
  const from = new Date(to);
  from.setDate(from.getDate() - days + 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export async function GET(req: NextRequest) {
  return observeAdminRoute(req, "/api/admin/analytics", getAnalytics, req);
}

function sourceLabel(source: string): string {
  if (source === "web") return "Online";
  if (source === "admin") return "Staff";
  if (isExternalReservationSource(source as ReservationSource)) {
    return externalReservationLabel(source as ExternalReservationSource);
  }
  return source || "Unknown";
}

function rate(part: number, total: number): number {
  return total ? Math.round((part / total) * 1000) / 10 : 0;
}

async function getAnalytics(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;
  const tid = ctx.tenant.id;
  const period = req.nextUrl.searchParams.get("period") ?? "30d";
  const { from, to } = periodDates(period, ctx.tenant.settings.timezone || "UTC");

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

    // Source split. Keep the legacy bySource object for old clients, and expose
    // richer source analytics for external booking providers.
    const [srcRows] = await pool.query<RowDataPacket[]>(
      `SELECT source,
              COUNT(*) AS reservations,
              SUM(CASE WHEN status NOT IN ('cancelled','no_show') THEN 1 ELSE 0 END) AS activeReservations,
              SUM(CASE WHEN status NOT IN ('cancelled','no_show') THEN party_size ELSE 0 END) AS covers,
              SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
              SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) AS noShow,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
       FROM reservations
       WHERE tenant_id = ? AND \`date\` >= ? AND \`date\` <= ?
       GROUP BY source`,
      [tid, from, to],
    );
    const bySource: Record<string, number> = { web: 0, admin: 0, thefork: 0, dish: 0 };
    const rawSourceBreakdown = srcRows.map((r) => {
      const source = String(r.source || "web");
      const reservations = Number(r.reservations ?? 0);
      const activeReservations = Number(r.activeReservations ?? 0);
      const covers = Number(r.covers ?? 0);
      const cancelledCount = Number(r.cancelled ?? 0);
      const noShowCount = Number(r.noShow ?? 0);
      const completed = Number(r.completed ?? 0);
      bySource[source] = reservations;
      return {
        source,
        label: sourceLabel(source),
        external: isExternalReservationSource(source as ReservationSource),
        reservations,
        activeReservations,
        covers,
        cancelled: cancelledCount,
        noShow: noShowCount,
        completed,
      };
    });
    const sourceReservationTotal = rawSourceBreakdown.reduce((sum, row) => sum + row.reservations, 0);
    const sourceCoverTotal = rawSourceBreakdown.reduce((sum, row) => sum + row.covers, 0);
    const sourceBreakdown = rawSourceBreakdown
      .map((row) => ({
        ...row,
        reservationShare: rate(row.reservations, sourceReservationTotal),
        coverShare: rate(row.covers, sourceCoverTotal),
        cancellationRate: rate(row.cancelled, row.reservations),
        noShowRate: rate(row.noShow, row.reservations),
      }))
      .sort((a, b) => b.reservations - a.reservations);
    const externalProviders = sourceBreakdown.filter((row) => row.external);
    const externalReservations = externalProviders.reduce((sum, row) => sum + row.reservations, 0);
    const externalCovers = externalProviders.reduce((sum, row) => sum + row.covers, 0);
    const externalSummary = {
      reservations: externalReservations,
      activeReservations: externalProviders.reduce((sum, row) => sum + row.activeReservations, 0),
      covers: externalCovers,
      cancelled: externalProviders.reduce((sum, row) => sum + row.cancelled, 0),
      noShow: externalProviders.reduce((sum, row) => sum + row.noShow, 0),
      reservationShare: rate(externalReservations, sourceReservationTotal),
      coverShare: rate(externalCovers, sourceCoverTotal),
      providers: externalProviders,
    };

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

    // Review-request summary for reservations within the period.
    const [fbRows] = await pool.query<RowDataPacket[]>(
      `SELECT
         COUNT(e.id) AS total_sent
       FROM reservation_emails e
       JOIN reservations r ON r.id = e.reservation_id AND r.tenant_id = e.tenant_id
       WHERE e.tenant_id = ? AND e.type = 'feedbackRequest' AND e.status = 'sent'
         AND r.\`date\` >= ? AND r.\`date\` <= ?`,
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
      sourceBreakdown,
      externalSummary,
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
