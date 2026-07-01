# Reservation System

Multi-tenant restaurant reservation backend + staff/operator UI. Hosts the public
booking API that marketing sites call, the per-restaurant **staff admin**
(`/admin`), and the **platform operator console** (`/platform`).

Built on Next.js (App Router, Node runtime) + MySQL. One deployment serves many
restaurants (tenants); marketing sites are separate apps that call this service's
public API.

## Architecture

- **Public booking API** (CORS-gated, per-tenant): `/api/availability`,
  `/api/reservations`, `/api/reservations/lookup`, `/api/tenant`, `/api/feedback/*`.
  Marketing sites select their tenant with `?tenant=<publicKey>` (falls back to the
  Host header). Cross-origin access is allowed only from each tenant's configured
  origins.
  - `GET /api/tenant?tenant=<publicKey>` returns public branding plus
    `reservationPolicy.maxPartySize`, sourced from the tenant reservation config.
  - `GET /api/availability?offerings=1&tenant=<publicKey>` returns public offering
    descriptors plus the same `reservationPolicy.maxPartySize`.
  - `reservationPolicy.maxPartySize` is the maximum online party size allowed by
    policy. It is not slot capacity or remaining seats.
- **Staff admin** `/admin/<slug>` — per-restaurant: reservations, tables,
  waitlist, customers, availability, analytics, settings. Staff sign in at
  `/admin/<slug>/login` (branded with the tenant's logo). Gated by a per-tenant
  session; the slug selects the tenant on the shared staff domain.
- **Platform console** `/platform` — operators manage tenants (create, branding,
  SMTP, public key, allowed origins, domains). Gated by a platform session.
- **Tenancy**: staff admin is **slug-routed** (`/admin/<slug>`), and admin API
  routes resolve the tenant from the session (the session is the authority — a
  staff member only ever acts on their own tenant). The public API is key-or-host.
  Schema migrations run automatically on startup (`src/instrumentation.ts`).

## Setup

```bash
npm install
cp .env.example .env.local   # fill in SESSION_SECRET + MySQL connection
npm run dev
```

Schema is created on first boot. Then seed the first operator and a tenant:

```bash
npm run platform -- create-admin --username ops --password 'strong-pass'
npm run tenant -- create --slug acme --name "Acme Osteria" \
  --username staff --password 'pw' --host admin.acme.com \
  --allowed-origins "https://www.acme.com,https://acme.com"
```

The `create` command prints the tenant's **public key** — set it as
`NEXT_PUBLIC_RESERVATIONS_TENANT` on that restaurant's marketing site.

## Environment

See `.env.example`. Required: `SESSION_SECRET`, and either `DATABASE_URL` or the
four `MYSQL_*` vars. SMTP is configured per-restaurant in the platform console (no
global mail env).

## Scripts

```bash
npm run dev            # dev server
npm run build          # production build
npm start              # serve the build
npm test               # vitest (uses an in-memory MySQL)
npm run platform -- …  # platform-admin CLI (create-admin, …)
npm run tenant -- …    # tenant provisioning CLI (create, add-domain, …)
```
