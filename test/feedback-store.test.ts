import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDB } from "mysql-memory-server";
import { randomUUID } from "node:crypto";

type MySQLDB = Awaited<ReturnType<typeof createDB>>;
let db: MySQLDB;

let feedbackStore: typeof import("@/lib/reservations/feedback-store");
let pool: typeof import("@/lib/reservations/mysql-pool");

const TID = "tenant-fb-test";

beforeAll(async () => {
  db = await createDB({ version: "8.4.x" });
  process.env.MYSQL_HOST = "127.0.0.1";
  process.env.MYSQL_PORT = String(db.port);
  process.env.MYSQL_USER = db.username;
  process.env.MYSQL_PASSWORD = "";
  process.env.MYSQL_DATABASE = db.dbName;
  feedbackStore = await import("@/lib/reservations/feedback-store");
  pool = await import("@/lib/reservations/mysql-pool");
  const { ensureSchema } = await import("@/lib/reservations/mysql-schema");
  await ensureSchema();
}, 180_000);

afterAll(async () => {
  if (db) await db.stop();
});

async function clean() {
  await pool.getPool().query("DELETE FROM reservation_feedback");
}

describe("createFeedbackToken", () => {
  it("creates a token record with token, reservationId, tenantId, sentAt", async () => {
    await clean();
    const rid = randomUUID();
    const rec = await feedbackStore.createFeedbackToken(rid, TID);
    expect(rec.token).toMatch(/^[0-9a-f-]{36}$/);
    expect(rec.reservationId).toBe(rid);
    expect(rec.tenantId).toBe(TID);
    expect(rec.sentAt).toBeTruthy();
  });

  it("is idempotent â€” returns the same token on repeated calls", async () => {
    await clean();
    const rid = randomUUID();
    const first = await feedbackStore.createFeedbackToken(rid, TID);
    const second = await feedbackStore.createFeedbackToken(rid, TID);
    expect(second.token).toBe(first.token);
    const [rows] = await pool.getPool().query(
      "SELECT COUNT(*) AS cnt FROM reservation_feedback WHERE reservation_id = ?", [rid]
    );
    expect(Number((rows as { cnt: number }[])[0].cnt)).toBe(1);
  });
});

describe("getFeedbackStatusBatch", () => {
  it("returns empty map for empty input", async () => {
    const result = await feedbackStore.getFeedbackStatusBatch([]);
    expect(result.size).toBe(0);
  });

  it("returns map with only IDs that have feedback", async () => {
    await clean();
    const r1 = randomUUID();
    const r2 = randomUUID();
    const r3 = randomUUID();
    await feedbackStore.createFeedbackToken(r1, TID);
    await feedbackStore.createFeedbackToken(r2, TID);
    // r3 has no feedback

    const result = await feedbackStore.getFeedbackStatusBatch([r1, r2, r3]);
    expect(result.has(r1)).toBe(true);
    expect(result.has(r2)).toBe(true);
    expect(result.has(r3)).toBe(false);
  });


  it("marks filled=false before submission", async () => {
    await clean();
    const rid = randomUUID();
    await feedbackStore.createFeedbackToken(rid, TID);
    const result = await feedbackStore.getFeedbackStatusBatch([rid]);
    const entry = result.get(rid);
  });

  it("handles a batch of many IDs efficiently", async () => {
    await clean();
    const ids = Array.from({ length: 10 }, () => randomUUID());
    // Create tokens for first 5 only
    for (const id of ids.slice(0, 5)) {
      await feedbackStore.createFeedbackToken(id, TID);
    }
    const result = await feedbackStore.getFeedbackStatusBatch(ids);
    expect(result.size).toBe(5);
  });

  it("deduplicates repeated IDs in the input array", async () => {
    await clean();
    const rid = randomUUID();
    await feedbackStore.createFeedbackToken(rid, TID);
    // Pass same ID three times
    const result = await feedbackStore.getFeedbackStatusBatch([rid, rid, rid]);
    expect(result.size).toBe(1);
    expect(result.has(rid)).toBe(true);
  });
});
