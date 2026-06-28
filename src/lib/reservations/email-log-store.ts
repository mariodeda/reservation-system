/**
 * Append-only log of transactional email send attempts (booking confirmation,
 * feedback request). Every attempt — success, failure, or a debuggable skip —
 * is recorded so staff/operators can answer "did the guest get the email, and
 * if not, why?". Writes never throw (a logging failure must not break a send).
 */
import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "./mysql-pool";
import { ensureSchema } from "./mysql-schema";
import type { TenantEmailEvent } from "./email-policy";

export type EmailLogType = TenantEmailEvent; // "bookingConfirmation" | "feedbackRequest"
export type EmailLogStatus = "sent" | "failed" | "skipped";

export interface EmailLogEntry {
  id: string;
  tenantId: string;
  reservationId: string;
  type: EmailLogType;
  status: EmailLogStatus;
  reason?: string;
  error?: string;
  toEmail?: string;
  createdAt: string;
}

export interface RecordEmailAttemptInput {
  tenantId: string;
  reservationId: string;
  type: EmailLogType;
  status: EmailLogStatus;
  reason?: string;
  error?: string;
  toEmail?: string;
}

/** Latest outcome of one email type for one reservation, plus attempt count. */
export interface EmailStatusSummary {
  status: EmailLogStatus;
  reason?: string;
  error?: string;
  at: string;
  attempts: number;
}

interface ELRow extends RowDataPacket {
  id: string;
  tenant_id: string;
  reservation_id: string;
  type: EmailLogType;
  status: EmailLogStatus;
  reason: string | null;
  error: string | null;
  to_email: string | null;
  created_at: string;
}

function toEntry(r: ELRow): EmailLogEntry {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    reservationId: r.reservation_id,
    type: r.type,
    status: r.status,
    reason: r.reason ?? undefined,
    error: r.error ?? undefined,
    toEmail: r.to_email ?? undefined,
    createdAt: r.created_at,
  };
}

/** Record one email send attempt. Never throws. */
export async function recordEmailAttempt(input: RecordEmailAttemptInput): Promise<void> {
  try {
    await ensureSchema();
    await getPool().query(
      `INSERT INTO reservation_emails
         (id, tenant_id, reservation_id, type, status, reason, error, to_email, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        randomUUID(),
        input.tenantId,
        input.reservationId,
        input.type,
        input.status,
        input.reason ?? null,
        input.error ? input.error.slice(0, 2000) : null,
        input.toEmail ?? null,
        new Date().toISOString(),
      ],
    );
  } catch (err) {
    console.error("[email-log] record failed:", err);
  }
}

/** Full attempt history for one reservation, newest first. */
export async function getEmailLogByReservation(reservationId: string): Promise<EmailLogEntry[]> {
  await ensureSchema();
  const [rows] = await getPool().query<ELRow[]>(
    `SELECT id, tenant_id, reservation_id, type, status, reason, error, to_email, created_at
     FROM reservation_emails WHERE reservation_id = ? ORDER BY created_at DESC`,
    [reservationId],
  );
  return rows.map(toEntry);
}

/**
 * Batch the latest outcome per email type for a set of reservations — drives
 * the at-a-glance status chips in the admin reservation list.
 */
export async function getEmailStatusBatch(
  reservationIds: string[],
): Promise<Map<string, Partial<Record<EmailLogType, EmailStatusSummary>>>> {
  const out = new Map<string, Partial<Record<EmailLogType, EmailStatusSummary>>>();
  if (!reservationIds.length) return out;
  await ensureSchema();
  const ph = reservationIds.map(() => "?").join(",");
  // Ascending so the last row seen per (reservation, type) is the most recent.
  const [rows] = await getPool().query<ELRow[]>(
    `SELECT reservation_id, type, status, reason, error, created_at
     FROM reservation_emails WHERE reservation_id IN (${ph}) ORDER BY created_at ASC`,
    reservationIds,
  );
  for (const r of rows) {
    let entry = out.get(r.reservation_id);
    if (!entry) {
      entry = {};
      out.set(r.reservation_id, entry);
    }
    const prev = entry[r.type];
    entry[r.type] = {
      status: r.status,
      reason: r.reason ?? undefined,
      error: r.error ?? undefined,
      at: r.created_at,
      attempts: (prev?.attempts ?? 0) + 1,
    };
  }
  return out;
}
