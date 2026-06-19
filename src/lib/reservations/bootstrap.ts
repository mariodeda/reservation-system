/**
 * Boot-time bootstrap that runs on every Node startup (from instrumentation.ts),
 * AFTER the schema is migrated. Unlike a migration — which the runner records as
 * "applied" and never repeats — this is idempotent and self-healing: it seeds a
 * default platform admin whenever `platform_admins` is empty, so an operator can
 * always recover access by emptying the table and restarting.
 *
 * The password is baked as a scrypt hash (never plaintext here). Rotate it after
 * first sign-in via the platform console or `npm run platform -- set-password`.
 */
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "./mysql-pool";

/** Username + precomputed scrypt hash for the seeded operator account. */
export const BOOTSTRAP_ADMIN_USERNAME = "ops";
const BOOTSTRAP_ADMIN_HASH =
  "scrypt$6ce781657b4c3a8287ae67462c033f5c$5e85457a0655cb509fa92a0a2a6ce12b2ee5610509fc3c2be4a55a56effca52a8a81767342e82cefc3aca743c2f3cca0c114a8019a9d6b662d67fde9e752f0d0";

/**
 * Seed the default platform admin if (and only if) no platform admin exists.
 * Returns whether a row was created. Safe to call on every boot.
 */
export async function ensureBootstrapPlatformAdmin(): Promise<{ created: boolean }> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>("SELECT 1 FROM platform_admins LIMIT 1");
  if (rows.length > 0) return { created: false };
  await pool.query(
    "INSERT INTO platform_admins (username, password_hash, created_at) VALUES (?, ?, ?)",
    [BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_HASH, new Date().toISOString()],
  );
  return { created: true };
}
