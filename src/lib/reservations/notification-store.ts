import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { ensureSchema } from "./mysql-schema";
import { getPool } from "./mysql-pool";
import type { ReservationSource } from "./types";

export type TenantNotificationSeverity = "info" | "success" | "warning" | "error";
export type TenantNotificationSource = ReservationSource | "system" | "email" | "waitlist";

export interface TenantNotification {
  id: string;
  tenantId: string;
  type: string;
  severity: TenantNotificationSeverity;
  title: string;
  body?: string;
  source: TenantNotificationSource;
  reservationId?: string;
  reference?: string;
  dedupeKey: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  readAt?: string;
  dismissedAt?: string;
  expiresAt?: string;
}

export interface CreateTenantNotificationInput {
  tenantId: string;
  type: string;
  severity?: TenantNotificationSeverity;
  title: string;
  body?: string;
  source?: TenantNotificationSource;
  reservationId?: string;
  reference?: string;
  dedupeKey: string;
  metadata?: Record<string, unknown>;
  expiresAt?: string;
}

interface NotificationRow extends RowDataPacket {
  id: string;
  tenant_id: string;
  type: string;
  severity: TenantNotificationSeverity;
  title: string;
  body: string | null;
  source: TenantNotificationSource;
  reservation_id: string | null;
  reference: string | null;
  dedupe_key: string;
  metadata: unknown;
  created_at: string | Date;
  read_at: string | Date | null;
  dismissed_at: string | Date | null;
  expires_at: string | Date | null;
}

const COLUMNS =
  "id, tenant_id, type, severity, title, body, source, reservation_id, reference, dedupe_key, metadata, created_at, read_at, dismissed_at, expires_at";

function nowIso() {
  return new Date().toISOString();
}

function toIso(value: string | Date | null): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function cleanText(value: string | undefined, max: number): string | undefined {
  const text = typeof value === "string" ? value.trim().slice(0, max) : "";
  return text || undefined;
}

function parseMetadata(value: unknown): Record<string, unknown> | undefined {
  if (!value) return undefined;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : undefined;
    } catch {
      return undefined;
    }
  }
  return typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function toNotification(row: NotificationRow): TenantNotification {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    type: row.type,
    severity: row.severity,
    title: row.title,
    body: row.body ?? undefined,
    source: row.source,
    reservationId: row.reservation_id ?? undefined,
    reference: row.reference ?? undefined,
    dedupeKey: row.dedupe_key,
    metadata: parseMetadata(row.metadata),
    createdAt: toIso(row.created_at) ?? nowIso(),
    readAt: toIso(row.read_at),
    dismissedAt: toIso(row.dismissed_at),
    expiresAt: toIso(row.expires_at),
  };
}

export async function createTenantNotification(
  input: CreateTenantNotificationInput,
): Promise<{ notification: TenantNotification; created: boolean }> {
  await ensureSchema();
  const id = randomUUID();
  const createdAt = nowIso();
  const severity = input.severity ?? "info";
  const source = input.source ?? "system";
  const title = cleanText(input.title, 160) ?? "Notification";
  const body = cleanText(input.body, 500) ?? null;
  const reference = cleanText(input.reference, 16) ?? null;
  const dedupeKey = cleanText(input.dedupeKey, 191);
  if (!dedupeKey) throw new Error("Notification dedupe key is required.");
  const metadata = input.metadata ? JSON.stringify(input.metadata) : null;

  await getPool().query(
    `INSERT INTO tenant_notifications
      (id, tenant_id, type, severity, title, body, source, reservation_id, reference, dedupe_key, metadata, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      title = VALUES(title),
      body = VALUES(body),
      severity = VALUES(severity),
      source = VALUES(source),
      reservation_id = VALUES(reservation_id),
      reference = VALUES(reference),
      metadata = VALUES(metadata),
      expires_at = VALUES(expires_at)`,
    [
      id,
      input.tenantId,
      input.type.slice(0, 64),
      severity,
      title,
      body,
      source,
      input.reservationId ?? null,
      reference,
      dedupeKey,
      metadata,
      createdAt,
      input.expiresAt ?? null,
    ],
  );
  const [rows] = await getPool().query<NotificationRow[]>(
    `SELECT ${COLUMNS} FROM tenant_notifications WHERE tenant_id = ? AND dedupe_key = ? LIMIT 1`,
    [input.tenantId, dedupeKey],
  );
  if (!rows.length) throw new Error("Could not load persisted notification.");
  const notification = toNotification(rows[0]);
  return { notification, created: notification.id === id };
}

export async function listTenantNotifications(
  tenantId: string,
  opts: { unreadOnly?: boolean; limit?: number; before?: string } = {},
): Promise<TenantNotification[]> {
  await ensureSchema();
  const limit = Math.min(100, Math.max(1, Math.trunc(opts.limit ?? 50)));
  const where = ["tenant_id = ?", "(expires_at IS NULL OR expires_at > ?)"];
  const params: unknown[] = [tenantId, nowIso()];
  if (opts.unreadOnly) where.push("read_at IS NULL");
  if (opts.before) {
    where.push("created_at < ?");
    params.push(opts.before);
  }
  params.push(limit);
  const [rows] = await getPool().query<NotificationRow[]>(
    `SELECT ${COLUMNS}
       FROM tenant_notifications
      WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT ?`,
    params,
  );
  return rows.map(toNotification);
}

export async function countUnreadTenantNotifications(tenantId: string): Promise<number> {
  await ensureSchema();
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt
       FROM tenant_notifications
      WHERE tenant_id = ? AND read_at IS NULL AND (expires_at IS NULL OR expires_at > ?)`,
    [tenantId, nowIso()],
  );
  return Number(rows[0]?.cnt ?? 0);
}

export async function markTenantNotificationRead(
  tenantId: string,
  id: string,
): Promise<TenantNotification | null> {
  await ensureSchema();
  const now = nowIso();
  await getPool().query(
    "UPDATE tenant_notifications SET read_at = COALESCE(read_at, ?) WHERE tenant_id = ? AND id = ?",
    [now, tenantId, id],
  );
  const [rows] = await getPool().query<NotificationRow[]>(
    `SELECT ${COLUMNS} FROM tenant_notifications WHERE tenant_id = ? AND id = ? LIMIT 1`,
    [tenantId, id],
  );
  return rows.length ? toNotification(rows[0]) : null;
}

export async function dismissTenantNotification(
  tenantId: string,
  id: string,
): Promise<TenantNotification | null> {
  await ensureSchema();
  const now = nowIso();
  await getPool().query(
    `UPDATE tenant_notifications
        SET read_at = COALESCE(read_at, ?), dismissed_at = COALESCE(dismissed_at, ?)
      WHERE tenant_id = ? AND id = ?`,
    [now, now, tenantId, id],
  );
  const [rows] = await getPool().query<NotificationRow[]>(
    `SELECT ${COLUMNS} FROM tenant_notifications WHERE tenant_id = ? AND id = ? LIMIT 1`,
    [tenantId, id],
  );
  return rows.length ? toNotification(rows[0]) : null;
}

export async function markAllTenantNotificationsRead(tenantId: string): Promise<number> {
  await ensureSchema();
  const now = nowIso();
  const [result] = await getPool().query<ResultSetHeader>(
    "UPDATE tenant_notifications SET read_at = COALESCE(read_at, ?) WHERE tenant_id = ? AND read_at IS NULL",
    [now, tenantId],
  );
  return result.affectedRows;
}
