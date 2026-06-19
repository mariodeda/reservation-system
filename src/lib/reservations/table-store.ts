import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "./mysql-pool";
import { ensureSchema } from "./mysql-schema";
import {
  ACTIVE_STATUSES,
  type AvailabilityConfig,
  type NewTableInput,
  type Reservation,
  type RestaurantTable,
  type TableState,
} from "./types";
import { offeringOf } from "./offerings";
import { nowInTz, toMinutes, turnMinutesFor, turnsOverlap } from "./availability";

/**
 * Tenant-scoped physical-table management. A table is a real piece of furniture:
 * it can host at most one party during any overlapping turn window, regardless
 * of offering. Conflict detection is therefore offering-agnostic; the optional
 * `offering` binding only restricts *which* offering may be seated at a table.
 */

const TBL_COLUMNS =
  "id, offering, label, capacity, min_party AS minParty, zone, sort_order AS sortOrder, joinable, active, created_at AS createdAt";

interface TblRow extends RowDataPacket {
  id: string;
  offering: string | null;
  label: string;
  capacity: number;
  minParty: number;
  zone: string | null;
  sortOrder: number;
  joinable: number;
  active: number;
  createdAt: string;
}

function toTable(r: TblRow): RestaurantTable {
  return {
    id: r.id,
    offering: r.offering ?? null,
    label: r.label,
    capacity: Number(r.capacity),
    minParty: Number(r.minParty),
    zone: r.zone ?? undefined,
    sortOrder: Number(r.sortOrder),
    joinable: Boolean(r.joinable),
    active: Boolean(r.active),
    createdAt: r.createdAt,
  };
}

/** Minimal reservation shape needed for conflict/occupancy logic. */
interface AssignedRow extends RowDataPacket {
  id: string;
  date: string;
  time: string;
  offering: string;
  service: string;
  partySize: number;
  name: string;
  status: Reservation["status"];
  tableId: string | null;
}

export interface TableDayState {
  table: RestaurantTable;
  state: TableState;
  /** Active bookings assigned to this table on the day, ordered by time. */
  reservations: {
    id: string;
    time: string;
    partySize: number;
    name: string;
    status: Reservation["status"];
    service: string;
  }[];
}

export interface AssignResult {
  reservation?: Reservation;
  error?: string;
}

export class TableStore {
  constructor(private readonly tenantId: string) {}

  async listTables(
    opts: { activeOnly?: boolean; offering?: string } = {},
  ): Promise<RestaurantTable[]> {
    await ensureSchema();
    const where: string[] = ["tenant_id = ?"];
    const params: unknown[] = [this.tenantId];
    if (opts.activeOnly) where.push("active = 1");
    if (opts.offering) {
      // A table bound to no offering (NULL) is usable everywhere, so it matches.
      where.push("(offering = ? OR offering IS NULL)");
      params.push(opts.offering);
    }
    const [rows] = await getPool().query<TblRow[]>(
      `SELECT ${TBL_COLUMNS} FROM tables WHERE ${where.join(" AND ")} ORDER BY sort_order, label`,
      params,
    );
    return rows.map(toTable);
  }

  async getTable(id: string): Promise<RestaurantTable | null> {
    await ensureSchema();
    const [rows] = await getPool().query<TblRow[]>(
      `SELECT ${TBL_COLUMNS} FROM tables WHERE id = ? AND tenant_id = ?`,
      [id, this.tenantId],
    );
    return rows.length ? toTable(rows[0]) : null;
  }

  async createTable(input: NewTableInput): Promise<RestaurantTable> {
    await ensureSchema();
    const table: RestaurantTable = {
      id: randomUUID(),
      offering: input.offering && input.offering.length > 0 ? input.offering : null,
      label: input.label.trim().slice(0, 50),
      capacity: Math.max(1, Math.trunc(Number(input.capacity)) || 1),
      minParty: Math.max(1, Math.trunc(Number(input.minParty)) || 1),
      zone: input.zone?.trim().slice(0, 60) || undefined,
      sortOrder: Math.trunc(Number(input.sortOrder)) || 0,
      joinable: Boolean(input.joinable),
      active: true,
      createdAt: new Date().toISOString(),
    };
    await getPool().query(
      `INSERT INTO tables (id, tenant_id, offering, label, capacity, min_party, zone, sort_order, joinable, active, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,1,?)`,
      [
        table.id,
        this.tenantId,
        table.offering,
        table.label,
        table.capacity,
        table.minParty,
        table.zone ?? null,
        table.sortOrder,
        table.joinable ? 1 : 0,
        table.createdAt,
      ],
    );
    return table;
  }

  async updateTable(
    id: string,
    patch: Partial<NewTableInput> & { active?: boolean },
  ): Promise<RestaurantTable | null> {
    await ensureSchema();
    const cols: Record<string, string> = {
      offering: "offering",
      label: "label",
      capacity: "capacity",
      minParty: "min_party",
      zone: "zone",
      sortOrder: "sort_order",
      joinable: "joinable",
      active: "active",
    };
    const sets: string[] = [];
    const params: unknown[] = [];
    const p = patch as Record<string, unknown>;
    for (const key of Object.keys(cols)) {
      if (p[key] === undefined) continue;
      let v = p[key];
      if (key === "offering") v = v && String(v).length > 0 ? v : null;
      else if (key === "joinable" || key === "active") v = v ? 1 : 0;
      else if (key === "capacity" || key === "minParty") v = Math.max(1, Math.trunc(Number(v)) || 1);
      else if (key === "sortOrder") v = Math.trunc(Number(v)) || 0;
      else if (key === "label") v = String(v).trim().slice(0, 50);
      else if (key === "zone") v = String(v).trim().slice(0, 60) || null;
      sets.push(`${cols[key]} = ?`);
      params.push(v);
    }
    if (sets.length === 0) return this.getTable(id);
    params.push(id, this.tenantId);
    const [result] = await getPool().query(
      `UPDATE tables SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`,
      params,
    );
    if ((result as { affectedRows: number }).affectedRows === 0) return null;
    return this.getTable(id);
  }

  /** Soft-delete: keep history (reservations keep their table_id) but drop the
   *  table from pickers and the floor view. */
  async deleteTable(id: string): Promise<boolean> {
    await ensureSchema();
    const [result] = await getPool().query(
      "UPDATE tables SET active = 0 WHERE id = ? AND tenant_id = ?",
      [id, this.tenantId],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  /** All active bookings assigned to a given table on a date (excludes one id). */
  private async assignedOnDate(
    date: string,
    tableId: string,
    excludeId?: string,
  ): Promise<AssignedRow[]> {
    const statuses = ACTIVE_STATUSES.map(() => "?").join(",");
    const params: unknown[] = [this.tenantId, date, tableId, ...ACTIVE_STATUSES];
    let sql =
      `SELECT id, \`date\`, \`time\`, offering, service, party_size AS partySize, name, status, table_id AS tableId
       FROM reservations
       WHERE tenant_id = ? AND \`date\` = ? AND table_id = ? AND status IN (${statuses})`;
    if (excludeId) {
      sql += " AND id != ?";
      params.push(excludeId);
    }
    const [rows] = await getPool().query<AssignedRow[]>(sql, params);
    return rows;
  }

  /**
   * Assign (tableId set) or clear (tableId null) a reservation's physical table.
   * Rejects an assignment that would double-book the table during an overlapping
   * turn window, or that breaks the table's offering binding. Capacity is NOT
   * enforced (staff may deliberately seat a small party at a large table).
   */
  async assignTable(
    reservationId: string,
    tableId: string | null,
    config: AvailabilityConfig,
  ): Promise<AssignResult> {
    await ensureSchema();
    const pool = getPool();
    const [resRows] = await pool.query<RowDataPacket[]>(
      "SELECT id, `date`, `time`, offering, service FROM reservations WHERE id = ? AND tenant_id = ?",
      [reservationId, this.tenantId],
    );
    if (!resRows.length) return { error: "Reservation not found." };
    const res = resRows[0] as {
      id: string; date: string; time: string; offering: string; service: string;
    };

    if (tableId === null) {
      await pool.query(
        "UPDATE reservations SET table_id = NULL, updated_at = ? WHERE id = ? AND tenant_id = ?",
        [new Date().toISOString(), reservationId, this.tenantId],
      );
      return this.reload(reservationId);
    }

    const table = await this.getTable(tableId);
    if (!table || !table.active) return { error: "That table does not exist." };
    if (table.offering && table.offering !== offeringOf(res.offering)) {
      return { error: "That table is not available for this offering." };
    }

    // Conflict: any other active booking on this table whose turn overlaps.
    const myStart = toMinutes(res.time);
    const myTurn = turnMinutesFor(config, res.offering, res.service, res.date);
    const others = await this.assignedOnDate(res.date, tableId, reservationId);
    for (const o of others) {
      const oStart = toMinutes(o.time);
      const oTurn = turnMinutesFor(config, o.offering, o.service, o.date);
      if (turnsOverlap(myStart, myTurn, oStart, oTurn)) {
        return {
          error: `Table ${table.label} is already taken at ${o.time} (${o.name}). Pick another table or time.`,
        };
      }
    }

    await pool.query(
      "UPDATE reservations SET table_id = ?, table_label = ?, updated_at = ? WHERE id = ? AND tenant_id = ?",
      [tableId, table.label, new Date().toISOString(), reservationId, this.tenantId],
    );
    return this.reload(reservationId);
  }

  private async reload(id: string): Promise<AssignResult> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT id FROM reservations WHERE id = ? AND tenant_id = ?",
      [id, this.tenantId],
    );
    // Caller only needs success/fail; the admin route re-reads the full row.
    return rows.length ? { reservation: { id } as Reservation } : { error: "Reservation not found." };
  }

  /**
   * Suggest the best free table for a reservation: smallest active table that
   * seats the party (capacity >= party, minParty <= party), matches the offering
   * binding, and has no turn conflict. Returns null when nothing fits.
   */
  async suggestTable(
    res: { date: string; time: string; offering: string; service: string; partySize: number },
    config: AvailabilityConfig,
  ): Promise<RestaurantTable | null> {
    const candidates = (await this.listTables({ activeOnly: true, offering: res.offering }))
      .filter((t) => t.capacity >= res.partySize && t.minParty <= res.partySize)
      .sort((a, b) => a.capacity - b.capacity || a.sortOrder - b.sortOrder);
    const myStart = toMinutes(res.time);
    const myTurn = turnMinutesFor(config, res.offering, res.service, res.date);
    for (const t of candidates) {
      const others = await this.assignedOnDate(res.date, t.id);
      const clash = others.some((o) =>
        turnsOverlap(myStart, myTurn, toMinutes(o.time), turnMinutesFor(config, o.offering, o.service, o.date)),
      );
      if (!clash) return t;
    }
    return null;
  }

  /**
   * Floor view: every active table with its day's bookings and a derived state.
   * - seated: a 'seated' booking whose turn window covers "now"
   * - reserved: any active booking today (upcoming or current, not yet seated)
   * - free: no active bookings
   */
  async listTablesWithDayState(
    date: string,
    config: AvailabilityConfig,
  ): Promise<TableDayState[]> {
    await ensureSchema();
    const tables = await this.listTables({ activeOnly: true });
    if (tables.length === 0) return [];

    const statuses = ACTIVE_STATUSES.map(() => "?").join(",");
    const [rows] = await getPool().query<AssignedRow[]>(
      `SELECT id, \`date\`, \`time\`, offering, service, party_size AS partySize, name, status, table_id AS tableId
       FROM reservations
       WHERE tenant_id = ? AND \`date\` = ? AND table_id IS NOT NULL AND status IN (${statuses})
       ORDER BY \`time\``,
      [this.tenantId, date, ...ACTIVE_STATUSES],
    );

    const byTable = new Map<string, AssignedRow[]>();
    for (const r of rows) {
      if (!r.tableId) continue;
      const list = byTable.get(r.tableId) ?? [];
      list.push(r);
      byTable.set(r.tableId, list);
    }

    const now = nowInTz(config.timezone);
    const isToday = date === now.dateStr;

    return tables.map((table) => {
      const bookings = byTable.get(table.id) ?? [];
      let state: TableState = bookings.length ? "reserved" : "free";
      if (isToday) {
        const seatedNow = bookings.some((b) => {
          if (b.status !== "seated") return false;
          const start = toMinutes(b.time);
          const turn = turnMinutesFor(config, b.offering, b.service, b.date);
          return turnsOverlap(now.minutes, 1, start, turn);
        });
        if (seatedNow) state = "seated";
      }
      return {
        table,
        state,
        reservations: bookings.map((b) => ({
          id: b.id,
          time: b.time,
          partySize: Number(b.partySize),
          name: b.name,
          status: b.status,
          service: b.service,
        })),
      };
    });
  }
}

const storeCache = new Map<string, TableStore>();

export function getTableStore(tenantId: string): TableStore {
  let s = storeCache.get(tenantId);
  if (!s) {
    s = new TableStore(tenantId);
    storeCache.set(tenantId, s);
  }
  return s;
}

export function resetTableStoreCache(): void {
  storeCache.clear();
}
