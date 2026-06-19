import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "./mysql-pool";
import { ensureSchema } from "./mysql-schema";
import type { CustomerProfile, Reservation } from "./types";

const RES_COLS =
  "id, `date`, `time`, offering, service, party_size AS partySize, name, email, phone, occasion, notes, table_label AS tableLabel, status, source, created_at AS createdAt, updated_at AS updatedAt";

interface ResRow extends RowDataPacket {
  id: string; date: string; time: string; offering: string; service: string;
  partySize: number; name: string; email: string; phone: string;
  occasion: string | null; notes: string | null; tableLabel: string | null;
  status: Reservation["status"]; source: Reservation["source"];
  createdAt: string; updatedAt: string;
}

function toRes(r: ResRow): Reservation {
  return {
    id: r.id, date: r.date, time: r.time, offering: r.offering || "main", service: r.service,
    partySize: r.partySize, name: r.name, email: r.email, phone: r.phone,
    occasion: r.occasion ?? undefined, notes: r.notes ?? undefined,
    tableLabel: r.tableLabel ?? undefined,
    status: r.status, source: r.source, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

interface StatsRow extends RowDataPacket {
  email: string;
  name: string;
  phone: string;
  visitCount: number;
  totalCovers: number;
  noShowCount: number;
  cancelledCount: number;
  lastVisit: string | null;
  firstVisit: string | null;
  vip: number | null;
  staffNotes: string | null;
  dietaryNotes: string | null;
  updatedAt: string | null;
}

function toProfile(r: StatsRow): CustomerProfile {
  return {
    email: r.email,
    name: r.name || r.email,
    phone: r.phone || "",
    vip: Boolean(r.vip),
    staffNotes: r.staffNotes ?? undefined,
    dietaryNotes: r.dietaryNotes ?? undefined,
    visitCount: Number(r.visitCount) || 0,
    totalCovers: Number(r.totalCovers) || 0,
    noShowCount: Number(r.noShowCount) || 0,
    cancelledCount: Number(r.cancelledCount) || 0,
    firstVisit: r.firstVisit ?? undefined,
    lastVisit: r.lastVisit ?? undefined,
    updatedAt: r.updatedAt ?? undefined,
  };
}

const STATS_SELECT = `
  LOWER(TRIM(r.email)) AS email,
  MAX(r.name) AS name,
  MAX(r.phone) AS phone,
  SUM(CASE WHEN r.status NOT IN ('cancelled','no_show') THEN 1 ELSE 0 END) AS visitCount,
  SUM(CASE WHEN r.status NOT IN ('cancelled','no_show') THEN r.party_size ELSE 0 END) AS totalCovers,
  SUM(CASE WHEN r.status = 'no_show' THEN 1 ELSE 0 END) AS noShowCount,
  SUM(CASE WHEN r.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelledCount,
  MAX(CASE WHEN r.status NOT IN ('cancelled','no_show') THEN r.date ELSE NULL END) AS lastVisit,
  MIN(CASE WHEN r.status NOT IN ('cancelled','no_show') THEN r.date ELSE NULL END) AS firstVisit,
  MAX(cp.vip) AS vip,
  MAX(cp.staff_notes) AS staffNotes,
  MAX(cp.dietary_notes) AS dietaryNotes,
  MAX(cp.updated_at) AS updatedAt`;

export class CustomerStore {
  constructor(private readonly tenantId: string) {}

  async listCustomers(options: {
    q?: string;
    page?: number;
    limit?: number;
    sortBy?: "lastVisit" | "name" | "visits";
  } = {}): Promise<{ customers: CustomerProfile[]; total: number }> {
    await ensureSchema();
    const limit = Math.min(100, options.limit ?? 50);
    const offset = ((options.page ?? 1) - 1) * limit;
    const q = options.q?.trim().toLowerCase() || "";
    // Escape LIKE metacharacters so a literal '%' or '_' in the search term
    // doesn't act as a wildcard and matches only the intended substring.
    const qEsc = q.replace(/[%_\\]/g, "\\$&");

    const searchCond = q
      ? " AND (LOWER(r.name) LIKE ? ESCAPE '\\\\' OR LOWER(r.email) LIKE ? ESCAPE '\\\\' OR r.phone LIKE ? ESCAPE '\\\\')"
      : "";
    const searchParams = q ? [`%${qEsc}%`, `%${qEsc}%`, `%${qEsc}%`] : [];

    const orderBy =
      options.sortBy === "name" ? "MAX(r.name) ASC"
      : options.sortBy === "visits" ? "visitCount DESC"
      : "MAX(r.created_at) DESC";

    const [countRows] = await getPool().query<RowDataPacket[]>(
      `SELECT COUNT(DISTINCT LOWER(TRIM(r.email))) AS total
       FROM reservations r
       WHERE r.tenant_id = ? AND TRIM(r.email) != ''${searchCond}`,
      [this.tenantId, ...searchParams],
    );
    const total = Number((countRows[0] as RowDataPacket).total) || 0;
    if (total === 0) return { customers: [], total: 0 };

    const [rows] = await getPool().query<StatsRow[]>(
      `SELECT ${STATS_SELECT}
       FROM reservations r
       LEFT JOIN customer_profiles cp
         ON cp.tenant_id = r.tenant_id AND LOWER(TRIM(cp.email)) = LOWER(TRIM(r.email))
       WHERE r.tenant_id = ? AND TRIM(r.email) != ''${searchCond}
       GROUP BY LOWER(TRIM(r.email))
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [this.tenantId, ...searchParams, limit, offset],
    );

    return { customers: rows.map(toProfile), total };
  }

  async getCustomerDetail(
    email: string,
  ): Promise<{ profile: CustomerProfile; reservations: Reservation[] } | null> {
    await ensureSchema();
    const norm = email.trim().toLowerCase();

    const [statsRows] = await getPool().query<StatsRow[]>(
      `SELECT ${STATS_SELECT}
       FROM reservations r
       LEFT JOIN customer_profiles cp
         ON cp.tenant_id = r.tenant_id AND LOWER(TRIM(cp.email)) = ?
       WHERE r.tenant_id = ? AND LOWER(TRIM(r.email)) = ?
       GROUP BY LOWER(TRIM(r.email))`,
      [norm, this.tenantId, norm],
    );
    if (!statsRows.length) return null;

    const [resRows] = await getPool().query<ResRow[]>(
      `SELECT ${RES_COLS} FROM reservations
       WHERE tenant_id = ? AND LOWER(TRIM(email)) = ?
       ORDER BY \`date\` DESC, \`time\` DESC`,
      [this.tenantId, norm],
    );

    return { profile: toProfile(statsRows[0]), reservations: resRows.map(toRes) };
  }

  async upsertProfile(
    email: string,
    data: { vip: boolean; staffNotes: string | null; dietaryNotes: string | null },
  ): Promise<void> {
    await ensureSchema();
    const norm = email.trim().toLowerCase();
    const now = new Date().toISOString();
    await getPool().query(
      `INSERT INTO customer_profiles (id, tenant_id, email, vip, staff_notes, dietary_notes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         vip = VALUES(vip),
         staff_notes = VALUES(staff_notes),
         dietary_notes = VALUES(dietary_notes),
         updated_at = VALUES(updated_at)`,
      [randomUUID(), this.tenantId, norm, data.vip ? 1 : 0, data.staffNotes, data.dietaryNotes, now],
    );
  }

  /** Batch-fetch per-email enrichment for a day's reservation list. */
  async getReservationEnrichments(
    emails: string[],
  ): Promise<Map<string, { visitCount: number; customerVip: boolean; dietaryNotes?: string }>> {
    const norms = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
    if (!norms.length) return new Map();
    await ensureSchema();

    const ph = norms.map(() => "?").join(",");

    const [vcRows] = await getPool().query<RowDataPacket[]>(
      `SELECT LOWER(TRIM(email)) AS email,
         SUM(CASE WHEN status NOT IN ('cancelled','no_show') THEN 1 ELSE 0 END) AS cnt
       FROM reservations
       WHERE tenant_id = ? AND LOWER(TRIM(email)) IN (${ph})
       GROUP BY LOWER(TRIM(email))`,
      [this.tenantId, ...norms],
    );

    const [profRows] = await getPool().query<RowDataPacket[]>(
      `SELECT LOWER(TRIM(email)) AS email, vip, dietary_notes AS dietaryNotes
       FROM customer_profiles
       WHERE tenant_id = ? AND LOWER(TRIM(email)) IN (${ph})`,
      [this.tenantId, ...norms],
    );

    const vcMap = new Map<string, number>();
    for (const r of vcRows) vcMap.set(r.email as string, Number(r.cnt));

    const profMap = new Map<string, { vip: boolean; dietaryNotes?: string }>();
    for (const r of profRows) {
      profMap.set(r.email as string, {
        vip: Boolean(r.vip),
        dietaryNotes: (r.dietaryNotes as string | null) ?? undefined,
      });
    }

    const result = new Map<string, { visitCount: number; customerVip: boolean; dietaryNotes?: string }>();
    for (const email of norms) {
      const prof = profMap.get(email);
      result.set(email, {
        visitCount: vcMap.get(email) ?? 0,
        customerVip: prof?.vip ?? false,
        dietaryNotes: prof?.dietaryNotes,
      });
    }
    return result;
  }
}

const storeCache = new Map<string, CustomerStore>();

export function getCustomerStore(tenantId: string): CustomerStore {
  let s = storeCache.get(tenantId);
  if (!s) {
    s = new CustomerStore(tenantId);
    storeCache.set(tenantId, s);
  }
  return s;
}

export function resetCustomerStoreCache(): void {
  storeCache.clear();
}
