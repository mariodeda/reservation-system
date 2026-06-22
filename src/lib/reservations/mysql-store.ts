import { type RowDataPacket } from "mysql2/promise";
import { buildReservation, type ReservationFilter, type ReservationStore } from "./store";
import { getPool } from "./mysql-pool";
import { ensureSchema } from "./mysql-schema";
import type {
  AvailabilityConfig,
  NewReservationInput,
  Reservation,
} from "./types";
import { defaultAvailability } from "@/reservation.config";
import { normalizePhone } from "./availability";

/**
 * MySQL-backed, tenant-scoped store. Every query is filtered by tenant_id, so an
 * instance for tenant A can never read or write tenant B's rows. Concurrent
 * bookings into the same slot are serialized with a per-(tenant,slot) advisory
 * lock (GET_LOCK) — correct even when no rows exist yet.
 */

const RES_COLUMNS =
  "id, `date`, `time`, offering, service, party_size AS partySize, name, email, phone, occasion, notes, table_label AS tableLabel, table_id AS tableId, table_ids AS tableIds, status, source, created_at AS createdAt, updated_at AS updatedAt";

interface ResRow extends RowDataPacket {
  id: string;
  date: string;
  time: string;
  offering: string;
  service: string;
  partySize: number;
  name: string;
  email: string;
  phone: string;
  occasion: string | null;
  notes: string | null;
  tableLabel: string | null;
  tableId: string | null;
  tableIds: unknown;
  status: Reservation["status"];
  source: Reservation["source"];
  createdAt: string;
  updatedAt: string;
}

function toReservation(r: ResRow): Reservation {
  return {
    id: r.id,
    date: r.date,
    time: r.time,
    offering: r.offering || "main",
    service: r.service,
    partySize: r.partySize,
    name: r.name,
    email: r.email,
    phone: r.phone,
    occasion: r.occasion ?? undefined,
    notes: r.notes ?? undefined,
    tableLabel: r.tableLabel ?? undefined,
    tableId: r.tableId ?? undefined,
    tableIds: Array.isArray(r.tableIds)
      ? (r.tableIds as string[])
      : typeof r.tableIds === "string" && r.tableIds
        ? JSON.parse(r.tableIds) as string[]
        : undefined,
    status: r.status,
    source: r.source,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

const INSERT_SQL =
  "INSERT INTO reservations (id, tenant_id, `date`, `time`, offering, service, party_size, name, email, phone, occasion, notes, table_label, table_id, table_ids, status, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
const insertParams = (tenantId: string, r: Reservation) => [
  r.id,
  tenantId,
  r.date,
  r.time,
  r.offering || "main",
  r.service,
  r.partySize,
  r.name,
  r.email,
  r.phone,
  r.occasion ?? null,
  r.notes ?? null,
  r.tableLabel ?? null,
  r.tableId ?? null,
  r.tableIds?.length ? JSON.stringify(r.tableIds) : null,
  r.status,
  r.source,
  r.createdAt,
  r.updatedAt,
];

export class MySqlStore implements ReservationStore {
  constructor(private readonly tenantId: string) {}

  async getConfig(): Promise<AvailabilityConfig> {
    await ensureSchema();
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT v FROM app_config WHERE tenant_id = ? AND k = 'availability'",
      [this.tenantId],
    );
    if (rows.length) {
      const v = rows[0].v;
      return typeof v === "string" ? (JSON.parse(v) as AvailabilityConfig) : (v as AvailabilityConfig);
    }
    // seed on first run (idempotent). Return a clone so callers can't mutate the
    // shared template (which would leak across tenants).
    const seed = structuredClone(defaultAvailability);
    await getPool().query(
      "INSERT INTO app_config (tenant_id, k, v) VALUES (?, 'availability', ?) ON DUPLICATE KEY UPDATE v = v",
      [this.tenantId, JSON.stringify(seed)],
    );
    return seed;
  }

  async saveConfig(config: AvailabilityConfig): Promise<AvailabilityConfig> {
    await ensureSchema();
    await getPool().query(
      "INSERT INTO app_config (tenant_id, k, v) VALUES (?, 'availability', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)",
      [this.tenantId, JSON.stringify(config)],
    );
    return config;
  }

  async listReservations(filter: ReservationFilter = {}): Promise<Reservation[]> {
    await ensureSchema();
    const where: string[] = ["tenant_id = ?"];
    const params: unknown[] = [this.tenantId];
    if (filter.date) {
      where.push("`date` = ?");
      params.push(filter.date);
    }
    if (filter.from) {
      where.push("`date` >= ?");
      params.push(filter.from);
    }
    if (filter.to) {
      where.push("`date` <= ?");
      params.push(filter.to);
    }
    if (filter.status) {
      where.push("status = ?");
      params.push(filter.status);
    }
    const sql =
      `SELECT ${RES_COLUMNS} FROM reservations WHERE ${where.join(" AND ")}` +
      " ORDER BY `date`, `time`";
    const [rows] = await getPool().query<ResRow[]>(sql, params);
    return rows.map(toReservation);
  }

  async getReservation(id: string): Promise<Reservation | null> {
    await ensureSchema();
    const [rows] = await getPool().query<ResRow[]>(
      `SELECT ${RES_COLUMNS} FROM reservations WHERE id = ? AND tenant_id = ?`,
      [id, this.tenantId],
    );
    return rows.length ? toReservation(rows[0]) : null;
  }

  async createReservation(input: NewReservationInput): Promise<Reservation> {
    await ensureSchema();
    const res = buildReservation(input);
    await getPool().query(INSERT_SQL, insertParams(this.tenantId, res));
    return res;
  }

  async createReservationChecked(
    input: NewReservationInput,
    validate: (existing: Reservation[]) => string | null,
  ): Promise<{ reservation?: Reservation; error?: string }> {
    await ensureSchema();
    const offering = input.offering && input.offering.length > 0 ? input.offering : "main";
    const lockName = `rsv:${this.tenantId}:${offering}:${input.date}:${input.time}`.slice(0, 64);
    const conn = await getPool().getConnection();
    try {
      await conn.query("SELECT GET_LOCK(?, 10)", [lockName]);
      // Read this tenant's rows for the date under the slot lock; validate
      // (capacity + dedupe) only inspects same-date/slot rows.
      const [rows] = await conn.query<ResRow[]>(
        `SELECT ${RES_COLUMNS} FROM reservations WHERE tenant_id = ? AND \`date\` = ?`,
        [this.tenantId, input.date],
      );
      const error = validate(rows.map(toReservation));
      if (error) return { error };
      const res = buildReservation(input);
      await conn.query(INSERT_SQL, insertParams(this.tenantId, res));
      return { reservation: res };
    } finally {
      await conn.query("SELECT RELEASE_LOCK(?)", [lockName]).catch(() => {});
      conn.release();
    }
  }

  async updateReservation(
    id: string,
    patch: Partial<Reservation>,
  ): Promise<Reservation | null> {
    await ensureSchema();
    const cols: Record<keyof Reservation, string> = {
      date: "`date`",
      time: "`time`",
      offering: "offering",
      service: "service",
      partySize: "party_size",
      name: "name",
      email: "email",
      phone: "phone",
      occasion: "occasion",
      notes: "notes",
      tableLabel: "table_label",
      tableId: "table_id",
      tableIds: "table_ids",
      status: "status",
      source: "source",
    } as Record<keyof Reservation, string>;

    const sets: string[] = [];
    const params: unknown[] = [];
    (Object.keys(cols) as (keyof Reservation)[]).forEach((k) => {
      if (patch[k] !== undefined) {
        sets.push(`${cols[k]} = ?`);
        params.push(k === "tableIds" ? (patch[k] == null ? null : JSON.stringify(patch[k])) : patch[k]);
      }
    });
    sets.push("updated_at = ?");
    params.push(new Date().toISOString());
    params.push(id);
    params.push(this.tenantId);

    const [result] = await getPool().query(
      `UPDATE reservations SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`,
      params,
    );
    if ((result as { affectedRows: number }).affectedRows === 0) return null;
    return this.getReservation(id);
  }

  async deleteReservation(id: string): Promise<boolean> {
    await ensureSchema();
    const [result] = await getPool().query(
      "DELETE FROM reservations WHERE id = ? AND tenant_id = ?",
      [id, this.tenantId],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  async findByContact(email: string, phone: string): Promise<Reservation[]> {
    await ensureSchema();
    const normEmail = email.trim().toLowerCase();
    const [rows] = await getPool().query<ResRow[]>(
      `SELECT ${RES_COLUMNS} FROM reservations WHERE tenant_id = ? AND LOWER(TRIM(email)) = ? ORDER BY \`date\` DESC, \`time\` DESC LIMIT 20`,
      [this.tenantId, normEmail],
    );
    const normPhone = normalizePhone(phone);
    return rows.map(toReservation).filter((r) => normalizePhone(r.phone) === normPhone);
  }
}
