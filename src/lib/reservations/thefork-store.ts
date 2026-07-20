import { createHash, randomBytes } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { ensureSchema } from "./mysql-schema";
import { getPool } from "./mysql-pool";
import { decryptSecret, encryptSecret } from "./secret-box";

export interface TheForkIntegration {
  tenantId: string;
  enabled: boolean;
  clientId?: string;
  clientSecret?: string;
  clientSecretSet: boolean;
  restaurantUuid?: string;
  groupUuid?: string;
  webhookTokenSet: boolean;
  lastSyncAt?: string;
  lastWebhookAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TheForkIntegrationView extends Omit<TheForkIntegration, "clientSecret"> {
  webhookUrl?: string;
}

interface IntegrationRow extends RowDataPacket {
  tenant_id: string;
  enabled: number;
  client_id: string | null;
  client_secret_encrypted: string | null;
  restaurant_uuid: string | null;
  group_uuid: string | null;
  webhook_token_hash: string | null;
  last_sync_at: string | null;
  last_webhook_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export type ExternalReservationProvider = "thefork" | "dish";

interface LinkRow extends RowDataPacket {
  provider: ExternalReservationProvider;
  external_id: string;
  reservation_id: string;
  external_status: string | null;
  external_meal_status: string | null;
  external_updated_at: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function toIntegration(row: IntegrationRow): TheForkIntegration {
  return {
    tenantId: row.tenant_id,
    enabled: Boolean(row.enabled),
    clientId: row.client_id ?? undefined,
    clientSecret: decryptSecret(row.client_secret_encrypted),
    clientSecretSet: Boolean(row.client_secret_encrypted),
    restaurantUuid: row.restaurant_uuid ?? undefined,
    groupUuid: row.group_uuid ?? undefined,
    webhookTokenSet: Boolean(row.webhook_token_hash),
    lastSyncAt: row.last_sync_at ?? undefined,
    lastWebhookAt: row.last_webhook_at ?? undefined,
    lastError: row.last_error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function publicTheForkView(
  integration: TheForkIntegration | null,
  origin?: string,
): TheForkIntegrationView | null {
  if (!integration) return null;
  const { clientSecret: _clientSecret, ...view } = integration;
  return {
    ...view,
    webhookUrl: origin
      ? `${origin}/api/integrations/thefork/webhook/${encodeURIComponent(integration.tenantId)}`
      : undefined,
  };
}

export async function getTheForkIntegration(tenantId: string): Promise<TheForkIntegration | null> {
  await ensureSchema();
  const [rows] = await getPool().query<IntegrationRow[]>(
    "SELECT * FROM tenant_thefork_integrations WHERE tenant_id = ?",
    [tenantId],
  );
  return rows.length ? toIntegration(rows[0]) : null;
}

export async function getTheForkIntegrationByRestaurant(
  restaurantUuid: string,
): Promise<TheForkIntegration | null> {
  await ensureSchema();
  const [rows] = await getPool().query<IntegrationRow[]>(
    "SELECT * FROM tenant_thefork_integrations WHERE restaurant_uuid = ? AND enabled = 1 LIMIT 1",
    [restaurantUuid],
  );
  return rows.length ? toIntegration(rows[0]) : null;
}

export async function findTheForkTenantByRestaurantUuid(
  restaurantUuid: string,
  excludeTenantId?: string,
): Promise<string | null> {
  await ensureSchema();
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT tenant_id FROM tenant_thefork_integrations
      WHERE restaurant_uuid = ? AND enabled = 1
        ${excludeTenantId ? "AND tenant_id <> ?" : ""}
      LIMIT 1`,
    excludeTenantId ? [restaurantUuid, excludeTenantId] : [restaurantUuid],
  );
  return rows[0]?.tenant_id as string | undefined ?? null;
}

export interface SaveTheForkIntegrationInput {
  enabled?: boolean;
  clientId?: string;
  clientSecret?: string;
  restaurantUuid?: string;
  groupUuid?: string;
  rotateWebhookToken?: boolean;
}

export async function saveTheForkIntegration(
  tenantId: string,
  input: SaveTheForkIntegrationInput,
): Promise<{ integration: TheForkIntegration; webhookToken?: string }> {
  await ensureSchema();
  const existing = await getTheForkIntegration(tenantId);
  const now = new Date().toISOString();
  const webhookToken = input.rotateWebhookToken || !existing?.webhookTokenSet
    ? `tf_${randomBytes(24).toString("hex")}`
    : undefined;
  const clientId = input.clientId !== undefined ? input.clientId.trim().slice(0, 255) : existing?.clientId;
  const clientSecretEncrypted = input.clientSecret
    ? encryptSecret(input.clientSecret.slice(0, 1000))
    : null;
  const restaurantUuid = input.restaurantUuid !== undefined
    ? (isUuid(input.restaurantUuid.trim()) ? input.restaurantUuid.trim() : undefined)
    : existing?.restaurantUuid;
  const groupUuid = input.groupUuid !== undefined
    ? (input.groupUuid.trim() ? (isUuid(input.groupUuid.trim()) ? input.groupUuid.trim() : undefined) : undefined)
    : existing?.groupUuid;
  const enabled = input.enabled !== undefined ? Boolean(input.enabled) : Boolean(existing?.enabled);
  const webhookTokenHash = webhookToken ? hashToken(webhookToken) : null;

  await getPool().query(
    `INSERT INTO tenant_thefork_integrations
      (tenant_id, enabled, client_id, client_secret_encrypted, restaurant_uuid, group_uuid, webhook_token_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      enabled = VALUES(enabled),
      client_id = VALUES(client_id),
      client_secret_encrypted = COALESCE(VALUES(client_secret_encrypted), client_secret_encrypted),
      restaurant_uuid = VALUES(restaurant_uuid),
      group_uuid = VALUES(group_uuid),
      webhook_token_hash = COALESCE(VALUES(webhook_token_hash), webhook_token_hash),
      updated_at = VALUES(updated_at)`,
    [
      tenantId,
      enabled ? 1 : 0,
      clientId || null,
      clientSecretEncrypted,
      restaurantUuid ?? null,
      groupUuid ?? null,
      webhookTokenHash,
      existing?.createdAt ?? now,
      now,
    ],
  );
  return { integration: (await getTheForkIntegration(tenantId))!, webhookToken };
}

export async function verifyTheForkWebhookToken(tenantId: string, token: string): Promise<TheForkIntegration | null> {
  await ensureSchema();
  const [rows] = await getPool().query<IntegrationRow[]>(
    "SELECT * FROM tenant_thefork_integrations WHERE tenant_id = ? AND webhook_token_hash = ? AND enabled = 1",
    [tenantId, hashToken(token)],
  );
  return rows.length ? toIntegration(rows[0]) : null;
}

export async function markTheForkWebhookReceived(tenantId: string): Promise<void> {
  await ensureSchema();
  await getPool().query(
    "UPDATE tenant_thefork_integrations SET last_webhook_at = ?, updated_at = ? WHERE tenant_id = ?",
    [new Date().toISOString(), new Date().toISOString(), tenantId],
  );
}

export async function markTheForkSyncResult(tenantId: string, error?: string): Promise<void> {
  await ensureSchema();
  const now = new Date().toISOString();
  await getPool().query(
    "UPDATE tenant_thefork_integrations SET last_sync_at = ?, last_error = ?, updated_at = ? WHERE tenant_id = ?",
    [error ? null : now, error?.slice(0, 2000) ?? null, now, tenantId],
  );
}

export async function findExternalReservation(
  tenantId: string,
  provider: ExternalReservationProvider,
  externalId: string,
): Promise<string | null> {
  await ensureSchema();
  const [rows] = await getPool().query<LinkRow[]>(
    "SELECT reservation_id FROM external_reservation_links WHERE tenant_id = ? AND provider = ? AND external_id = ?",
    [tenantId, provider, externalId],
  );
  return rows[0]?.reservation_id ?? null;
}

export interface ExternalReservationView {
  provider: ExternalReservationProvider;
  label: string;
  externalId: string;
  externalStatus?: string;
  externalMealStatus?: string;
  externalUpdatedAt?: string;
}

export async function listExternalReservationViews(
  tenantId: string,
  reservationIds: string[],
): Promise<Map<string, ExternalReservationView>> {
  await ensureSchema();
  const ids = [...new Set(reservationIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const [rows] = await getPool().query<LinkRow[]>(
    `SELECT provider, external_id, reservation_id, external_status, external_meal_status, external_updated_at
     FROM external_reservation_links
     WHERE tenant_id = ? AND reservation_id IN (${ids.map(() => "?").join(",")})`,
    [tenantId, ...ids],
  );
  return new Map(rows.map((row) => [
    row.reservation_id,
    {
      provider: row.provider,
      label: row.provider === "thefork" ? "TheFork" : row.provider === "dish" ? "DISH" : row.provider,
      externalId: row.external_id,
      externalStatus: row.external_status ?? undefined,
      externalMealStatus: row.external_meal_status ?? undefined,
      externalUpdatedAt: row.external_updated_at ?? undefined,
    },
  ]));
}

export interface UpsertExternalReservationLinkInput {
  tenantId: string;
  provider: ExternalReservationProvider;
  externalId: string;
  reservationId: string;
  externalRestaurantId?: string;
  externalCustomerId?: string;
  externalStatus?: string;
  externalMealStatus?: string;
  externalUpdatedAt?: string;
  raw: unknown;
}

export async function upsertExternalReservationLink(input: UpsertExternalReservationLinkInput): Promise<void> {
  await ensureSchema();
  const now = new Date().toISOString();
  await getPool().query(
    `INSERT INTO external_reservation_links
      (tenant_id, provider, external_id, reservation_id, external_restaurant_id, external_customer_id,
       external_status, external_meal_status, external_updated_at, raw_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      reservation_id = VALUES(reservation_id),
      external_restaurant_id = VALUES(external_restaurant_id),
      external_customer_id = VALUES(external_customer_id),
      external_status = VALUES(external_status),
      external_meal_status = VALUES(external_meal_status),
      external_updated_at = VALUES(external_updated_at),
      raw_json = VALUES(raw_json),
      updated_at = VALUES(updated_at)`,
    [
      input.tenantId,
      input.provider,
      input.externalId,
      input.reservationId,
      input.externalRestaurantId ?? null,
      input.externalCustomerId ?? null,
      input.externalStatus ?? null,
      input.externalMealStatus ?? null,
      input.externalUpdatedAt ?? null,
      JSON.stringify(input.raw),
      now,
      now,
    ],
  );
}
