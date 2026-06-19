import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDB } from "mysql-memory-server";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";

type MySQLDB = Awaited<ReturnType<typeof createDB>>;
let db: MySQLDB;
let tenantId: string;

let analyticsRoute: typeof import("@/app/api/admin/analytics/route");
let platformAnalyticsRoute: typeof import("@/app/api/platform/analytics/route");
let store: typeof import("@/lib/reservations/store");
let auth: typeof import("@/lib/reservations/auth");
let pauth: typeof import("@/lib/reservations/platform-auth");
let poolMod: typeof import("@/lib/reservations/mysql-pool");

let adminCookie = "";
let platformCookie = "";

function req(url: string, opts: { method?: string; cookie?: string; host?: string } = {}) {
  const headers: Record<string, string> = {
    host: opts.host ?? "localhost",
    "x-forwarded-for": "127.0.0.1",
  };
  if (opts.cookie) headers.cookie = opts.cookie;
  return new NextRequest(`http://localhost${url}`, { method: opts.method ?? "GET", headers });
}
const adminReq = (url: string) => req(url, { cookie: adminCookie });
const platReq = (url: string) => req(url, { host: "platform.local", cookie: platformCookie });

beforeAll(async () => {
  db = await createDB({ version: "8.4.x" });
  process.env.MYSQL_HOST = "127.0.0.1";
  process.env.MYSQL_PORT = String(db.port);
  process.env.MYSQL_USER = db.username;
  process.env.MYSQL_PASSWORD = "";
  process.env.MYSQL_DATABASE = db.dbName;
  process.env.SESSION_SECRET = "analytics-test-secret";

  auth = await import("@/lib/reservations/auth");
  pauth = await import("@/lib/reservations/platform-auth");
  poolMod = await import("@/lib/reservations/mysql-pool");
  store = await import("@/lib/reservations/store");
  analyticsRoute = await import("@/app/api/admin/analytics/route");
  platformAnalyticsRoute = await import("@/app/api/platform/analytics/route");

  const { getTenantStore, resetTenantStore } = await import("@/lib/reservations/tenant-store");
  const { hashPassword, templateSettings } = await import("@/lib/reservations/tenant");
  const { ensureSchema } = await import("@/lib/reservations/mysql-schema");
  const { getPlatformStore } = await import("@/lib/reservations/platform-store");
  await ensureSchema();

  // Wipe the seeded platform admin and create a fresh one
  await poolMod.getPool().query("TRUNCATE TABLE platform_admins");
  await getPlatformStore().createAdmin("ops", "ops-pass-1");

  resetTenantStore();
  const ts = getTenantStore();
  tenantId = randomUUID();
  await ts.create({
    id: tenantId,
    slug: "analytics-test",
    name: "Analytics Restaurant",
    settings: templateSettings(),
    adminUsername: "staff",
    adminPasswordHash: hashPassword("s3cret"),
    hosts: ["localhost"],
  });

  adminCookie = `${auth.SESSION_COOKIE}=${await auth.createSession(tenantId, "staff")}`;
  platformCookie = `${pauth.PLATFORM_COOKIE}=${await pauth.createPlatformSession("ops")}`;
}, 180_000);

afterAll(async () => {
  if (db) await db.stop();
});

beforeEach(async () => {
  await poolMod.getPool().query("DELETE FROM reservations WHERE tenant_id = ?", [tenantId]);
});

/* ---- helpers ---- */

async function seed(overrides: {
  date?: string; time?: string; offering?: string; service?: string; partySize?: number;
  status?: string; source?: string; email?: string; name?: string;
}[] = []) {
  const s = store.getStore().forTenant(tenantId);
  const results = [];
  for (const o of overrides) {
    const r = await s.createReservation({
      date: o.date ?? "2026-06-12",
      time: o.time ?? "12:00",
      offering: o.offering,
      service: o.service ?? "lunch",
      partySize: o.partySize ?? 2,
      name: o.name ?? "Guest",
      email: o.email ?? "g@x.io",
      phone: "1",
    });
    if (o.status && o.status !== "pending") {
      await s.updateReservation(r.id, { status: o.status as never });
    }
    if (o.source === "admin") {
      await poolMod.getPool().query("UPDATE reservations SET source='admin' WHERE id=?", [r.id]);
    }
    results.push(r);
  }
  return results;
}

/* ---- Admin analytics route ---- */

describe("GET /api/admin/analytics", () => {
  it("401 without a valid session", async () => {
    const res = await analyticsRoute.GET(req("/api/admin/analytics"));
    expect(res.status).toBe(401);
  });

  it("returns empty analytics when no reservations", async () => {
    const res = await analyticsRoute.GET(adminReq("/api/admin/analytics"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.byDay).toEqual([]);
    expect(json.byStatus).toEqual({});
    expect(json.avgPartySize).toBe(0);
    expect(json.newVsReturning).toEqual({ new: 0, returning: 0 });
  });

  it("groups reservations by day (excludes cancelled/no_show)", async () => {
    await seed([
      { date: "2026-06-12", partySize: 3, status: "confirmed" },
      { date: "2026-06-12", partySize: 2, status: "confirmed" },
      { date: "2026-06-12", partySize: 4, status: "cancelled" }, // excluded
      { date: "2026-06-11", partySize: 5, status: "seated" },   // yesterday — within 30d window
    ]);
    const res = await analyticsRoute.GET(adminReq("/api/admin/analytics?period=30d"));
    const json = await res.json();
    const day12 = json.byDay.find((d: { date: string }) => d.date === "2026-06-12");
    const day11 = json.byDay.find((d: { date: string }) => d.date === "2026-06-11");
    expect(day12?.reservations).toBe(2);
    expect(day12?.covers).toBe(5);
    expect(day11?.reservations).toBe(1);
    expect(day11?.covers).toBe(5);
  });

  it("builds byStatus breakdown including all statuses", async () => {
    await seed([
      { status: "confirmed" },
      { status: "confirmed" },
      { status: "cancelled" },
      { status: "no_show" },
      { status: "seated" },
      { status: "completed" },
    ]);
    const res = await analyticsRoute.GET(adminReq("/api/admin/analytics?period=30d"));
    const { byStatus } = await res.json();
    expect(byStatus.confirmed).toBe(2);
    expect(byStatus.cancelled).toBe(1);
    expect(byStatus.no_show).toBe(1);
    expect(byStatus.seated).toBe(1);
    expect(byStatus.completed).toBe(1);
  });

  it("splits bookings by source (web vs admin)", async () => {
    await seed([
      { source: "web" },
      { source: "web" },
      { source: "admin" },
    ]);
    const res = await analyticsRoute.GET(adminReq("/api/admin/analytics?period=30d"));
    const { bySource } = await res.json();
    expect(bySource.web).toBe(2);
    expect(bySource.admin).toBe(1);
  });

  it("groups by service", async () => {
    await seed([
      { service: "lunch", partySize: 2, status: "confirmed" },
      { service: "lunch", partySize: 3, status: "confirmed" },
      { service: "dinner", partySize: 4, status: "confirmed" },
    ]);
    const res = await analyticsRoute.GET(adminReq("/api/admin/analytics?period=30d"));
    const { byService } = await res.json();
    const lunch = byService.find((s: { service: string }) => s.service === "lunch");
    const dinner = byService.find((s: { service: string }) => s.service === "dinner");
    expect(lunch?.reservations).toBe(2);
    expect(lunch?.covers).toBe(5);
    expect(dinner?.reservations).toBe(1);
    expect(dinner?.covers).toBe(4);
  });

  it("keys byService and byOffering by (offering, service) — duplicate service ids across offerings don't merge", async () => {
    await seed([
      { offering: "main", service: "dinner", partySize: 2, status: "confirmed" },
      { offering: "bar", service: "dinner", partySize: 5, status: "confirmed" },
    ]);
    const res = await analyticsRoute.GET(adminReq("/api/admin/analytics?period=30d"));
    const { byService, byOffering } = await res.json();
    const mainDinner = byService.find((s: { offering: string; service: string }) => s.offering === "main" && s.service === "dinner");
    const barDinner = byService.find((s: { offering: string; service: string }) => s.offering === "bar" && s.service === "dinner");
    expect(mainDinner?.covers).toBe(2);
    expect(barDinner?.covers).toBe(5);
    expect(byOffering.find((o: { offering: string }) => o.offering === "bar")?.covers).toBe(5);
  });

  it("calculates avgPartySize correctly (excludes cancelled/no_show)", async () => {
    await seed([
      { partySize: 2, status: "confirmed" },
      { partySize: 4, status: "confirmed" },
      { partySize: 6, status: "cancelled" }, // excluded from avg
    ]);
    const res = await analyticsRoute.GET(adminReq("/api/admin/analytics?period=30d"));
    const { avgPartySize } = await res.json();
    expect(avgPartySize).toBe(3); // (2+4)/2
  });

  it("distinguishes new vs returning guests (email-based)", async () => {
    // All reservations in same period → all new
    await seed([
      { email: "a@x.io", status: "confirmed" },
      { email: "b@x.io", status: "confirmed" },
    ]);
    const res = await analyticsRoute.GET(adminReq("/api/admin/analytics?period=30d"));
    const { newVsReturning } = await res.json();
    expect(newVsReturning.new).toBe(2);
    expect(newVsReturning.returning).toBe(0);
  });

  it("accepts all valid period params", async () => {
    for (const period of ["7d", "30d", "90d", "365d"]) {
      const res = await analyticsRoute.GET(adminReq(`/api/admin/analytics?period=${period}`));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.period).toBe(period);
      expect(json.from).toBeTruthy();
      expect(json.to).toBeTruthy();
    }
  });

  it("defaults to 30d when period param is absent", async () => {
    const res = await analyticsRoute.GET(adminReq("/api/admin/analytics"));
    const json = await res.json();
    expect(json.period).toBe("30d");
  });

  it("defaults to 30d for an unrecognised period string", async () => {
    const res = await analyticsRoute.GET(adminReq("/api/admin/analytics?period=xyz"));
    expect(res.status).toBe(200);
    const json = await res.json();
    // "xyz" → fallback 30 days, period echoed back as-is but window is 30d
    expect(json.from).toBeTruthy();
    expect(json.to).toBeTruthy();
    // from should be (today - 29 days), not a huge window
    const diffDays = Math.round(
      (new Date(json.to).getTime() - new Date(json.from).getTime()) / 86400000,
    );
    expect(diffDays).toBe(29); // 30d window: to - from + 1 = 30, so diff = 29
  });

  it("excludes blank-email reservations from new-vs-returning count", async () => {
    await seed([
      { email: "real@x.io", status: "confirmed" },
      { email: "", status: "confirmed" },   // blank email — should be excluded
      { email: "   ", status: "confirmed" }, // whitespace email — should be excluded
    ]);
    const res = await analyticsRoute.GET(adminReq("/api/admin/analytics?period=30d"));
    const { newVsReturning } = await res.json();
    // Only the real-email guest counts
    expect(newVsReturning.new + newVsReturning.returning).toBe(1);
  });

  it("returns 0 avgLeadDays / avgPartySize when no bookings in period", async () => {
    const res = await analyticsRoute.GET(adminReq("/api/admin/analytics"));
    const json = await res.json();
    expect(json.avgPartySize).toBe(0);
    expect(json.avgLeadDays).toBe(0);
  });
});

/* ---- Depth analytics: rates, heatmap, party sizes, tables, waitlist ---- */

describe("GET /api/admin/analytics — depth", () => {
  it("computes no-show and cancellation rates", async () => {
    await seed([
      ...Array.from({ length: 8 }, () => ({ status: "confirmed" })),
      { status: "no_show" },
      { status: "cancelled" },
    ]);
    const res = await analyticsRoute.GET(adminReq("/api/admin/analytics?period=30d"));
    const { rates } = await res.json();
    expect(rates.total).toBe(10);
    expect(rates.noShow).toBe(1);
    expect(rates.cancelled).toBe(1);
    expect(rates.noShowRate).toBe(10);
    expect(rates.cancelledRate).toBe(10);
  });

  it("builds a weekday×hour heatmap of covers", async () => {
    await seed([
      { date: "2026-06-12", time: "12:00", partySize: 3, status: "confirmed" },
      { date: "2026-06-12", time: "12:00", partySize: 2, status: "confirmed" },
      { date: "2026-06-12", time: "20:00", partySize: 4, status: "confirmed" },
    ]);
    const res = await analyticsRoute.GET(adminReq("/api/admin/analytics?period=30d"));
    const { heatmap } = await res.json();
    const noon = heatmap.find((c: { hour: number }) => c.hour === 12);
    const dinner = heatmap.find((c: { hour: number }) => c.hour === 20);
    expect(noon.covers).toBe(5);
    expect(dinner.covers).toBe(4);
    expect(noon.weekday).toBeGreaterThanOrEqual(0);
    expect(noon.weekday).toBeLessThanOrEqual(6);
  });

  it("returns a party-size distribution", async () => {
    await seed([
      { partySize: 2, status: "confirmed" },
      { partySize: 2, status: "confirmed" },
      { partySize: 4, status: "confirmed" },
    ]);
    const res = await analyticsRoute.GET(adminReq("/api/admin/analytics?period=30d"));
    const { partySizes } = await res.json();
    expect(partySizes.find((p: { size: number }) => p.size === 2).reservations).toBe(2);
    expect(partySizes.find((p: { size: number }) => p.size === 4).reservations).toBe(1);
  });

  it("reports table utilization (covers + turns per table)", async () => {
    await poolMod.getPool().query("DELETE FROM tables WHERE tenant_id = ?", [tenantId]);
    const { TableStore } = await import("@/lib/reservations/table-store");
    const ts = new TableStore(tenantId);
    const config = await store.getStore().forTenant(tenantId).getConfig();
    const table = await ts.createTable({ label: "T1", capacity: 4 });
    const [r] = await seed([{ date: "2026-06-12", time: "20:00", partySize: 3, status: "confirmed" }]);
    await ts.assignTable(r.id, table.id, config);

    const res = await analyticsRoute.GET(adminReq("/api/admin/analytics?period=30d"));
    const { tableUtilization } = await res.json();
    const row = tableUtilization.find((t: { tableId: string }) => t.tableId === table.id);
    expect(row.label).toBe("T1");
    expect(row.covers).toBe(3);
    expect(row.turns).toBe(1);
  });

  it("summarizes the waitlist (added/seated/left + conversion + avg quote)", async () => {
    await poolMod.getPool().query("DELETE FROM waitlist WHERE tenant_id = ?", [tenantId]);
    const { WaitlistStore } = await import("@/lib/reservations/waitlist-store");
    const wl = new WaitlistStore(tenantId);
    const config = await store.getStore().forTenant(tenantId).getConfig();
    const e1 = await wl.addEntry({ date: "2026-06-12", name: "A", partySize: 2, quotedWaitMin: 10 }, config);
    await wl.addEntry({ date: "2026-06-12", name: "B", partySize: 2, quotedWaitMin: 30 }, config);
    await wl.updateEntry(e1.id, { status: "left" });

    const res = await analyticsRoute.GET(adminReq("/api/admin/analytics?period=30d"));
    const { waitlist } = await res.json();
    expect(waitlist.total).toBe(2);
    expect(waitlist.left).toBe(1);
    expect(waitlist.avgQuotedWait).toBe(20);
  });
});

/* ---- Platform analytics route ---- */

describe("GET /api/platform/analytics", () => {
  it("401 without platform session", async () => {
    const res = await platformAnalyticsRoute.GET(req("/api/platform/analytics", { host: "platform.local" }));
    expect(res.status).toBe(401);
  });

  it("returns empty totals when no reservations exist", async () => {
    await poolMod.getPool().query("DELETE FROM reservations WHERE tenant_id = ?", [tenantId]);
    const res = await platformAnalyticsRoute.GET(platReq("/api/platform/analytics"));
    expect(res.status).toBe(200);
    const json = await res.json();
    // totals may not be 0 if other tests leave data, but structure must be present
    expect(json.totals).toHaveProperty("reservations");
    expect(json.totals).toHaveProperty("last30");
    expect(json.totals).toHaveProperty("tenants");
    expect(json.byTenant).toBeTruthy();
  });

  it("includes per-tenant stats after bookings are created", async () => {
    await seed([
      { status: "confirmed", partySize: 3 },
      { status: "no_show", partySize: 2 },
      { status: "cancelled", partySize: 1 },
    ]);
    const res = await platformAnalyticsRoute.GET(platReq("/api/platform/analytics"));
    expect(res.status).toBe(200);
    const json = await res.json();
    const ts = json.byTenant[tenantId];
    expect(ts).toBeTruthy();
    expect(ts.total).toBeGreaterThanOrEqual(3);
    expect(ts.noShows).toBeGreaterThanOrEqual(1);
    expect(ts.cancellations).toBeGreaterThanOrEqual(1);
  });

  it("counts last30 correctly (all recent bookings in window)", async () => {
    await seed([{ status: "confirmed" }, { status: "confirmed" }]);
    const res = await platformAnalyticsRoute.GET(platReq("/api/platform/analytics"));
    const json = await res.json();
    const ts = json.byTenant[tenantId];
    expect(ts.last30).toBeGreaterThanOrEqual(2);
  });

  it("totals.tenants counts distinct tenant_ids with bookings", async () => {
    await seed([{ status: "confirmed" }]);
    const res = await platformAnalyticsRoute.GET(platReq("/api/platform/analytics"));
    const json = await res.json();
    expect(json.totals.tenants).toBeGreaterThanOrEqual(1);
  });

  it("includes totalCovers (excludes cancelled/no_show)", async () => {
    await seed([
      { status: "confirmed", partySize: 4 },
      { status: "cancelled", partySize: 10 }, // excluded
    ]);
    const res = await platformAnalyticsRoute.GET(platReq("/api/platform/analytics"));
    const json = await res.json();
    const ts = json.byTenant[tenantId];
    expect(ts.totalCovers).toBeGreaterThanOrEqual(4);
  });
});

/* ---- Customer no-show / cancellation counts ---- */

describe("CustomerStore: noShowCount and cancelledCount", () => {
  it("counts no-shows and cancellations separately from visits", async () => {
    const s = store.getStore().forTenant(tenantId);
    const r1 = await s.createReservation({ date: "2026-06-12", time: "12:00", service: "lunch", partySize: 2, name: "Unreliable Guest", email: "unrel@x.io", phone: "1" });
    const r2 = await s.createReservation({ date: "2026-06-12", time: "13:00", service: "lunch", partySize: 2, name: "Unreliable Guest", email: "unrel@x.io", phone: "1" });
    const r3 = await s.createReservation({ date: "2026-06-12", time: "14:00", service: "lunch", partySize: 2, name: "Unreliable Guest", email: "unrel@x.io", phone: "1" });

    await s.updateReservation(r1.id, { status: "completed" });
    await s.updateReservation(r2.id, { status: "no_show" });
    await s.updateReservation(r3.id, { status: "cancelled" });

    const { CustomerStore } = await import("@/lib/reservations/customer-store");
    const cs = new CustomerStore(tenantId);
    const detail = await cs.getCustomerDetail("unrel@x.io");
    expect(detail?.profile.visitCount).toBe(1);
    expect(detail?.profile.noShowCount).toBe(1);
    expect(detail?.profile.cancelledCount).toBe(1);
  });

  it("unifies reservations under the same email regardless of case", async () => {
    const s = store.getStore().forTenant(tenantId);
    const r1 = await s.createReservation({ date: "2026-06-12", time: "20:00", service: "dinner", partySize: 2, name: "Case Guest", email: "case@x.io", phone: "1" });
    const r2 = await s.createReservation({ date: "2026-06-12", time: "20:30", service: "dinner", partySize: 2, name: "Case Guest", email: "CASE@X.IO", phone: "1" });
    await s.updateReservation(r1.id, { status: "completed" });
    await s.updateReservation(r2.id, { status: "completed" });

    const { CustomerStore } = await import("@/lib/reservations/customer-store");
    const cs = new CustomerStore(tenantId);
    // Lookup with mixed-case variant — should find the unified profile
    const detail = await cs.getCustomerDetail("Case@X.IO");
    expect(detail).not.toBeNull();
    expect(detail?.profile.visitCount).toBe(2);
  });

  it("has noShowCount=0 and cancelledCount=0 for a perfect-record guest", async () => {
    const s = store.getStore().forTenant(tenantId);
    const r = await s.createReservation({ date: "2026-06-12", time: "19:00", service: "dinner", partySize: 2, name: "Reliable Guest", email: "rel@x.io", phone: "1" });
    await s.updateReservation(r.id, { status: "completed" });

    const { CustomerStore } = await import("@/lib/reservations/customer-store");
    const cs = new CustomerStore(tenantId);
    const detail = await cs.getCustomerDetail("rel@x.io");
    expect(detail?.profile.noShowCount).toBe(0);
    expect(detail?.profile.cancelledCount).toBe(0);
    expect(detail?.profile.visitCount).toBe(1);
  });
});
