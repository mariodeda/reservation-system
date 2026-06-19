import mysql, { type Pool, type PoolOptions } from "mysql2/promise";

let pool: Pool | null = null;

/** Try to percent-decode a credential segment; fall back to the raw value. */
function decodeSegment(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Tolerant `mysql://` connection-string parser.
 *
 * Built because `new URL()` rejects connection strings whose password contains
 * unescaped URL-significant characters (`/`, `|`, `@`, `?`, …) — which managed
 * MySQL providers routinely generate. Rather than forcing operators to
 * percent-encode their password, we parse the components ourselves:
 *   - the password is everything between the first `:` of the userinfo and the
 *     LAST `@`, so `/`, `|`, `=`, `?` inside it are taken literally;
 *   - already-percent-encoded credentials still decode correctly (back-compat).
 *
 * Returns mysql2 connection options, or `null` if the string isn't a
 * recognizable `mysql://` URL (caller then lets mysql2 surface the real error).
 */
export function parseDatabaseUrl(raw: string): PoolOptions | null {
  const schemeMatch = /^mysql(?:x)?:\/\//i.exec(raw);
  if (!schemeMatch) return null;
  let rest = raw.slice(schemeMatch[0].length);

  // Split off the query string (e.g. ?ssl=true) before touching credentials.
  let query = "";
  const qIdx = rest.indexOf("?");
  if (qIdx >= 0) {
    query = rest.slice(qIdx + 1);
    rest = rest.slice(0, qIdx);
  }

  // userinfo is everything before the LAST '@' (so '@' in a password is fine).
  let userinfo = "";
  let hostPath = rest;
  const atIdx = rest.lastIndexOf("@");
  if (atIdx >= 0) {
    userinfo = rest.slice(0, atIdx);
    hostPath = rest.slice(atIdx + 1);
  }

  let user: string | undefined;
  let password: string | undefined;
  if (userinfo) {
    const colonIdx = userinfo.indexOf(":");
    if (colonIdx >= 0) {
      user = decodeSegment(userinfo.slice(0, colonIdx));
      password = decodeSegment(userinfo.slice(colonIdx + 1));
    } else {
      user = decodeSegment(userinfo);
    }
  }

  // host[:port][/database] — handle bracketed IPv6 hosts too.
  const slashIdx = hostPath.indexOf("/");
  const authority = slashIdx >= 0 ? hostPath.slice(0, slashIdx) : hostPath;
  const dbPart = slashIdx >= 0 ? hostPath.slice(slashIdx + 1) : "";
  const hostMatch = /^(\[[^\]]+\]|[^:]*)(?::(\d+))?$/.exec(authority);
  const host = hostMatch?.[1] ? hostMatch[1].replace(/^\[|\]$/g, "") : undefined;
  const port = hostMatch?.[2] ? Number(hostMatch[2]) : undefined;
  const database = dbPart ? decodeSegment(dbPart) : undefined;

  const opts: PoolOptions = {};
  if (host) opts.host = host;
  if (port) opts.port = port;
  if (user) opts.user = user;
  if (password !== undefined) opts.password = password;
  if (database) opts.database = database;

  // Honor a TLS request from the query string for managed providers that need it.
  const params = new URLSearchParams(query);
  const ssl = params.get("ssl");
  const sslmode = params.get("sslmode");
  if (ssl === "true" || (sslmode && sslmode !== "disable")) {
    opts.ssl = { rejectUnauthorized: sslmode === "verify-full" || sslmode === "verify-ca" };
  }

  return opts;
}

/** Single shared connection pool used by the store and the rate limiter. */
export function getPool(): Pool {
  if (pool) return pool;
  if (!process.env.DATABASE_URL && !process.env.MYSQL_HOST) {
    throw new Error(
      "[reservations] MySQL is required. Set DATABASE_URL or MYSQL_HOST/MYSQL_USER/MYSQL_PASSWORD/MYSQL_DATABASE.",
    );
  }

  const base: PoolOptions = {
    waitForConnections: true,
    connectionLimit: 10,
    charset: "utf8mb4",
  };

  if (process.env.DATABASE_URL) {
    const parsed = parseDatabaseUrl(process.env.DATABASE_URL);
    if (parsed) {
      // Fall back to MYSQL_DATABASE when the URL omits a database, to avoid
      // ER_NO_DB_ERROR (e.g. mysql://host:3306 with no trailing /dbname).
      if (!parsed.database && process.env.MYSQL_DATABASE) {
        parsed.database = process.env.MYSQL_DATABASE;
      }
      pool = mysql.createPool({ ...base, ...parsed });
    } else {
      // Not a recognizable mysql:// URL — hand it to mysql2 as-is so it can
      // surface the real error.
      pool = mysql.createPool(process.env.DATABASE_URL);
    }
  } else {
    pool = mysql.createPool({
      ...base,
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
    });
  }
  return pool;
}

/** Test-only: drop the cached pool so a new one is created on next call. */
export function resetPool(): void {
  pool = null;
}

// Drain the connection pool on graceful shutdown so deployments don't hang.
process.once("SIGTERM", () => {
  if (pool) pool.end().catch(() => {});
});
