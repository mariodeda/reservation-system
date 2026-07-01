/**
 * Mock-data generators for the platform "debug" tools. Each generator is scoped
 * to one tenant and produces realistic, screen-exercising data so operators can
 * validate every admin view (dashboard, reservations, tables, waitlist,
 * customers, analytics, review requests) without hand-entering anything.
 *
 * Generators are ADDITIVE (they insert alongside existing data) except
 * `clearTenantData`, which wipes a tenant's operational data. Reservations are
 * generated against the tenant's real availability config so services, times
 * and offerings are valid for that venue.
 */
import { randomUUID } from "node:crypto";
import { getStore } from "./store";
import { getTableStore } from "./table-store";
import { getWaitlistStore } from "./waitlist-store";
import { getCustomerStore } from "./customer-store";
import { createFeedbackToken, getFeedbackByReservation } from "./feedback-store";
import { getPool } from "./mysql-pool";
import { getOfferings } from "./offerings";
import { generateSlots, nowInTz, scheduleForDate } from "./availability";
import type {
  AvailabilityConfig,
  NewReservationInput,
  ReservationStatus,
  RestaurantTable,
  ServiceWindow,
} from "./types";

/* ------------------------------------------------------------------ helpers */

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const rint = (lo: number, hi: number): number => lo + Math.floor(Math.random() * (hi - lo + 1));
const chance = (p: number): boolean => Math.random() < p;

const pad = (n: number) => String(n).padStart(2, "0");
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Run promise-returning tasks in bounded-concurrency chunks. */
async function inChunks<T>(items: T[], size: number, fn: (item: T) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

/* -------------------------------------------------------------- guest roster */

interface Guest {
  name: string;
  email: string;
  phone: string;
  vip?: boolean;
  dietary?: string;
  staff?: string;
}

const GUEST_SEED: Array<Omit<Guest, "email" | "phone"> & { phone?: string }> = [
  { name: "Marco Rossi" },
  { name: "Giulia Bianchi", vip: true, staff: "Anniversary regular — likes the terrace." },
  { name: "Luca Ferrari", dietary: "Severe nut allergy" },
  { name: "Sofia Esposito" },
  { name: "Alessandro Ricci", vip: true, staff: "Wine collector; offer the reserve list." },
  { name: "Francesca Romano" },
  { name: "Matteo Conti" },
  { name: "Elena Colombo", dietary: "Coeliac — strictly gluten-free" },
  { name: "Davide Russo" },
  { name: "Chiara Marino", vip: true },
  { name: "James Smith" },
  { name: "Emma Johnson", dietary: "Vegetarian; no shellfish" },
  { name: "Oliver Brown" },
  { name: "Charlotte Davis", staff: "Prefers a quiet corner." },
  { name: "William Wilson" },
  { name: "Isabella Conte" },
  { name: "Thomas Greco", dietary: "Lactose intolerant" },
  { name: "Olivia Marchetti", vip: true, staff: "Local food critic — comp the amuse-bouche." },
];

const GUESTS: Guest[] = GUEST_SEED.map((g) => ({
  ...g,
  email: g.name.toLowerCase().replace(/[^a-z]+/g, ".") + "@example.com",
  phone: pick(["+39 055 ", "+39 02 ", "+39 06 ", "+44 20 ", "+1 212 "]) + rint(100000, 999999),
}));

const OCCASIONS = [null, null, null, "Birthday", "Anniversary", "Business dinner", "Date night"];
const NOTES = [null, null, null, "Window table if possible", "High chair needed", "Celebrating — bringing a cake"];

/* ----------------------------------------------------------------- summaries */

export type MockSummary = Record<string, number>;

/* ------------------------------------------------------------------- tables */

const TABLE_TEMPLATE: Array<Omit<RestaurantTable, "id" | "active" | "createdAt" | "sortOrder">> = [
  { label: "1", capacity: 2, minParty: 1, zone: "Main", joinable: true, offering: null },
  { label: "2", capacity: 2, minParty: 1, zone: "Main", joinable: true, offering: null },
  { label: "3", capacity: 2, minParty: 1, zone: "Main", joinable: true, offering: null },
  { label: "4", capacity: 4, minParty: 2, zone: "Main", joinable: true, offering: null },
  { label: "5", capacity: 4, minParty: 2, zone: "Main", joinable: true, offering: null },
  { label: "6", capacity: 4, minParty: 2, zone: "Main", joinable: true, offering: null },
  { label: "7", capacity: 6, minParty: 3, zone: "Main", joinable: true, offering: null },
  { label: "8", capacity: 6, minParty: 3, zone: "Main", joinable: false, offering: null },
  { label: "Terrace 1", capacity: 2, minParty: 1, zone: "Terrace", joinable: true, offering: null },
  { label: "Terrace 2", capacity: 4, minParty: 2, zone: "Terrace", joinable: true, offering: null },
  { label: "Terrace 3", capacity: 4, minParty: 2, zone: "Terrace", joinable: true, offering: null },
  { label: "Terrace 4", capacity: 8, minParty: 4, zone: "Terrace", joinable: true, offering: null },
  { label: "Bar 1", capacity: 2, minParty: 1, zone: "Bar", joinable: false, offering: null },
  { label: "Bar 2", capacity: 2, minParty: 1, zone: "Bar", joinable: false, offering: null },
  { label: "Private", capacity: 12, minParty: 6, zone: "Private room", joinable: false, offering: null },
];

export async function seedTables(tenantId: string): Promise<MockSummary> {
  const store = getTableStore(tenantId);
  const existing = new Set((await store.listTables()).map((t) => t.label.toLowerCase()));
  let created = 0;
  for (let i = 0; i < TABLE_TEMPLATE.length; i++) {
    const t = TABLE_TEMPLATE[i];
    if (existing.has(t.label.toLowerCase())) continue;
    await store.createTable({
      label: t.label,
      capacity: t.capacity,
      minParty: t.minParty,
      zone: t.zone,
      joinable: t.joinable,
      sortOrder: i,
    });
    created++;
  }
  return { tables: created };
}

/* ---------------------------------------------------------------- customers */

export async function seedCustomers(tenantId: string): Promise<MockSummary> {
  const store = getCustomerStore(tenantId);
  let count = 0;
  for (const g of GUESTS) {
    if (!g.vip && !g.dietary && !g.staff) continue;
    await store.upsertProfile(g.email, {
      vip: !!g.vip,
      staffNotes: g.staff ?? null,
      dietaryNotes: g.dietary ?? null,
    });
    count++;
  }
  return { customers: count };
}

/* ------------------------------------------------------------- reservations */

type Scope = "today" | "upcoming" | "history";

/** Pick a valid (offering, service, time) for a date from the tenant's config. */
function slotFor(
  config: AvailabilityConfig,
  date: string,
): { offering: string; service: string } | null {
  const offerings = getOfferings(config);
  // Shuffle offerings so multi-offering venues get a spread.
  for (const off of [...offerings].sort(() => Math.random() - 0.5)) {
    const sched = scheduleForDate(config, date, off.id);
    if (sched.closed || sched.services.length === 0) continue;
    const svc = pick(sched.services) as ServiceWindow;
    const slots = generateSlots(svc);
    if (slots.length === 0) continue;
    return { offering: off.id, service: svc.id };
  }
  return null;
}

/** A concrete clock time within a service window. */
function timeFor(config: AvailabilityConfig, date: string, offering: string, service: string): string {
  const sched = scheduleForDate(config, date, offering);
  const svc = sched.services.find((s) => s.id === service) as ServiceWindow | undefined;
  const slots = svc ? generateSlots(svc) : [];
  return slots.length ? pick(slots) : "19:00";
}

function statusFor(scope: Scope): ReservationStatus {
  if (scope === "history") return chance(0.84) ? "completed" : pick<ReservationStatus>(["cancelled", "no_show", "completed"]);
  if (scope === "upcoming") return chance(0.7) ? "confirmed" : "pending";
  // today — a lively mix across the whole lifecycle
  return pick<ReservationStatus>([
    "completed", "completed", "seated", "seated", "confirmed", "confirmed",
    "confirmed", "pending", "pending", "cancelled", "no_show",
  ]);
}

export async function seedReservations(tenantId: string, scope: Scope): Promise<MockSummary> {
  const store = getStore().forTenant(tenantId);
  const config = await store.getConfig();
  const today = nowInTz(config.timezone).dateStr;

  // Days to populate for this scope.
  const days: string[] = [];
  if (scope === "today") days.push(today);
  else if (scope === "upcoming") for (let d = 1; d <= 14; d++) days.push(addDays(today, d));
  else for (let d = 75; d >= 1; d--) days.push(addDays(today, -d));

  // Managed tables we can assign to (best-effort, by capacity fit).
  const tables = (await getTableStore(tenantId).listTables()).filter((t) => t.active);
  const fitTable = (party: number): RestaurantTable | undefined => {
    const fits = tables.filter((t) => t.capacity >= party && t.minParty <= party);
    return fits.length ? pick(fits) : undefined;
  };

  const inputs: NewReservationInput[] = [];
  for (const date of days) {
    const count = scope === "today" ? rint(8, 14) : rint(2, 7);
    for (let k = 0; k < count; k++) {
      const slot = slotFor(config, date);
      if (!slot) break; // venue closed that day
      const g = pick(GUESTS);
      const party = rint(1, 8);
      const status = statusFor(scope);
      const time = timeFor(config, date, slot.offering, slot.service);
      // Assign a physical table to most non-pending bookings when tables exist.
      const assign = status !== "pending" && status !== "cancelled" && chance(0.6) ? fitTable(party) : undefined;
      inputs.push({
        date,
        time,
        offering: slot.offering,
        service: slot.service,
        partySize: party,
        name: g.name,
        email: g.email,
        phone: g.phone,
        occasion: pick(OCCASIONS) ?? undefined,
        notes: pick(NOTES) ?? undefined,
        tableId: assign?.id,
        tableLabel: assign?.label,
        source: chance(0.7) ? "web" : "admin",
        status,
      });
    }
  }

  await inChunks(inputs, 20, (input) => store.createReservation(input));
  return { reservations: inputs.length };
}

/* ------------------------------------------------------------------ waitlist */

export async function seedWaitlist(tenantId: string): Promise<MockSummary> {
  const store = getStore().forTenant(tenantId);
  const config = await store.getConfig();
  const wl = getWaitlistStore(tenantId);
  const offering = getOfferings(config)[0].id;
  const today = nowInTz(config.timezone).dateStr;

  const picks = [...GUESTS].sort(() => Math.random() - 0.5).slice(0, 5);
  let count = 0;
  for (let i = 0; i < picks.length; i++) {
    const g = picks[i];
    const entry = await wl.addEntry(
      {
        offering,
        date: today,
        name: g.name,
        phone: g.phone,
        email: g.email,
        partySize: rint(2, 6),
        quotedWaitMin: pick([10, 15, 20, 30, 45]),
        pagerLabel: chance(0.5) ? `P${rint(1, 20)}` : undefined,
        notes: pick(NOTES) ?? undefined,
      },
      config,
    );
    // Mark the first couple as already notified to exercise that state.
    if (i < 2) await wl.updateEntry(entry.id, { status: "notified" });
    count++;
  }
  return { waitlist: count };
}

/* ------------------------------------------------------------------ feedback */

export async function seedFeedback(tenantId: string): Promise<MockSummary> {
  const store = getStore().forTenant(tenantId);
  const config = await store.getConfig();
  const today = nowInTz(config.timezone).dateStr;

  const past = await store.listReservations({ to: addDays(today, -1) });
  const completed = past.filter((r) => r.status === "completed");

  let requested = 0;
  await inChunks(completed, 15, async (r) => {
    if (!chance(0.55)) return;
    if (await getFeedbackByReservation(r.id)) return; // don't double-up
    await createFeedbackToken(r.id, tenantId);
    requested++;
  });
  return { reviewRequests: requested };
}

/* --------------------------------------------------------------------- all */

export async function seedAll(tenantId: string): Promise<MockSummary> {
  // Order matters: tables + customers first so reservations can reference them;
  // feedback last so it can attach to the freshly-seeded completed history.
  const out: MockSummary = {};
  const merge = (s: MockSummary) => Object.assign(out, s);
  merge(await seedTables(tenantId));
  merge(await seedCustomers(tenantId));
  merge(await seedReservations(tenantId, "history"));
  // Fold the today/upcoming counts into the same key.
  const t = await seedReservations(tenantId, "today");
  const u = await seedReservations(tenantId, "upcoming");
  out.reservations = (out.reservations ?? 0) + (t.reservations ?? 0) + (u.reservations ?? 0);
  merge(await seedFeedback(tenantId));
  merge(await seedWaitlist(tenantId));
  return out;
}

/* ------------------------------------------------------------------- clear */

/** Wipe a tenant's operational data (everything generated above). Destructive. */
export async function clearTenantData(tenantId: string): Promise<MockSummary> {
  const pool = getPool();
  const out: MockSummary = {};
  const del = async (key: string, sql: string) => {
    const [res] = await pool.query(sql, [tenantId]);
    out[key] = (res as { affectedRows?: number }).affectedRows ?? 0;
  };
  // Order respects FK-free deletes but mirrors logical dependencies.
  await del("feedback", "DELETE FROM reservation_feedback WHERE tenant_id = ?");
  await del("waitlist", "DELETE FROM waitlist WHERE tenant_id = ?");
  await del("reservations", "DELETE FROM reservations WHERE tenant_id = ?");
  await del("tables", "DELETE FROM tables WHERE tenant_id = ?");
  await del("customers", "DELETE FROM customer_profiles WHERE tenant_id = ?");
  return out;
}
