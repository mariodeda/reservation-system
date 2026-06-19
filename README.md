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
- **Staff admin** `/admin` — per-restaurant: reservations, tables, waitlist,
  customers, availability, analytics, settings. Gated by a per-tenant session.
- **Platform console** `/platform` — operators manage tenants (create, branding,
  SMTP, public key, allowed origins, domains). Gated by a platform session.
- **Tenancy** is host-routed for admin and key-or-host for the public API. Schema
  migrations run automatically on startup (`src/instrumentation.ts`).

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
