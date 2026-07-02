/**
 * Seed a curated, demo-quality dataset for showcasing the reservation system:
 *   - a rich set of TODAY reservations (varied statuses, VIPs, dietary alerts, tables)
 *   - ~75 days of history so analytics + customer profiles populate
 *   - customer profiles (VIP, dietary/staff notes)
 *   - post-visit review-request email logs for completed past visits
 *
 * Scoped to the tenant mapped to host `localhost`. Replaces that tenant's
 * reservations / customer_profiles / reservation_emails with the demo set.
 *
 * Usage:  node scripts/seed-showcase.mjs
 */
import mysql from "mysql2/promise";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

// load .env.local
try {
  readFileSync(".env.local", "utf8").split("\n").forEach((line) => {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.*)/);
    if (m) process.env[m[1]] ??= m[2].trim();
  });
} catch { /* ignore */ }

const pool = mysql.createPool(
  process.env.DATABASE_URL ?? {
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  },
);

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => d.toISOString();
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rint = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

// today's date in Europe/Rome (matches what the admin shows)
const TZ = "Europe/Rome";
const parts = Object.fromEntries(
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
    .formatToParts(new Date()).map((p) => [p.type, p.value]),
);
const TODAY = `${parts.year}-${parts.month}-${parts.day}`;

const GUESTS = [
  { n: "Marco Rossi" },
  { n: "Giulia Bianchi", vip: true, staff: "Anniversary regular — likes the terrace." },
  { n: "Luca Ferrari", dietary: "Severe nut allergy" },
  { n: "Sofia Esposito" },
  { n: "Alessandro Ricci", vip: true, staff: "Wine collector; offer the reserve list." },
  { n: "Francesca Romano" },
  { n: "Matteo Conti" },
  { n: "Elena Colombo", dietary: "Coeliac — strictly gluten-free" },
  { n: "Davide Russo" },
  { n: "Chiara Marino" },
  { n: "James Smith" },
  { n: "Emma Johnson", dietary: "Vegetarian; no shellfish" },
  { n: "Oliver Brown" },
  { n: "Charlotte Davis" },
  { n: "William Wilson" },
  { n: "Isabella Conte" },
  { n: "Thomas Greco" },
  { n: "Olivia Marchetti" },
].map((g, i) => ({
  ...g,
  email: g.n.toLowerCase().replace(/[^a-z]+/g, ".") + "@example.com",
  phone: pick(["+39 055 ", "+39 02 ", "+39 06 ", "+44 20 ", "+1 212 "]) + rint(100000, 999999),
}));
const byName = Object.fromEntries(GUESTS.map((g) => [g.n, g]));

const LUNCH = ["12:00", "12:30", "13:00", "13:30", "14:00", "14:30"];
const DINNER = ["18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30"];
const OCCASIONS = [null, null, null, "Birthday", "Anniversary", "Business dinner", "Date night"];

const rows = [];   // reservation rows
const feedback = []; // review-request email log rows

function add(r) {
  const id = randomUUID();
  const created = new Date(`${r.date}T00:00:00Z`);
  created.setUTCDate(created.getUTCDate() - rint(1, 21)); // booked 1–21 days ahead
  rows.push({
    id, date: r.date, time: r.time, offering: "main", service: r.service,
    party: r.party, name: r.g.n, email: r.g.email, phone: r.g.phone,
    occasion: r.occasion ?? null, notes: r.notes ?? null, table: r.table ?? null,
    status: r.status, source: r.source ?? "web", created_at: iso(created), updated_at: iso(created),
  });
  return id;
}

// ---- history: ~75 days back ----
for (let d = 75; d >= 1; d--) {
  const day = new Date(`${TODAY}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - d);
  const dow = day.getUTCDay();
  if (dow === 0) continue; // Sundays closed
  const count = rint(2, 7);
  for (let k = 0; k < count; k++) {
    const g = pick(GUESTS);
    const isDinner = Math.random() > 0.4;
    const status = Math.random() < 0.84 ? "completed" : pick(["cancelled", "no_show", "completed"]);
    const id = add({
      date: ymd(day), time: pick(isDinner ? DINNER : LUNCH), service: isDinner ? "dinner" : "lunch",
      party: rint(2, 7), g, occasion: pick(OCCASIONS), status, source: Math.random() < 0.7 ? "web" : "admin",
    });
    // review request email log for ~45% of completed
    if (status === "completed" && Math.random() < 0.45) {
      const sent = new Date(`${ymd(day)}T20:00:00Z`);
      feedback.push({
        id: randomUUID(), reservation_id: id, sent_at: iso(sent), to_email: g.email,
      });
    }
  }
}

// ---- TODAY: curated, screenshot-friendly ----
const today = [
  { time: "12:30", service: "lunch", g: "Giulia Bianchi", party: 4, status: "completed", table: "5", occasion: "Anniversary", source: "web" },
  { time: "13:00", service: "lunch", g: "Luca Ferrari", party: 2, status: "completed", table: "9", source: "web" },
  { time: "13:30", service: "lunch", g: "James Smith", party: 3, status: "completed", occasion: "Business dinner", source: "admin" },
  { time: "14:00", service: "lunch", g: "Sofia Esposito", party: 6, status: "no_show", source: "web" },
  { time: "19:00", service: "dinner", g: "Alessandro Ricci", party: 2, status: "seated", table: "2", occasion: "Date night", source: "web" },
  { time: "19:00", service: "dinner", g: "Francesca Romano", party: 4, status: "confirmed", table: "8", source: "web" },
  { time: "19:30", service: "dinner", g: "Emma Johnson", party: 2, status: "confirmed", notes: "Window table if possible", source: "web" },
  { time: "19:30", service: "dinner", g: "Matteo Conti", party: 5, status: "pending", source: "web" },
  { time: "20:00", service: "dinner", g: "Elena Colombo", party: 8, status: "confirmed", occasion: "Birthday", notes: "Bringing a cake", table: "14", source: "admin" },
  { time: "20:00", service: "dinner", g: "Davide Russo", party: 2, status: "pending", source: "web" },
  { time: "20:30", service: "dinner", g: "Chiara Marino", party: 3, status: "confirmed", source: "web" },
  { time: "20:30", service: "dinner", g: "Isabella Conte", party: 2, status: "confirmed", occasion: "Anniversary", source: "web" },
  { time: "21:00", service: "dinner", g: "Charlotte Davis", party: 4, status: "confirmed", table: "12", source: "web" },
  { time: "21:00", service: "dinner", g: "William Wilson", party: 2, status: "cancelled", source: "web" },
  { time: "18:45", service: "dinner", g: "Thomas Greco", party: 2, status: "seated", table: "3", source: "admin" },
];
for (const t of today) add({ date: TODAY, ...t, g: byName[t.g] });

// ---- write ----
const TID = process.argv[2]; // optional override

async function main() {
  const conn = await pool.getConnection();
  try {
    const [[trow]] = [await conn.query(
      TID ? "SELECT id FROM tenants WHERE id=?" : "SELECT t.id FROM tenants t JOIN tenant_domains d ON d.tenant_id=t.id WHERE d.host='localhost' LIMIT 1",
      TID ? [TID] : [],
    )];
    const tenantId = trow[0]?.id;
    if (!tenantId) throw new Error("No tenant mapped to localhost (and no id arg).");

    await conn.query("DELETE FROM reservation_emails WHERE tenant_id=?", [tenantId]);
    await conn.query("DELETE FROM reservations WHERE tenant_id=?", [tenantId]);
    await conn.query("DELETE FROM customer_profiles WHERE tenant_id=?", [tenantId]);

    // customer profiles (VIP / dietary / staff notes)
    for (const g of GUESTS) {
      if (!g.vip && !g.dietary && !g.staff) continue;
      await conn.query(
        "INSERT INTO customer_profiles (id, tenant_id, email, vip, staff_notes, dietary_notes, updated_at) VALUES (?,?,?,?,?,?,?)",
        [randomUUID(), tenantId, g.email.toLowerCase(), g.vip ? 1 : 0, g.staff ?? null, g.dietary ?? null, iso(new Date(`${TODAY}T08:00:00Z`))],
      );
    }

    const RES_SQL =
      "INSERT INTO reservations (id, tenant_id, `date`, `time`, offering, service, party_size, name, email, phone, occasion, notes, table_label, status, source, created_at, updated_at) VALUES ?";
    const values = rows.map((r) => [r.id, tenantId, r.date, r.time, r.offering, r.service, r.party, r.name, r.email, r.phone, r.occasion, r.notes, r.table, r.status, r.source, r.created_at, r.updated_at]);
    // chunk to keep packets small
    for (let i = 0; i < values.length; i += 200) {
      await conn.query(RES_SQL, [values.slice(i, i + 200)]);
    }

    if (feedback.length) {
      const FB_SQL = "INSERT INTO reservation_emails (id, tenant_id, reservation_id, type, status, to_email, created_at) VALUES ?";
      const fv = feedback.map((f) => [f.id, tenantId, f.reservation_id, "feedbackRequest", "sent", f.to_email, f.sent_at]);
      for (let i = 0; i < fv.length; i += 200) await conn.query(FB_SQL, [fv.slice(i, i + 200)]);
    }

    const todays = rows.filter((r) => r.date === TODAY).length;
    console.log(`Tenant ${tenantId}`);
    console.log(`Seeded: ${rows.length} reservations (${todays} today), ${feedback.length} review-request email logs, ${GUESTS.filter((g) => g.vip || g.dietary || g.staff).length} customer profiles.`);
    console.log(`Today = ${TODAY} (${parts.weekday})`);
  } finally {
    conn.release();
    await pool.end();
  }
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
