import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "./mysql-pool";
import { ensureSchema } from "./mysql-schema";
import {
  type AvailabilityConfig,
  type NewWaitlistInput,
  type Reservation,
  WAITLIST_ACTIVE_STATUSES,
  type WaitlistEntry,
  type WaitlistStatus,
} from "./types";
import { offeringOf } from "./offerings";
import { DEFAULT_TURN_MINUTES, nowInTz } from "./availability";
import { getStore } from "./store";
import { getTableStore } from "./table-store";

/**
 * Tenant-scoped waitlist: a staff-facing live queue of parties waiting for a
 * table. There is no guest-facing channel — "notify" is a status flag staff set
 * when they call the party. Seating an entry creates a real reservation (status
 * "seated", source "admin") and, optionally, assigns a managed table.
 */

const WL_COLUMNS =
  "id, offering, `date`, name, phone, email, party_size AS partySize, quoted_wait_min AS quotedWaitMin, pager_label AS pagerLabel, status, notes, seated_reservation_id AS seatedReservationId, created_at AS createdAt, notified_at AS notifiedAt, seated_at AS seatedAt, updated_at AS updatedAt";

interface WlRow extends RowDataPacket {
  id: string;
  offering: string;
  date: string;
  name: string;
  phone: string | null;
  email: string | null;
  partySize: number;
  quotedWaitMin: number | null;
  pagerLabel: string | null;
  status: WaitlistStatus;
  notes: string | null;
  seatedReservationId: string | null;
  createdAt: string;
  notifiedAt: string | null;
  seatedAt: string | null;
  updatedAt: string;
}

function toEntry(r: WlRow): WaitlistEntry {
  return {
    id: r.id,
    offering: r.offering || "main",
    date: r.date,
    name: r.name,
    phone: r.phone ?? undefined,
    email: r.email ?? undefined,
    partySize: Number(r.partySize),
    quotedWaitMin: r.quotedWaitMin == null ? undefined : Number(r.quotedWaitMin),
    pagerLabel: r.pagerLabel ?? undefined,
    status: r.status,
    notes: r.notes ?? undefined,
    seatedReservationId: r.seatedReservationId ?? undefined,
    createdAt: r.createdAt,
    notifiedAt: r.notifiedAt ?? undefined,
    seatedAt: r.seatedAt ?? undefined,
    updatedAt: r.updatedAt,
  };
}

export interface SeatOptions {
  time: string;
  service: string;
  tableId?: string | null;
}

export interface SeatResult {
  reservation?: Reservation;
  /** Non-fatal: party was seated but the chosen table could not be assigned. */
  tableWarning?: string;
  error?: string;
}

export class WaitlistStore {
  constructor(private readonly tenantId: string) {}

  async listWaitlist(
    date: string,
    opts: { activeOnly?: boolean } = {},
  ): Promise<WaitlistEntry[]> {
    await ensureSchema();
    const where: string[] = ["tenant_id = ?", "`date` = ?"];
    const params: unknown[] = [this.tenantId, date];
    if (opts.activeOnly) {
      where.push(`status IN (${WAITLIST_ACTIVE_STATUSES.map(() => "?").join(",")})`);
      params.push(...WAITLIST_ACTIVE_STATUSES);
    }
    const [rows] = await getPool().query<WlRow[]>(
      `SELECT ${WL_COLUMNS} FROM waitlist WHERE ${where.join(" AND ")} ORDER BY created_at`,
      params,
    );
    return rows.map(toEntry);
  }

  async getEntry(id: string): Promise<WaitlistEntry | null> {
    await ensureSchema();
    const [rows] = await getPool().query<WlRow[]>(
      `SELECT ${WL_COLUMNS} FROM waitlist WHERE id = ? AND tenant_id = ?`,
      [id, this.tenantId],
    );
    return rows.length ? toEntry(rows[0]) : null;
  }

  async addEntry(input: NewWaitlistInput, config: AvailabilityConfig): Promise<WaitlistEntry> {
    await ensureSchema();
    const now = new Date().toISOString();
    const offering = offeringOf(input.offering);
    const partySize = Math.max(1, Math.trunc(Number(input.partySize)) || 1);
    const quoted =
      input.quotedWaitMin != null && Number.isFinite(Number(input.quotedWaitMin))
        ? Math.max(0, Math.trunc(Number(input.quotedWaitMin)))
        : await this.estimateWait(input.date, offering, partySize, config);
    const entry: WaitlistEntry = {
      id: randomUUID(),
      offering,
      date: input.date,
      name: input.name.trim().slice(0, 120),
      phone: input.phone?.trim().slice(0, 40) || undefined,
      email: input.email?.trim().slice(0, 200) || undefined,
      partySize,
      quotedWaitMin: quoted,
      pagerLabel: input.pagerLabel?.trim().slice(0, 40) || undefined,
      status: "waiting",
      notes: input.notes?.trim().slice(0, 1000) || undefined,
      createdAt: now,
      updatedAt: now,
    };
    await getPool().query(
      `INSERT INTO waitlist (id, tenant_id, offering, \`date\`, name, phone, email, party_size, quoted_wait_min, pager_label, status, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        entry.id, this.tenantId, entry.offering, entry.date, entry.name,
        entry.phone ?? null, entry.email ?? null, entry.partySize,
        entry.quotedWaitMin ?? null, entry.pagerLabel ?? null, entry.status,
        entry.notes ?? null, entry.createdAt, entry.updatedAt,
      ],
    );
    return entry;
  }

  async updateEntry(
    id: string,
    patch: Partial<Pick<WaitlistEntry, "name" | "phone" | "email" | "partySize" | "quotedWaitMin" | "pagerLabel" | "notes" | "status">>,
  ): Promise<WaitlistEntry | null> {
    await ensureSchema();
    const cols: Record<string, string> = {
      name: "name",
      phone: "phone",
      email: "email",
      partySize: "party_size",
      quotedWaitMin: "quoted_wait_min",
      pagerLabel: "pager_label",
      notes: "notes",
      status: "status",
    };
    const sets: string[] = [];
    const params: unknown[] = [];
    const p = patch as Record<string, unknown>;
    for (const key of Object.keys(cols)) {
      if (p[key] === undefined) continue;
      let v = p[key];
      if (key === "partySize") v = Math.max(1, Math.trunc(Number(v)) || 1);
      else if (key === "quotedWaitMin") v = v == null ? null : Math.max(0, Math.trunc(Number(v)) || 0);
      sets.push(`${cols[key]} = ?`);
      params.push(v ?? null);
    }
    // Stamp notified_at the first time the entry moves to "notified".
    if (patch.status === "notified") {
      sets.push("notified_at = COALESCE(notified_at, ?)");
      params.push(new Date().toISOString());
    }
    sets.push("updated_at = ?");
    params.push(new Date().toISOString());
    params.push(id, this.tenantId);
    const [result] = await getPool().query(
      `UPDATE waitlist SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`,
      params,
    );
    if ((result as { affectedRows: number }).affectedRows === 0) return null;
    return this.getEntry(id);
  }

  async deleteEntry(id: string): Promise<boolean> {
    await ensureSchema();
    const [result] = await getPool().query(
      "DELETE FROM waitlist WHERE id = ? AND tenant_id = ?",
      [id, this.tenantId],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  /**
   * Seat a waiting party: create a reservation (seated, admin source) and, when
   * a table is given, assign it (conflict-checked). A table conflict is
   * non-fatal — the party is still seated, with a warning. Idempotent-ish: a
   * non-active entry is rejected.
   */
  async seatFromWaitlist(
    id: string,
    opts: SeatOptions,
    config: AvailabilityConfig,
  ): Promise<SeatResult> {
    const entry = await this.getEntry(id);
    if (!entry) return { error: "Waitlist entry not found." };
    if (!WAITLIST_ACTIVE_STATUSES.includes(entry.status)) {
      return { error: "That party is no longer waiting." };
    }

    const store = getStore().forTenant(this.tenantId);
    const reservation = await store.createReservation({
      date: entry.date,
      time: opts.time,
      offering: entry.offering,
      service: opts.service,
      partySize: entry.partySize,
      name: entry.name,
      email: entry.email ?? "",
      phone: entry.phone ?? "",
      notes: entry.notes,
      source: "admin",
      status: "seated",
    });

    let tableWarning: string | undefined;
    if (opts.tableId) {
      const result = await getTableStore(this.tenantId).assignTable(reservation.id, opts.tableId, config);
      if (result.error) tableWarning = result.error;
    }

    const now = new Date().toISOString();
    await getPool().query(
      "UPDATE waitlist SET status = 'seated', seated_reservation_id = ?, seated_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?",
      [reservation.id, now, now, id, this.tenantId],
    );

    // Re-read so the returned reservation reflects the table assignment (the
    // in-memory object from createReservation predates assignTable).
    const finalReservation =
      opts.tableId && !tableWarning ? (await store.getReservation(reservation.id)) ?? reservation : reservation;

    return { reservation: finalReservation, tableWarning };
  }

  /**
   * Rough wait-time heuristic: each party already ahead in the active queue adds
   * roughly (turn time ÷ number of tables that fit the party). Honest first cut —
   * staff can override the quote. Returns minutes, capped at 180.
   */
  async estimateWait(
    date: string,
    offering: string,
    partySize: number,
    config: AvailabilityConfig,
  ): Promise<number> {
    const now = nowInTz(config.timezone);
    // Future-dated waitlist entries (rare) carry no live wait.
    if (date !== now.dateStr) return 0;

    const tables = await getTableStore(this.tenantId).listTables({ activeOnly: true, offering });
    const fitting = tables.filter((t) => t.capacity >= partySize).length || tables.length || 1;
    const ahead = (await this.listWaitlist(date, { activeOnly: true })).length;
    const turn = config.turnMinutes ?? DEFAULT_TURN_MINUTES;
    const perParty = Math.max(5, Math.round(turn / fitting));
    return Math.min(180, ahead * perParty);
  }
}

const storeCache = new Map<string, WaitlistStore>();

export function getWaitlistStore(tenantId: string): WaitlistStore {
  let s = storeCache.get(tenantId);
  if (!s) {
    s = new WaitlistStore(tenantId);
    storeCache.set(tenantId, s);
  }
  return s;
}

export function resetWaitlistStoreCache(): void {
  storeCache.clear();
}
