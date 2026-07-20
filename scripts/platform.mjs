#!/usr/bin/env node
/**
 * Bootstrap CLI for platform-admin (operator) accounts. Run once to create the
 * first superuser; afterwards everything is managed in the /platform UI.
 *
 * Usage:
 *   node scripts/platform.mjs create-admin --username ops --password 'secret123'
 *   node scripts/platform.mjs set-password --username ops --password 'newsecret'
 *   node scripts/platform.mjs list
 */
import mysql from "mysql2/promise";
import { randomBytes, scryptSync } from "node:crypto";

function hashPassword(pw) {
  const salt = randomBytes(16);
  const dk = scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString("hex")}$${dk.toString("hex")}`;
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) out[a.slice(2)] = argv[++i];
    else out._.push(a);
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
    CREATE TABLE IF NOT EXISTS platform_admins (
      username VARCHAR(120) NOT NULL PRIMARY KEY,
      password_hash VARCHAR(256) NOT NULL,
      created_at VARCHAR(32) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  const pool = getPool();
  await ensureSchema(pool);
  try {
    if (cmd === "create-admin") {
      if (!args.username || !args.password || args.password.length < 8) {
        console.error("create-admin requires --username and --password (>= 8 chars)");
        process.exitCode = 1;
        return;
      }
      await pool.query(
        "INSERT INTO platform_admins (username, password_hash, created_at) VALUES (?, ?, ?)",
        [args.username, hashPassword(args.password), new Date().toISOString()],
      );
      console.log(`Created platform admin '${args.username}'`);
    } else if (cmd === "set-password") {
      if (!args.username || !args.password || args.password.length < 8) {
        console.error("set-password requires --username and --password (>= 8 chars)");
        process.exitCode = 1;
        return;
      }
      const [res] = await pool.query("UPDATE platform_admins SET password_hash = ? WHERE username = ?", [
        hashPassword(args.password),
        args.username,
      ]);
      if (res.affectedRows === 0) console.error(`No platform admin '${args.username}'`);
      else console.log(`Password updated for '${args.username}'`);
    } else if (cmd === "list") {
      const [rows] = await pool.query("SELECT username, created_at FROM platform_admins ORDER BY created_at");
      if (rows.length === 0) console.log("(no platform admins — run create-admin)");
      for (const r of rows) console.log(`${r.username}  (since ${r.created_at})`);
    } else {
      console.error("Commands: create-admin | set-password | list");
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
