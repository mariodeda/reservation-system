/**
 * Seed sample reservations for a tenant.
 * Usage: node scripts/seed-reservations.mjs <tenantId>
 */
import mysql from "mysql2/promise";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

// Parse .env.local manually (no dotenv dependency needed)
try {
  readFileSync(".env.local", "utf8").split("\n").forEach((line) => {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.*)/);
    if (m) process.env[m[1]] ??= m[2].trim();
  });
} catch { /* no .env.local */ }

const tenantId = process.argv[2];
if (!tenantId) {
  console.error("Usage: node scripts/seed-reservations.mjs <tenantId>");
  process.exit(1);
}

const pool = mysql.createPool(
  process.env.DATABASE_URL ?? {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  },
);

// Spread across the next 30 days with realistic Italian restaurant data
const NAMES   = ["Marco Rossi", "Giulia Bianchi", "Luca Ferrari", "Sofia Esposito", "Alessandro Ricci",
                 "Francesca Romano", "Matteo Conti", "Elena Colombo", "Davide Russo", "Chiara Marino",
                 "James Smith", "Emma Johnson", "Oliver Brown", "Charlotte Davis", "William Wilson"];
const EMAILS  = NAMES.map((n) => n.toLowerCase().replace(" ", ".") + "@example.com");
const PHONES  = ["+39 055 123456", "+39 02 987654", "+39 06 543210", "+1 212 555 0100", "+44 20 7946 0958"];
const OCCASIONS = [null, null, null, "Birthday", "Anniversary", "Business dinner", null, "Birthday"];
const NOTES   = [null, null, "Window table preferred", "Allergic to nuts", null, "High chair needed", null, null];
const SERVICES = ["lunch", "lunch", "dinner", "dinner", "dinner"];
const STATUSES = ["confirmed", "confirmed", "confirmed", "pending", "cancelled"];

function pad(n) { return String(n).padStart(2, "0"); }

function futureDate(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const seed = [
  // near-future confirmed
  { daysAhead: 1,  time: "20:00", service: "dinner",  party: 2, statusIdx: 0 },
  { daysAhead: 1,  time: "20:30", service: "dinner",  party: 4, statusIdx: 0 },
  { daysAhead: 2,  time: "13:00", service: "lunch",   party: 3, statusIdx: 0 },
  { daysAhead: 2,  time: "19:30", service: "dinner",  party: 6, statusIdx: 0 },
  { daysAhead: 3,  time: "12:30", service: "lunch",   party: 2, statusIdx: 0 },
  { daysAhead: 3,  time: "21:00", service: "dinner",  party: 5, statusIdx: 0 },
  { daysAhead: 4,  time: "20:00", service: "dinner",  party: 2, statusIdx: 0 },
  { daysAhead: 5,  time: "13:30", service: "lunch",   party: 4, statusIdx: 0 },
  { daysAhead: 5,  time: "19:00", service: "dinner",  party: 8, statusIdx: 0 },
  // pending
  { daysAhead: 6,  time: "20:30", service: "dinner",  party: 2, statusIdx: 3 },
  { daysAhead: 7,  time: "12:00", service: "lunch",   party: 3, statusIdx: 3 },
  { daysAhead: 8,  time: "19:30", service: "dinner",  party: 4, statusIdx: 3 },
  // further out confirmed
  { daysAhead: 10, time: "20:00", service: "dinner",  party: 2, statusIdx: 0 },
  { daysAhead: 12, time: "13:00", service: "lunch",   party: 6, statusIdx: 0 },
  { daysAhead: 14, time: "19:00", service: "dinner",  party: 2, statusIdx: 0 },
  { daysAhead: 14, time: "21:00", service: "dinner",  party: 3, statusIdx: 0 },
  { daysAhead: 18, time: "20:30", service: "dinner",  party: 4, statusIdx: 0 },
  { daysAhead: 21, time: "13:30", service: "lunch",   party: 2, statusIdx: 0 },
  { daysAhead: 25, time: "19:30", service: "dinner",  party: 5, statusIdx: 0 },
  // cancelled
  { daysAhead: 3,  time: "12:00", service: "lunch",   party: 2, statusIdx: 4 },
  { daysAhead: 9,  time: "20:00", service: "dinner",  party: 3, statusIdx: 4 },
];

const now = new Date().toISOString();

const rows = seed.map((s, idx) => {
  const i = idx % NAMES.length;
  return [
    randomUUID(),
    tenantId,
    futureDate(s.daysAhead),
    s.time,
    s.service,
    s.party,
    NAMES[i],
    EMAILS[i],
    PHONES[i % PHONES.length],
    OCCASIONS[i % OCCASIONS.length] ?? null,
    NOTES[i % NOTES.length] ?? null,
    STATUSES[s.statusIdx],
    "web",
    now,
    now,
  ];
});

const SQL =
  "INSERT INTO reservations (id, tenant_id, `date`, `time`, service, party_size, name, email, phone, occasion, notes, status, source, created_at, updated_at) VALUES ?";

await pool.query(SQL, [rows]);
console.log(`✓ Inserted ${rows.length} reservations for tenant ${tenantId}`);
await pool.end();
