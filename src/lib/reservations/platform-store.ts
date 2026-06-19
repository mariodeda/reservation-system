import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "./mysql-pool";
import { ensureSchema } from "./mysql-schema";
import { hashPassword, verifyPassword } from "./tenant";

export interface PlatformStore {
  verifyLogin(username: string, password: string): Promise<boolean>;
  createAdmin(username: string, password: string): Promise<void>;
  setPassword(username: string, password: string): Promise<void>;
  list(): Promise<string[]>;
}

interface AdminRow extends RowDataPacket {
  username: string;
  password_hash: string;
}

class MySqlPlatformStore implements PlatformStore {
  async verifyLogin(username: string, password: string): Promise<boolean> {
    await ensureSchema();
    const [rows] = await getPool().query<AdminRow[]>(
      "SELECT username, password_hash FROM platform_admins WHERE username = ?",
      [username],
    );
    if (!rows.length) return false;
    return verifyPassword(password, rows[0].password_hash);
  }
  async createAdmin(username: string, password: string): Promise<void> {
    await ensureSchema();
    await getPool().query(
      "INSERT INTO platform_admins (username, password_hash, created_at) VALUES (?, ?, ?)",
      [username, hashPassword(password), new Date().toISOString()],
    );
  }
  async setPassword(username: string, password: string): Promise<void> {
    await ensureSchema();
    await getPool().query("UPDATE platform_admins SET password_hash = ? WHERE username = ?", [
      hashPassword(password),
      username,
    ]);
  }
  async list(): Promise<string[]> {
    await ensureSchema();
    const [rows] = await getPool().query<AdminRow[]>(
      "SELECT username FROM platform_admins ORDER BY created_at",
    );
    return rows.map((r) => r.username);
  }
}

let store: PlatformStore | null = null;
export function getPlatformStore(): PlatformStore {
  if (store) return store;
  store = new MySqlPlatformStore();
  return store;
}

export function resetPlatformStore(): void {
  store = null;
}
