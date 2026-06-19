<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Reservation System

Multi-tenant restaurant reservation backend + staff/operator UI on **Next.js 16**
(App Router, Node runtime), **React 19**, **MySQL** (`mysql2`). One deployment
serves many restaurants. Tests use `vitest` + `mysql-memory-server` (in-memory
MySQL); emails via `nodemailer`. No global mail env — SMTP is per-tenant.

## Three surfaces
- **Public booking API** — CORS-gated, per-tenant: `/api/availability`,
  `/api/reservations`, `/api/reservations/lookup`, `/api/tenant`, `/api/feedback/*`.
  Marketing sites are separate apps that call this with `?tenant=<publicKey>`.
- **Staff admin** `/admin` — per-restaurant: reservations, tables, waitlist,
  customers, availability, analytics, settings. Gated by a per-tenant session.
- **Platform console** `/platform` — operators manage tenants (create, branding,
  SMTP, public key, allowed origins, domains). Gated by a platform session.

## Architecture rules (read before editing)
- **Edge vs Node split.** `src/proxy.ts` is the Edge middleware (Next 16 renamed
  `middleware` → `proxy`). It only verifies the HMAC session cookie — it CANNOT
  reach MySQL. All tenant resolution + DB work happens on the Node runtime in
  route handlers / server components. Never import `node:crypto` password hashing
  or the stores from proxy.
- **Tenancy** (`src/lib/reservations/tenant-context.ts`): admin resolves tenant by
  **Host header**; public API prefers **`?tenant=<publicKey>`**, falls back to Host.
  Use the guards — `requireAdmin` (host + session bound to THAT tenant → 403 on
  mismatch, the cross-tenant guard), `requirePlatform`, `requireTenant`. 30s
  tenant cache.
- **Storage** goes through the `ReservationStore` interface in `store.ts`
  (`MySqlStore` impl). Use `createReservationChecked` for capacity-sensitive
  writes — it closes the read-then-write race. Schema auto-migrates on startup
  via `src/instrumentation.ts` → `mysql-schema.ts`.
- **Per-site config** lives in `src/reservation.config.ts` (branding, default
  hours, party limits, email templates). `defaultAvailability` only *seeds* a new
  tenant; staff edit it live in `/admin` (persisted in the store).

## Conventions
- **Route handlers** declare `export const runtime = "nodejs"`. Public endpoints
  wrap every response in `withCors(res, allowedOrigin(req, tenant))` and export an
  `OPTIONS` that returns `preflight(...)`. CORS is per-tenant: only origins in
  `tenant.settings.allowedOrigins` are echoed (`src/lib/reservations/cors.ts`).
- **Anti-abuse on public booking** (`/api/reservations`): honeypot field `_hp` +
  submit-timing `_t` both return a *silent* fake-success (`fakeOk()`, gives bots
  no signal); MySQL-backed fixed-window rate limits (`rate-limit.ts`) keyed by
  IP, email, and phone; 16KB body cap; max active reservations per contact.
  Keep these when touching the endpoint.
- **Offerings** (`offerings.ts`): a tenant's availability is a list of offerings;
  the primary id is always `DEFAULT_OFFERING_ID` (`"main"`). Legacy single-schedule
  configs are synthesized into one "main" offering at read time — never rewritten
  until next save. Always go through `getOfferings()`, don't read `config.offerings`
  directly.
- **Tenant-scoped stores**: `getStore().forTenant(tenant.id)` — every query is
  scoped to one tenant. Config writes pass through `sanitizeConfig` /
  `sanitizeTenant` before persistence.
- **i18n**: admin/operator strings live in `src/i18n/admin.ts` (`am.*`). Guest-facing
  marketing copy is **not** in this repo — it lives in the separate marketing site
  that consumes this service's public API.
- **Reservation refs**: external-facing references come from `referenceOf(id)` —
  don't expose raw ids.

## Commands
```bash
npm run dev            # dev server
npm test               # vitest run (in-memory MySQL)
npm run test:coverage  # with coverage
npm run build          # production build
npm run platform -- create-admin --username ops --password '…'   # operator CLI
npm run tenant   -- create --slug … --host … --allowed-origins …  # provision tenant CLI
```

## Setup
`cp .env.example .env.local`, fill `SESSION_SECRET` + (`DATABASE_URL` or the four
`MYSQL_*` vars). Schema is created on first boot. Seed scripts in `scripts/`.
