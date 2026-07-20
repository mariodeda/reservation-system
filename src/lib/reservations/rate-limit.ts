/**
 * Fixed-window rate limiter backed by MySQL so the limit holds across
 * multiple app instances.
 */
import { getPool } from "./mysql-pool";
import { ensureSchema } from "./mysql-schema";
import type { RowDataPacket } from "mysql2/promise";

async function mysqlLimit(key: string, max: number, windowMs: number, now: number): Promise<boolean> {
  await ensureSchema();
  const pool = getPool();
  const resetAt = now + windowMs;
  // Atomic upsert: start (or restart an expired) window at 1, otherwise increment.
  await pool.query(
    `INSERT INTO rate_limits (k, count, reset_at) VALUES (?, 1, ?)
     ON DUPLICATE KEY UPDATE
       count = IF(reset_at < ?, 1, count + 1),
       reset_at = IF(reset_at < ?, VALUES(reset_at), reset_at)`,
    [key, resetAt, now, now],
  );
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT count FROM rate_limits WHERE k = ?",
    [key],
  );
  const count = rows.length ? Number(rows[0].count) : 1;
  // Probabilistic cleanup (~2% of calls) so the table doesn't grow unboundedly.
  if (count === 1) {
    pool.query("DELETE FROM rate_limits WHERE reset_at < ?", [now]).catch(() => {});
  }
  return count <= max;
}

export async function rateLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  return mysqlLimit(key, max, windowMs, Date.now());
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "local";
}
