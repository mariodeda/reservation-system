# System Overview

The reservation system is a multi-tenant Next.js application. One deployment
serves many restaurants. Public restaurant websites are separate clients that
call the public booking API.

## Runtime

- Next.js App Router on the Node.js runtime for API handlers and server pages.
- Edge proxy in `src/proxy.ts` only verifies HMAC session cookies and must not
  import database or Node-only reservation modules.
- MySQL persistence through `mysql2`.
- Schema creation and migration are automatic and idempotent through
  `src/instrumentation.ts` and `src/lib/reservations/mysql-schema.ts`.
- Tests run with Vitest and in-memory MySQL.

## Tenancy

Tenant identity is resolved differently by surface:

- Public API: `requireTenant(req)`, preferring `?tenant=<publicKey>` and falling
  back to the request host.
- Tenant admin API: `requireAdmin(req)`, using the tenant id in the staff
  session cookie. The route slug is not an authority for data access.
- Platform API: `requirePlatform(req)`, using the platform session cookie.

All tenant-scoped store calls must use `getStore().forTenant(tenant.id)` or a
tenant-scoped store helper.

## Core Concepts

- Tenant: a restaurant account with branding, settings, domains, allowed CORS
  origins, SMTP settings, and staff credentials.
- Offering: a bookable channel such as dining or bar. The legacy primary
  offering id is `main`.
- Service: a service window inside an offering, such as lunch or dinner.
- Slot: a generated bookable time inside a service.
- Table: physical capacity. Active tables drive slot capacity when tables exist.
- Turn duration: table duration used for table conflicts and overlapping cover
  calculations. Service-specific duration overrides the global default.
- Reservation policy: public-safe booking limits such as `maxPartySize`.

## Availability Mechanism

Availability is computed from:

- Tenant availability config.
- Offering/service schedules for the selected date.
- Closed days, special date overrides, blocked slots, and today-only disabled
  services.
- Lead time.
- Active tables bound to the offering, or legacy service capacity when no tables
  exist.
- Existing active reservations, including overlapping reservations according to
  the effective turn duration.
- Minimum and maximum party-size policy.

Slot availability is not a simple seat counter. Each slot reports capacity,
booked covers, remaining covers, `available`, and when unavailable a reason such
as blocked time, booking cutoff, stopped service, or insufficient covers.

## Email Model

SMTP is configured per tenant. There is no global SMTP account.

Platform operators control:

- Global outbound email switch.
- Booking confirmation email.
- Post-visit review request email.
- Review URL.
- Templates and SMTP connection health checks.

Email sends write email log entries for sent, failed, and skipped states.
Feedback/review request sends use idempotent checks and a send lock to avoid
duplicate delivery.

## Observability

Route handlers are wrapped with observability helpers:

- `observePublicRoute`
- `observeAdminRoute`
- `observePlatformRoute`
- `observeSystemRoute`

Non-200 responses and thrown handlers are recorded in platform-visible logs with
request metadata. Mutations performed during platform impersonation are logged
as impersonation mutations.

