/**
 * Versioned migrations for the multi-tenant reservation system.
 *
 * Each migration is an async function keyed by a monotonically increasing
 * version number. `ensureSchema()` creates the `schema_migrations` tracking
 * table on first run, then applies every pending migration in order.
 *
 * Rules for adding migrations:
 *  - Append a new entry; never renumber existing ones.
 *  - Keep each migration idempotent where possible (IF NOT EXISTS / IF EXISTS).
 *  - Use `ensureColumn` for adding columns to existing tables.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { randomBytes } from "node:crypto";
import { getPool } from "./mysql-pool";

let ready: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!ready) ready = migrate();
  return ready;
}

/** Test-only: forget the cached schema promise (e.g. between in-memory DBs). */
export function resetSchemaCache(): void {
  ready = null;
}

/* ------------------------------------------------------------------ helpers */

async function ensureColumn(
  pool: Pool,
  table: string,
  column: string,
  ddl: string,
): Promise<void> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column],
  );
  if (rows.length === 0) {
    await pool.query(`ALTER TABLE \`${table}\` ${ddl}`);
  }
}

/* ---------------------------------------------------------------- migrations */

type Migration = { version: number; run: (pool: Pool) => Promise<void> };

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    run: async (pool) => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tenants (
          id CHAR(36) NOT NULL PRIMARY KEY,
          slug VARCHAR(64) NOT NULL UNIQUE,
          name VARCHAR(160) NOT NULL,
          status VARCHAR(16) NOT NULL DEFAULT 'active',
          settings JSON NOT NULL,
          admin_username VARCHAR(120) NOT NULL,
          admin_password_hash VARCHAR(256) NOT NULL,
          created_at VARCHAR(32) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS tenant_domains (
          host VARCHAR(255) NOT NULL PRIMARY KEY,
          tenant_id CHAR(36) NOT NULL,
          INDEX idx_tenant (tenant_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS reservations (
          id CHAR(36) NOT NULL PRIMARY KEY,
          tenant_id CHAR(36) NOT NULL,
          \`date\` CHAR(10) NOT NULL,
          \`time\` CHAR(5) NOT NULL,
          service VARCHAR(40) NOT NULL,
          party_size INT NOT NULL,
          name VARCHAR(120) NOT NULL,
          email VARCHAR(200) NOT NULL,
          phone VARCHAR(40) NOT NULL,
          occasion VARCHAR(80) NULL,
          notes TEXT NULL,
          status VARCHAR(16) NOT NULL,
          source VARCHAR(8) NOT NULL,
          created_at VARCHAR(32) NOT NULL,
          updated_at VARCHAR(32) NOT NULL,
          INDEX idx_tenant_date (tenant_id, \`date\`),
          INDEX idx_tenant_date_time (tenant_id, \`date\`, \`time\`),
          INDEX idx_tenant_status (tenant_id, status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_config (
          tenant_id CHAR(36) NOT NULL,
          k VARCHAR(64) NOT NULL,
          v JSON NOT NULL,
          PRIMARY KEY (tenant_id, k)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS rate_limits (
          k VARCHAR(160) NOT NULL PRIMARY KEY,
          count INT NOT NULL,
          reset_at BIGINT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS platform_admins (
          username VARCHAR(120) NOT NULL PRIMARY KEY,
          password_hash VARCHAR(256) NOT NULL,
          created_at VARCHAR(32) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    },
  },
  {
    // Defensive: add tenant_id column to reservations tables that pre-date
    // the multi-tenant migration (single-tenant MySQL installs upgrading in-place).
    version: 2,
    run: async (pool) => {
      await ensureColumn(
        pool,
        "reservations",
        "tenant_id",
        "ADD COLUMN tenant_id CHAR(36) NOT NULL DEFAULT 'default'",
      );
    },
  },
  {
    version: 4,
    run: async (pool) => {
      await ensureColumn(pool, "reservations", "table_label", "ADD COLUMN table_label VARCHAR(50) NULL DEFAULT NULL AFTER notes");
    },
  },
  {
    version: 5,
    run: async (pool) => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS customer_profiles (
          id CHAR(36) NOT NULL PRIMARY KEY,
          tenant_id CHAR(36) NOT NULL,
          email VARCHAR(200) NOT NULL,
          vip TINYINT(1) NOT NULL DEFAULT 0,
          staff_notes TEXT NULL,
          dietary_notes TEXT NULL,
          updated_at VARCHAR(32) NOT NULL,
          UNIQUE KEY uq_tenant_email (tenant_id, email),
          INDEX idx_cp_tenant (tenant_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    },
  },
  {
    version: 6,
    run: async (pool) => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS reservation_feedback (
          token CHAR(36) NOT NULL PRIMARY KEY,
          reservation_id CHAR(36) NOT NULL,
          tenant_id CHAR(36) NOT NULL,
          sent_at VARCHAR(32) NOT NULL,
          filled_at VARCHAR(32) NULL,
          rating TINYINT NULL,
          comment TEXT NULL,
          UNIQUE KEY uq_rf_reservation (reservation_id),
          INDEX idx_rf_tenant (tenant_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    },
  },
  {
    version: 7,
    run: async (pool) => {
      await ensureColumn(
        pool,
        "reservation_feedback",
        "expires_at",
        "ADD COLUMN expires_at VARCHAR(32) NULL DEFAULT NULL AFTER sent_at",
      );
      // Give existing open tokens 90 days from now; already-filled ones keep NULL.
      await pool.query(
        `UPDATE reservation_feedback SET expires_at = DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 90 DAY), '%Y-%m-%dT%TZ') WHERE expires_at IS NULL AND filled_at IS NULL`,
      );
    },
  },
  {
    // No-op. This previously seeded a platform admin whose plaintext password
    // was lost; seeding now lives in migration v12 with a documented password.
    // Left in place (not deleted) so already-applied installs keep a stable
    // version history. Existing DBs that ran this keep their seeded row; v12's
    // empty-table guard then correctly skips them.
    version: 3,
    run: async () => {},
  },
  {
    // Multi-offering support: every reservation belongs to an offering. The
    // column defaults to 'main' so rows inserted by old code during rollout —
    // and all pre-existing rows — are attributed to the primary offering, which
    // is exactly what getOfferings() synthesizes for a single-offering tenant.
    version: 8,
    run: async (pool) => {
      await ensureColumn(
        pool,
        "reservations",
        "offering",
        "ADD COLUMN offering VARCHAR(40) NOT NULL DEFAULT 'main' AFTER `time`",
      );
      // Belt-and-suspenders: attribute any NULL/empty rows to the primary offering.
      await pool.query(
        "UPDATE reservations SET offering = 'main' WHERE offering IS NULL OR offering = ''",
      );
      // Capacity counting and analytics now also filter/group by offering.
      const [idx] = await pool.query<RowDataPacket[]>(
        `SELECT 1 FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = 'reservations'
           AND index_name = 'idx_tenant_date_offering'`,
      );
      if ((idx as RowDataPacket[]).length === 0) {
        await pool.query(
          "ALTER TABLE reservations ADD INDEX idx_tenant_date_offering (tenant_id, `date`, offering)",
        );
      }
    },
  },
  {
    // Physical table management. `tables` holds managed tables; reservations gain
    // an optional table_id FK (table_label is kept as the denormalized display
    // label / legacy free-text fallback, so existing rows are untouched).
    version: 9,
    run: async (pool) => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tables (
          id CHAR(36) NOT NULL PRIMARY KEY,
          tenant_id CHAR(36) NOT NULL,
          offering VARCHAR(40) NULL,
          label VARCHAR(50) NOT NULL,
          capacity INT NOT NULL,
          min_party INT NOT NULL DEFAULT 1,
          zone VARCHAR(60) NULL,
          sort_order INT NOT NULL DEFAULT 0,
          joinable TINYINT(1) NOT NULL DEFAULT 0,
          active TINYINT(1) NOT NULL DEFAULT 1,
          created_at VARCHAR(32) NOT NULL,
          INDEX idx_tables_tenant (tenant_id, active),
          INDEX idx_tables_tenant_offering (tenant_id, offering)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await ensureColumn(
        pool,
        "reservations",
        "table_id",
        "ADD COLUMN table_id CHAR(36) NULL DEFAULT NULL AFTER table_label",
      );
    },
  },
  {
    // Waitlist: staff-facing live queue of parties waiting for a table. Seating
    // an entry creates a reservation and links back via seated_reservation_id.
    version: 10,
    run: async (pool) => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS waitlist (
          id CHAR(36) NOT NULL PRIMARY KEY,
          tenant_id CHAR(36) NOT NULL,
          offering VARCHAR(40) NOT NULL DEFAULT 'main',
          \`date\` CHAR(10) NOT NULL,
          name VARCHAR(120) NOT NULL,
          phone VARCHAR(40) NULL,
          email VARCHAR(200) NULL,
          party_size INT NOT NULL,
          quoted_wait_min INT NULL,
          pager_label VARCHAR(40) NULL,
          status VARCHAR(16) NOT NULL DEFAULT 'waiting',
          notes TEXT NULL,
          seated_reservation_id CHAR(36) NULL,
          created_at VARCHAR(32) NOT NULL,
          notified_at VARCHAR(32) NULL,
          seated_at VARCHAR(32) NULL,
          updated_at VARCHAR(32) NOT NULL,
          INDEX idx_waitlist_tenant_date (tenant_id, \`date\`, status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    },
  },
  {
    // Stable public tenant key — the identifier marketing sites send to the
    // shared reservation API (scalable multi-site → single-service routing,
    // decoupled from host/slug). Add nullable, backfill every existing tenant
    // with a generated key, then enforce uniqueness.
    version: 11,
    run: async (pool) => {
      await ensureColumn(
        pool,
        "tenants",
        "public_key",
        "ADD COLUMN public_key VARCHAR(64) NULL DEFAULT NULL AFTER status",
      );
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT id FROM tenants WHERE public_key IS NULL OR public_key = ''",
      );
      for (const r of rows as RowDataPacket[]) {
        await pool.query("UPDATE tenants SET public_key = ? WHERE id = ?", [
          `pk_${randomBytes(16).toString("hex")}`,
          (r as { id: string }).id,
        ]);
      }
      const [idx] = await pool.query<RowDataPacket[]>(
        `SELECT 1 FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = 'tenants'
           AND index_name = 'uq_tenants_public_key'`,
      );
      if ((idx as RowDataPacket[]).length === 0) {
        await pool.query(
          "ALTER TABLE tenants ADD UNIQUE KEY uq_tenants_public_key (public_key)",
        );
      }
    },
  },
  {
    // Multiple physical tables can back one reservation when staff join tables
    // for a larger party. table_id remains the primary/display table for legacy
    // reads; table_ids is the authoritative conflict set when present.
    version: 13,
    run: async (pool) => {
      await ensureColumn(
        pool,
        "reservations",
        "table_ids",
        "ADD COLUMN table_ids JSON NULL DEFAULT NULL AFTER table_id",
      );
    },
  },
  {
    // No-op. Seeding the default platform admin moved to a boot-time bootstrap
    // (src/lib/reservations/bootstrap.ts) so it self-heals when the table is
    // emptied — a one-shot migration cannot, since the runner records it as
    // applied even when its guard inserts nothing.
    version: 12,
    run: async () => {},
  },
];

/* ------------------------------------------------------------------ runner */

async function migrate(): Promise<void> {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INT NOT NULL PRIMARY KEY,
      applied_at VARCHAR(32) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT version FROM schema_migrations ORDER BY version",
  );
  const applied = new Set(rows.map((r) => r.version as number));

  // Apply strictly in ascending version order regardless of declaration order
  // (the array is intentionally not pre-sorted; later versions may depend on
  // columns/tables created by earlier ones).
  const ordered = [...MIGRATIONS].sort((a, b) => a.version - b.version);
  for (const m of ordered) {
    if (applied.has(m.version)) continue;
    await m.run(pool);
    await pool.query(
      "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
      [m.version, new Date().toISOString()],
    );
  }
}
