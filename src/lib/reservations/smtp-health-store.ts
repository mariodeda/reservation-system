import type { RowDataPacket } from "mysql2/promise";
import { ensureSchema } from "./mysql-schema";
import { getPool } from "./mysql-pool";

export type SmtpHealthStatus = "unknown" | "not_configured" | "ok" | "failed";

export interface SmtpHealth {
  tenantId: string;
  status: SmtpHealthStatus;
  reason?: string;
  checkedAt: string;
  latencyMs?: number;
}

interface SmtpHealthRow extends RowDataPacket {
  tenant_id: string;
  status: SmtpHealthStatus;
  reason: string | null;
  checked_at: string;
  latency_ms: number | null;
}

function toHealth(row: SmtpHealthRow): SmtpHealth {
  return {
    tenantId: row.tenant_id,
    status: row.status,
    reason: row.reason ?? undefined,
    checkedAt: row.checked_at,
    latencyMs: row.latency_ms ?? undefined,
  };
}

export async function getSmtpHealth(tenantId: string): Promise<SmtpHealth | null> {
  await ensureSchema();
  const [rows] = await getPool().query<SmtpHealthRow[]>(
    "SELECT tenant_id, status, reason, checked_at, latency_ms FROM tenant_smtp_health WHERE tenant_id = ?",
    [tenantId],
  );
  return rows.length ? toHealth(rows[0]) : null;
}

export async function listSmtpHealth(): Promise<Map<string, SmtpHealth>> {
  await ensureSchema();
  const [rows] = await getPool().query<SmtpHealthRow[]>(
    "SELECT tenant_id, status, reason, checked_at, latency_ms FROM tenant_smtp_health",
  );
  return new Map(rows.map((row) => [row.tenant_id, toHealth(row)]));
}

export async function upsertSmtpHealth(input: SmtpHealth): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO tenant_smtp_health (tenant_id, status, reason, checked_at, latency_ms)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       reason = VALUES(reason),
       checked_at = VALUES(checked_at),
       latency_ms = VALUES(latency_ms)`,
    [input.tenantId, input.status, input.reason ?? null, input.checkedAt, input.latencyMs ?? null],
  );
}
