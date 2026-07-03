import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "./mysql-pool";
import { ensureSchema } from "./mysql-schema";
import {
  generatePublicKey,
  type Tenant,
  type TenantSettings,
} from "./tenant";

export interface NewTenantInput {
  id: string;
  slug: string;
  name: string;
  settings: TenantSettings;
  adminUsername: string;
  adminPasswordHash: string;
  hosts?: string[];
  /** Stable public key; generated if omitted. */
  publicKey?: string;
}

export interface TenantStore {
  getByHost(host: string): Promise<Tenant | null>;
  getBySlug(slug: string): Promise<Tenant | null>;
  getByPublicKey(key: string): Promise<Tenant | null>;
  getById(id: string): Promise<Tenant | null>;
  list(): Promise<Tenant[]>;
  create(input: NewTenantInput): Promise<Tenant>;
  addDomain(tenantId: string, host: string): Promise<void>;
  removeDomain(host: string): Promise<void>;
  listDomains(tenantId: string): Promise<string[]>;
  setPassword(tenantId: string, passwordHash: string): Promise<void>;
  setStatus(tenantId: string, status: Tenant["status"]): Promise<void>;
  /** Replace a tenant's settings (and keep the name column in sync). */
  updateSettings(tenantId: string, settings: TenantSettings): Promise<void>;
  /** Delete a tenant and all its data (domains, reservations, config). */
  remove(tenantId: string): Promise<void>;
}

/* ------------------------------- MySQL -------------------------------- */

interface TenantRow extends RowDataPacket {
  id: string;
  slug: string;
  name: string;
  status: Tenant["status"];
  public_key: string;
  settings: unknown;
  admin_username: string;
  admin_password_hash: string;
  created_at: string;
}

const TENANT_COLS =
  "id, slug, name, status, public_key, settings, admin_username, admin_password_hash, created_at";

function toTenant(r: TenantRow): Tenant {
  const settings = (typeof r.settings === "string" ? JSON.parse(r.settings) : r.settings) as TenantSettings;
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    status: r.status,
    publicKey: r.public_key,
    settings,
    adminUsername: r.admin_username,
    adminPasswordHash: r.admin_password_hash,
    createdAt: r.created_at,
  };
}

class MySqlTenantStore implements TenantStore {
  async getByHost(host: string): Promise<Tenant | null> {
    await ensureSchema();
    const [rows] = await getPool().query<TenantRow[]>(
      `SELECT ${TENANT_COLS} FROM tenants
       WHERE id = (SELECT tenant_id FROM tenant_domains WHERE host = ?) AND status = 'active'`,
      [host],
    );
    return rows.length ? toTenant(rows[0]) : null;
  }

  async getBySlug(slug: string): Promise<Tenant | null> {
    await ensureSchema();
    if (!slug) return null;
    const [rows] = await getPool().query<TenantRow[]>(
      `SELECT ${TENANT_COLS} FROM tenants WHERE slug = ? AND status = 'active'`,
      [slug],
    );
    return rows.length ? toTenant(rows[0]) : null;
  }

  async getByPublicKey(key: string): Promise<Tenant | null> {
    await ensureSchema();
    if (!key) return null;
    const [rows] = await getPool().query<TenantRow[]>(
      `SELECT ${TENANT_COLS} FROM tenants WHERE public_key = ? AND status = 'active'`,
      [key],
    );
    return rows.length ? toTenant(rows[0]) : null;
  }

  async getById(id: string): Promise<Tenant | null> {
    await ensureSchema();
    const [rows] = await getPool().query<TenantRow[]>(
      `SELECT ${TENANT_COLS} FROM tenants WHERE id = ?`,
      [id],
    );
    return rows.length ? toTenant(rows[0]) : null;
  }

  async list(): Promise<Tenant[]> {
    await ensureSchema();
    const [rows] = await getPool().query<TenantRow[]>(
      `SELECT ${TENANT_COLS} FROM tenants ORDER BY created_at`,
    );
    return rows.map(toTenant);
  }

  async create(input: NewTenantInput): Promise<Tenant> {
    await ensureSchema();
    const pool = getPool();
    const createdAt = new Date().toISOString();
    const publicKey = input.publicKey || generatePublicKey();
    await pool.query(
      `INSERT INTO tenants (id, slug, name, status, public_key, settings, admin_username, admin_password_hash, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        input.id,
        input.slug,
        input.name,
        "active",
        publicKey,
        JSON.stringify(input.settings),
        input.adminUsername,
        input.adminPasswordHash,
        createdAt,
      ],
    );
    for (const host of input.hosts ?? []) await this.addDomain(input.id, host);
    return {
      id: input.id,
      slug: input.slug,
      name: input.name,
      status: "active",
      publicKey,
      settings: input.settings,
      adminUsername: input.adminUsername,
      adminPasswordHash: input.adminPasswordHash,
      createdAt,
    };
  }

  async addDomain(tenantId: string, host: string): Promise<void> {
    await ensureSchema();
    const normalized = host.trim().toLowerCase();
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT tenant_id FROM tenant_domains WHERE host = ?",
      [normalized],
    );
    const existingTenantId = rows[0]?.tenant_id as string | undefined;
    if (existingTenantId) {
      if (existingTenantId === tenantId) return;
      throw new Error("DOMAIN_ALREADY_MAPPED");
    }
    await getPool().query("INSERT INTO tenant_domains (host, tenant_id) VALUES (?, ?)", [
      normalized,
      tenantId,
    ]);
  }

  async removeDomain(host: string): Promise<void> {
    await ensureSchema();
    await getPool().query("DELETE FROM tenant_domains WHERE host = ?", [
      host.trim().toLowerCase(),
    ]);
  }

  async listDomains(tenantId: string): Promise<string[]> {
    await ensureSchema();
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT host FROM tenant_domains WHERE tenant_id = ? ORDER BY host",
      [tenantId],
    );
    return rows.map((r) => r.host as string);
  }

  async updateSettings(tenantId: string, settings: TenantSettings): Promise<void> {
    await ensureSchema();
    await getPool().query("UPDATE tenants SET settings = ?, name = ? WHERE id = ?", [
      JSON.stringify(settings),
      settings.name,
      tenantId,
    ]);
  }

  async remove(tenantId: string): Promise<void> {
    await ensureSchema();
    const pool = getPool();
    // cascade: data first, then domains, then the tenant row
    await pool.query("DELETE FROM external_reservation_links WHERE tenant_id = ?", [tenantId]);
    await pool.query("DELETE FROM tenant_thefork_integrations WHERE tenant_id = ?", [tenantId]);
    await pool.query("DELETE FROM reservation_emails WHERE tenant_id = ?", [tenantId]);
    await pool.query("DELETE FROM tenant_smtp_health WHERE tenant_id = ?", [tenantId]);
    await pool.query("DELETE FROM waitlist WHERE tenant_id = ?", [tenantId]);
    await pool.query("DELETE FROM customer_profiles WHERE tenant_id = ?", [tenantId]);
    await pool.query("DELETE FROM tables WHERE tenant_id = ?", [tenantId]);
    await pool.query("DELETE FROM reservations WHERE tenant_id = ?", [tenantId]);
    await pool.query("DELETE FROM app_config WHERE tenant_id = ?", [tenantId]);
    await pool.query("DELETE FROM tenant_domains WHERE tenant_id = ?", [tenantId]);
    await pool.query("DELETE FROM tenants WHERE id = ?", [tenantId]);
  }

  async setPassword(tenantId: string, passwordHash: string): Promise<void> {
    await ensureSchema();
    await getPool().query("UPDATE tenants SET admin_password_hash = ? WHERE id = ?", [
      passwordHash,
      tenantId,
    ]);
  }

  async setStatus(tenantId: string, status: Tenant["status"]): Promise<void> {
    await ensureSchema();
    await getPool().query("UPDATE tenants SET status = ? WHERE id = ?", [status, tenantId]);
  }
}

let store: TenantStore | null = null;
export function getTenantStore(): TenantStore {
  if (store) return store;
  store = new MySqlTenantStore();
  return store;
}

/** Test-only: drop the cached tenant store so env changes take effect. */
export function resetTenantStore(): void {
  store = null;
}
