import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDB } from "mysql-memory-server";
import { NextRequest } from "next/server";
import { input } from "./helpers/store-contract";
import type { ReservationStore } from "@/lib/reservations/store";

type MySQLDB = Awaited<ReturnType<typeof createDB>>;

let db: MySQLDB;
let MySqlStore: typeof import("@/lib/reservations/mysql-store")["MySqlStore"];
let getTenantStore: typeof import("@/lib/reservations/tenant-store")["getTenantStore"];
let tenantMod: typeof import("@/lib/reservations/tenant");
let ctx: typeof import("@/lib/reservations/tenant-context");
let auth: typeof import("@/lib/reservations/auth");

beforeAll(async () => {
  db = await createDB({ version: "8.4.x" });
  process.env.MYSQL_HOST = "127.0.0.1";
  process.env.MYSQL_PORT = String(db.port);
  process.env.MYSQL_USER = db.username;
  process.env.MYSQL_PASSWORD = "";
  process.env.MYSQL_DATABASE = db.dbName;
  process.env.SESSION_SECRET = "mt-test-secret";
  ({ MySqlStore } = await import("@/lib/reservations/mysql-store"));
  ({ getTenantStore } = await import("@/lib/reservations/tenant-store"));
  tenantMod = await import("@/lib/reservations/tenant");
  ctx = await import("@/lib/reservations/tenant-context");
  auth = await import("@/lib/reservations/auth");
}, 180_000);

afterAll(async () => {
  if (db) await db.stop();
});

const store = (tid: string): ReservationStore => new MySqlStore(tid);

describe("cross-tenant data isolation", () => {
  it("a reservation created for t1 is invisible to t2", async () => {
    const r = await store("t1").createReservation(input({ name: "Tenant One" }));
    expect(await store("t2").getReservation(r.id)).toBeNull();
    expect(await store("t2").listReservations()).toHaveLength(0);
    expect((await store("t1").getReservation(r.id))?.name).toBe("Tenant One");
  });

  it("t2 cannot update or delete t1's reservation", async () => {
    const r = await store("t1").createReservation(input({ name: "Owned" }));
    expect(await store("t2").updateReservation(r.id, { status: "cancelled" })).toBeNull();
    expect(await store("t2").deleteReservation(r.id)).toBe(false);
    // t1's row is untouched
    expect((await store("t1").getReservation(r.id))?.status).toBe("pending");
    expect(await store("t1").deleteReservation(r.id)).toBe(true);
  });

  it("config is per-tenant", async () => {
    const cfg = await store("t1").getConfig();
    cfg.bookingWindowDays = 11;
    await store("t1").saveConfig(cfg);
    expect((await store("t1").getConfig()).bookingWindowDays).toBe(11);
    expect((await store("t2").getConfig()).bookingWindowDays).not.toBe(11);
  });

  it("capacity locks are scoped per tenant (same slot bookable in both)", async () => {
    // Fresh tenant ids + date so no prior rows interfere.
    const cap = 2;
    const date = "2026-07-01";
    const validate = (existing: { time: string; partySize: number; status: string }[]) => {
      const booked = existing
        .filter((x) => x.time === "13:00" && x.status !== "cancelled" && x.status !== "no_show")
        .reduce((s, x) => s + x.partySize, 0);
      return booked + 2 > cap ? "full" : null;
    };
    // Fill capA's slot to capacity.
    const a = await store("capA").createReservationChecked(input({ date, time: "13:00", partySize: 2 }), validate);
    expect(a.reservation).toBeTruthy();
    const b = await store("capA").createReservationChecked(input({ date, time: "13:00", partySize: 2 }), validate);
    expect(b.error).toBe("full");
    // capB's identical slot is unaffected.
    const c = await store("capB").createReservationChecked(input({ date, time: "13:00", partySize: 2 }), validate);
    expect(c.reservation).toBeTruthy();
  });
});

describe("tenant provisioning (MySqlTenantStore)", () => {
  it("creates a tenant, maps a host, and authenticates the login", async () => {
    const ts = getTenantStore();
    await ts.create({
      id: "acme-id",
      slug: "acme",
      name: "Acme Osteria",
      settings: tenantMod.templateSettings(),
      adminUsername: "owner",
      adminPasswordHash: tenantMod.hashPassword("letmein"),
      hosts: ["acme.example.com", "admin.acme.example.com"],
    });

    const byHost = await ts.getByHost("acme.example.com");
    expect(byHost?.id).toBe("acme-id");
    expect(byHost && tenantMod.verifyTenantLogin(byHost, "owner", "letmein")).toBe(true);
    expect(byHost && tenantMod.verifyTenantLogin(byHost, "owner", "wrong")).toBe(false);

    // second mapped host resolves to the same tenant
    expect((await ts.getByHost("admin.acme.example.com"))?.id).toBe("acme-id");
    // unknown host resolves to nothing
    expect(await ts.getByHost("nobody.example.com")).toBeNull();
  });

  it("supports add-domain, set-password and disable", async () => {
    const ts = getTenantStore();
    await ts.create({
      id: "bistro-id",
      slug: "bistro",
      name: "Bistro",
      settings: tenantMod.templateSettings(),
      adminUsername: "boss",
      adminPasswordHash: tenantMod.hashPassword("first"),
    });
    await ts.addDomain("bistro-id", "bistro.example.com");
    expect((await ts.getByHost("bistro.example.com"))?.slug).toBe("bistro");

    await ts.setPassword("bistro-id", tenantMod.hashPassword("second"));
    const t = await ts.getByHost("bistro.example.com");
    expect(t && tenantMod.verifyTenantLogin(t, "boss", "second")).toBe(true);
    expect(t && tenantMod.verifyTenantLogin(t, "boss", "first")).toBe(false);

    await ts.setStatus("bistro-id", "disabled");
    // disabled tenants are not resolved by host
    expect(await ts.getByHost("bistro.example.com")).toBeNull();
  });
});

describe("host resolution in the request pipeline", () => {
  const make = (host: string, cookie?: string) =>
    new NextRequest("http://x/api/admin/reservations", { headers: cookie ? { host, cookie } : { host } });

  it("requireTenant 404s an unmapped host", async () => {
    ctx.clearTenantCache();
    const r = await ctx.requireTenant(make("ghost.example.com"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.res.status).toBe(404);
  });

  it("requireAdmin enforces host + matching session for a real tenant", async () => {
    ctx.clearTenantCache();
    // no session -> 401
    const noSession = await ctx.requireAdmin(make("acme.example.com"));
    expect(noSession.ok).toBe(false);
    if (!noSession.ok) expect(noSession.res.status).toBe(401);

    // session for the wrong tenant -> 403
    const wrong = `${auth.SESSION_COOKIE}=${await auth.createSession("someone-else", "owner")}`;
    const mismatch = await ctx.requireAdmin(make("acme.example.com", wrong));
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.res.status).toBe(403);

    // session for the right tenant -> ok
    const right = `${auth.SESSION_COOKIE}=${await auth.createSession("acme-id", "owner")}`;
    const ok = await ctx.requireAdmin(make("acme.example.com", right));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.tenant.id).toBe("acme-id");
  });
});
