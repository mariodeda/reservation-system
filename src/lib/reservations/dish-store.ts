import type { RowDataPacket } from "mysql2/promise";
import { ensureSchema } from "./mysql-schema";
import { getPool } from "./mysql-pool";
import { decryptSecret, encryptSecret } from "./secret-box";

export interface DishIntegration {
  tenantId: string;
  enabled: boolean;
  email?: string;
  password?: string;
  passwordSet: boolean;
  establishmentId?: string;
  lastSyncAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export type DishIntegrationView = Omit<DishIntegration, "password">;

interface DishIntegrationRow extends RowDataPacket {
  tenant_id: string;
  enabled: number;
  email: string | null;
  password_encrypted: string | null;
  establishment_id: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function toIntegration(row: DishIntegrationRow): DishIntegration {
  return {
    tenantId: row.tenant_id,
    enabled: Boolean(row.enabled),
    email: row.email ?? undefined,
    password: decryptSecret(row.password_encrypted),
    passwordSet: Boolean(row.password_encrypted),
    establishmentId: row.establishment_id ?? undefined,
    lastSyncAt: row.last_sync_at ?? undefined,
    lastError: row.last_error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function publicDishView(integration: DishIntegration | null): DishIntegrationView | null {
  if (!integration) return null;
  const { password: _password, ...view } = integration;
  return view;
}

export async function getDishIntegration(tenantId: string): Promise<DishIntegration | null> {
  await ensureSchema();
  const [rows] = await getPool().query<DishIntegrationRow[]>(
    "SELECT * FROM tenant_dish_integrations WHERE tenant_id = ?",
    [tenantId],
  );
  return rows.length ? toIntegration(rows[0]) : null;
}

export async function listEnabledDishIntegrations(): Promise<DishIntegration[]> {
  await ensureSchema();
  const [rows] = await getPool().query<DishIntegrationRow[]>(
    "SELECT * FROM tenant_dish_integrations WHERE enabled = 1 AND email IS NOT NULL AND password_encrypted IS NOT NULL ORDER BY tenant_id",
  );
  return rows.map(toIntegration);
}

export async function findDishTenantByEmail(email: string, excludeTenantId?: string): Promise<string | null> {
  await ensureSchema();
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT tenant_id FROM tenant_dish_integrations
      WHERE LOWER(email) = ? AND enabled = 1
        ${excludeTenantId ? "AND tenant_id <> ?" : ""}
      LIMIT 1`,
    excludeTenantId ? [normalized, excludeTenantId] : [normalized],
  );
  return rows[0]?.tenant_id as string | undefined ?? null;
}

export interface SaveDishIntegrationInput {
  enabled?: boolean;
  email?: string;
  password?: string;
  establishmentId?: string;
}

export async function saveDishIntegration(
  tenantId: string,
  input: SaveDishIntegrationInput,
): Promise<DishIntegration> {
  await ensureSchema();
  const existing = await getDishIntegration(tenantId);
  const now = new Date().toISOString();
  const email = input.email !== undefined ? input.email.trim().slice(0, 255) : existing?.email;
  const passwordEncrypted = input.password ? encryptSecret(input.password.slice(0, 1000)) : null;
  const establishmentId = input.establishmentId !== undefined ? input.establishmentId.trim().slice(0, 80) : existing?.establishmentId;
  const enabled = input.enabled !== undefined ? Boolean(input.enabled) : Boolean(existing?.enabled);

  await getPool().query(
    `INSERT INTO tenant_dish_integrations
      (tenant_id, enabled, email, password_encrypted, establishment_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      enabled = VALUES(enabled),
      email = VALUES(email),
      password_encrypted = COALESCE(VALUES(password_encrypted), password_encrypted),
      establishment_id = VALUES(establishment_id),
      updated_at = VALUES(updated_at)`,
    [tenantId, enabled ? 1 : 0, email || null, passwordEncrypted, establishmentId || null, existing?.createdAt ?? now, now],
  );
  return (await getDishIntegration(tenantId))!;
}

export async function markDishSyncResult(tenantId: string, error?: string): Promise<void> {
  await ensureSchema();
  const now = new Date().toISOString();
  await getPool().query(
    "UPDATE tenant_dish_integrations SET last_sync_at = ?, last_error = ?, updated_at = ? WHERE tenant_id = ?",
    [error ? null : now, error?.slice(0, 2000) ?? null, now, tenantId],
  );
}
