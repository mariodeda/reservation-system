import mysql, { type Pool } from "mysql2/promise";

let pool: Pool | null = null;

/** Single shared connection pool used by the store and the rate limiter. */
export function getPool(): Pool {
  if (pool) return pool;
  if (!process.env.DATABASE_URL && !process.env.MYSQL_HOST) {
    throw new Error(
      "[reservations] MySQL is required. Set DATABASE_URL or MYSQL_HOST/MYSQL_USER/MYSQL_PASSWORD/MYSQL_DATABASE.",
    );
  }
  if (process.env.DATABASE_URL) {
    // If the URL has no database in the path (e.g. mysql://host:3306 with no
    // trailing /dbname), fall back to MYSQL_DATABASE to avoid ER_NO_DB_ERROR.
    let url = process.env.DATABASE_URL;
    try {
      const parsed = new URL(url);
      if ((!parsed.pathname || parsed.pathname === "/") && process.env.MYSQL_DATABASE) {
        parsed.pathname = `/${process.env.MYSQL_DATABASE}`;
        url = parsed.toString();
      }
    } catch {
      // malformed URL — let mysql2 surface the real error
    }
    pool = mysql.createPool(url);
  } else {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      charset: "utf8mb4",
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
