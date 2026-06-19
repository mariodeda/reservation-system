import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "./mysql-pool";
import { ensureSchema } from "./mysql-schema";

const FEEDBACK_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export interface FeedbackRecord {
  token: string;
  reservationId: string;
  tenantId: string;
  sentAt: string;
  expiresAt?: string;
  filledAt?: string;
  rating?: number;
  comment?: string;
}

interface FbRow extends RowDataPacket {
  token: string;
  reservation_id: string;
  tenant_id: string;
  sent_at: string;
  expires_at: string | null;
  filled_at: string | null;
  rating: number | null;
  comment: string | null;
}

function toRecord(r: FbRow): FeedbackRecord {
  return {
    token: r.token,
    reservationId: r.reservation_id,
    tenantId: r.tenant_id,
    sentAt: r.sent_at,
    expiresAt: r.expires_at ?? undefined,
    filledAt: r.filled_at ?? undefined,
    rating: r.rating ?? undefined,
    comment: r.comment ?? undefined,
  };
}

function isExpired(record: FeedbackRecord): boolean {
  if (!record.expiresAt) return false;
  return new Date(record.expiresAt) < new Date();
}

/** Create a feedback token for a reservation. Idempotent — returns existing if already sent. */
export async function createFeedbackToken(reservationId: string, tenantId: string): Promise<FeedbackRecord> {
  await ensureSchema();
  const existing = await getFeedbackByReservation(reservationId);
  if (existing) return existing;
  const token = randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + FEEDBACK_TTL_MS).toISOString();
  await getPool().query(
    `INSERT INTO reservation_feedback (token, reservation_id, tenant_id, sent_at, expires_at)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE token = token`,
    [token, reservationId, tenantId, now, expiresAt],
  );
  return { token, reservationId, tenantId, sentAt: now, expiresAt };
}

export async function getFeedbackByToken(token: string): Promise<FeedbackRecord | null> {
  await ensureSchema();
  const [rows] = await getPool().query<FbRow[]>(
    `SELECT token, reservation_id, tenant_id, sent_at, expires_at, filled_at, rating, comment
     FROM reservation_feedback WHERE token = ?`,
    [token],
  );
  if (!rows[0]) return null;
  const record = toRecord(rows[0]);
  if (isExpired(record)) return null;
  return record;
}

export async function getFeedbackByReservation(reservationId: string): Promise<FeedbackRecord | null> {
  await ensureSchema();
  const [rows] = await getPool().query<FbRow[]>(
    `SELECT token, reservation_id, tenant_id, sent_at, expires_at, filled_at, rating, comment
     FROM reservation_feedback WHERE reservation_id = ?`,
    [reservationId],
  );
  return rows[0] ? toRecord(rows[0]) : null;
}

export async function submitFeedback(token: string, rating: number, comment: string): Promise<boolean> {
  await ensureSchema();
  const record = await getFeedbackByToken(token);
  if (!record || isExpired(record)) return false;
  const [result] = await getPool().query(
    `UPDATE reservation_feedback
     SET filled_at = ?, rating = ?, comment = ?
     WHERE token = ? AND filled_at IS NULL`,
    [new Date().toISOString(), rating, comment || null, token],
  );
  return (result as { affectedRows: number }).affectedRows > 0;
}

/** Batch-check which reservation IDs have had feedback sent. */
export async function getFeedbackStatusBatch(
  reservationIds: string[],
): Promise<Map<string, { sentAt: string; filled: boolean; rating?: number }>> {
  if (!reservationIds.length) return new Map();
  await ensureSchema();
  const ph = reservationIds.map(() => "?").join(",");
  const [rows] = await getPool().query<FbRow[]>(
    `SELECT reservation_id, sent_at, expires_at, filled_at, rating FROM reservation_feedback WHERE reservation_id IN (${ph})`,
    reservationIds,
  );
  const out = new Map<string, { sentAt: string; filled: boolean; rating?: number }>();
  for (const r of rows) {
    out.set(r.reservation_id, {
      sentAt: r.sent_at,
      filled: r.filled_at != null,
      rating: r.rating ?? undefined,
    });
  }
  return out;
}
