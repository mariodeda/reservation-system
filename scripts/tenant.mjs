#!/usr/bin/env node
/**
 * Operator CLI for provisioning tenants (restaurants). Talks to MySQL directly
 * using the same connection env as the app (DATABASE_URL or MYSQL_*), and hashes
 * passwords with the same scrypt scheme as src/lib/reservations/tenant.ts.
 *
 * Usage:
 *   node scripts/tenant.mjs create --slug acme --name "Acme Osteria" \
 *        --host acme.example.com --host admin.acme.example.com \
 *        --username staff --password 's3cret' \
 *        [--url https://acme.example.com] [--email hi@acme.com] [--phone +39...] \
 *        [--timezone Europe/Rome] [--locale en-US] [--primary '#f2ca50'] [--on-primary '#3c2f00'] \
 *        [--no-auto-confirm] [--no-email]
 *   node scripts/tenant.mjs add-domain --slug acme --host new.acme.com
 *   node scripts/tenant.mjs set-password --slug acme --password 'newpw'
 *   node scripts/tenant.mjs disable --slug acme
 *   node scripts/tenant.mjs list
 */
import mysql from "mysql2/promise";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";

function hashPassword(pw) {
  const salt = randomBytes(16);
  const dk = scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString("hex")}$${dk.toString("hex")}`;
}

function parseArgs(argv) {
  const out = { _: [], host: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (key === "no-auto-confirm" || key === "no-email") {
        out[key] = true;
      } else {
        const val = argv[++i];
        if (key === "host") out.host.push(val);
        else out[key] = val;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function getPool() {
  if (process.env.DATABASE_URL) return mysql.createPool(process.env.DATABASE_URL);
  if (!process.env.MYSQL_HOST) {
    console.error("No MySQL configured. Set DATABASE_URL or MYSQL_HOST/MYSQL_*.");
    process.exit(1);
  }
  return mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    charset: "utf8mb4",
  });
}

async function ensureSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id CHAR(36) NOT NULL PRIMARY KEY,
      slug VARCHAR(64) NOT NULL UNIQUE,
      name VARCHAR(160) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      public_key VARCHAR(64) NULL,
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
}

async function tenantIdBySlug(pool, slug) {
  const [rows] = await pool.query("SELECT id FROM tenants WHERE slug = ?", [slug]);
  return rows.length ? rows[0].id : null;
}

async function cmdCreate(pool, args) {
  if (!args.slug || !args.name || !args.username || !args.password) {
    console.error("create requires --slug --name --username --password (and at least one --host)");
    process.exit(1);
  }
  if (await tenantIdBySlug(pool, args.slug)) {
    console.error(`Tenant slug '${args.slug}' already exists.`);
    process.exit(1);
  }
  const id = randomUUID();
  const settings = {
    name: args.name,
    url: args.url || "",
    contactEmail: args.email || "",
    contactPhone: args.phone || "",
    locale: args.locale || "en-US",
    timezone: args.timezone || "Europe/Rome",
    autoConfirm: !args["no-auto-confirm"],
    emailEnabled: !args["no-email"],
  };
  if (args.primary || args["on-primary"]) {
    settings.theme = {};
    if (args.primary) settings.theme.primary = args.primary;
    if (args["on-primary"]) settings.theme.onPrimary = args["on-primary"];
  }
  if (args["allowed-origins"]) {
    settings.allowedOrigins = String(args["allowed-origins"])
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  }
  const publicKey = `pk_${randomBytes(16).toString("hex")}`;
  await pool.query(
    `INSERT INTO tenants (id, slug, name, status, public_key, settings, admin_username, admin_password_hash, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, args.slug, args.name, "active", publicKey, JSON.stringify(settings), args.username, hashPassword(args.password), new Date().toISOString()],
  );
  for (const host of args.host) {
    await pool.query(
      "INSERT INTO tenant_domains (host, tenant_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE tenant_id = VALUES(tenant_id)",
      [host.trim().toLowerCase(), id],
    );
  }
  console.log(`Created tenant '${args.slug}' (${id})`);
  console.log(`  hosts: ${args.host.join(", ") || "(none — add with add-domain)"}`);
  console.log(`  login: ${args.username}`);
  console.log(`  public key: ${publicKey}  (set NEXT_PUBLIC_RESERVATIONS_TENANT on the marketing site)`);
}

async function cmdAddDomain(pool, args) {
  const id = await tenantIdBySlug(pool, args.slug);
  if (!id) return fail(`Unknown tenant slug '${args.slug}'`);
  if (args.host.length === 0) return fail("add-domain requires at least one --host");
  for (const host of args.host) {
    await pool.query(
      "INSERT INTO tenant_domains (host, tenant_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE tenant_id = VALUES(tenant_id)",
      [host.trim().toLowerCase(), id],
    );
    console.log(`Mapped ${host} -> ${args.slug}`);
  }
}

async function cmdSetPassword(pool, args) {
  if (!args.password) return fail("set-password requires --password");
  const id = await tenantIdBySlug(pool, args.slug);
  if (!id) return fail(`Unknown tenant slug '${args.slug}'`);
  await pool.query("UPDATE tenants SET admin_password_hash = ? WHERE id = ?", [hashPassword(args.password), id]);
  console.log(`Password updated for '${args.slug}'`);
}

async function cmdDisable(pool, args) {
  const id = await tenantIdBySlug(pool, args.slug);
  if (!id) return fail(`Unknown tenant slug '${args.slug}'`);
  await pool.query("UPDATE tenants SET status = 'disabled' WHERE id = ?", [id]);
  console.log(`Disabled '${args.slug}'`);
}

async function cmdList(pool) {
  const [tenants] = await pool.query(
    "SELECT id, slug, name, status, admin_username FROM tenants ORDER BY created_at",
  );
  for (const t of tenants) {
    const [domains] = await pool.query("SELECT host FROM tenant_domains WHERE tenant_id = ?", [t.id]);
    console.log(`${t.slug}  [${t.status}]  ${t.name}`);
    console.log(`  staff login: /admin/${t.slug}/login  (username: ${t.admin_username})`);
    console.log(`  hosts: ${domains.map((d) => d.host).join(", ") || "(none)"}`);
  }
  if (tenants.length === 0) console.log("(no tenants)");
}

function fail(msg) {
  console.error(msg);
  process.exitCode = 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  const pool = getPool();
  await ensureSchema(pool);
  try {
    switch (cmd) {
      case "create": await cmdCreate(pool, args); break;
      case "add-domain": await cmdAddDomain(pool, args); break;
      case "set-password": await cmdSetPassword(pool, args); break;
      case "disable": await cmdDisable(pool, args); break;
      case "list": await cmdList(pool); break;
      default:
        console.error("Commands: create | add-domain | set-password | disable | list");
        process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
