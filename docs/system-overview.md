# System Overview

The reservation system is a multi-tenant Next.js application. One deployment
serves many restaurants, and each restaurant is isolated as a tenant. Restaurant
marketing websites are separate clients that call public booking APIs with a
tenant public key.

The system is built around a practical rule: public guests should see only
booking-safe information, tenant staff should see only their own restaurant
operations, and platform administrators should manage cross-tenant setup and
support without weakening tenant isolation.

## Runtime And Storage

- Next.js App Router runs server pages and API route handlers.
- API route handlers that use reservations, MySQL, email, or tenant stores run
  on the Node.js runtime.
- `src/proxy.ts` is the Edge proxy. It verifies HMAC session cookies only and
  must stay free of database imports and Node-only reservation modules.
- MySQL stores tenant, reservation, table, waitlist, settings, log, and email
  log data through `mysql2`.
- Schema creation and migration run automatically and idempotently through
  `src/instrumentation.ts` and `src/lib/reservations/mysql-schema.ts`.
- Tests use Vitest and in-memory MySQL so normal test runs do not require a
  local MySQL daemon.

## Tenancy Model

Tenant identity is resolved differently depending on the surface:

| Surface | Authority | Notes |
| --- | --- | --- |
| Public API | `requireTenant(req)` | Prefers `?tenant=<publicKey>` and falls back to Host. |
| Tenant admin API | `requireAdmin(req)` | Uses tenant id from the staff session cookie. URL slug is not an authority. |
| Platform API | `requirePlatform(req)` | Uses the platform session cookie. |

All tenant-scoped data access must go through a tenant-scoped store such as
`getStore().forTenant(tenant.id)`. A query that reads shared tables without a
tenant predicate is a security bug.

## Core Concepts

### Tenant

A tenant is one restaurant account. It owns branding, domains, public tenant
key, allowed origins, settings, availability, tables, reservations, customers,
SMTP settings, email templates, and staff credentials.

### Offering

An offering is a bookable channel such as main dining, bar, patio, or private
room. Multi-offering support is real. The legacy primary offering id is always
`main`, and existing reservations depend on that id.

### Service

A service is a time window inside an offering, such as lunch or dinner. Services
define the start time, end time, slot interval, and optionally a service-specific
table duration.

### Slot

A slot is one generated bookable time inside a service. Slot availability is
computed from schedule, policy, capacity, existing reservations, lead time,
blocks, closed days, and today-only service stop controls.

### Table

Tables represent physical seating. Active tables drive bookable slot capacity
when tables exist for an offering. Tables may be bound to offerings, disabled,
or marked as joinable for combined table suggestions.

### Effective Table Duration

Effective duration decides how long a reservation occupies capacity. A
service-specific duration overrides the global default. The value is used for
table conflict windows, overlapping cover calculations, floor/day calendar
placement, and slot status.

### Reservation Policy

Reservation policy is public-safe booking policy, such as minimum and maximum
party size. It is not the same as available capacity. A restaurant can have many
available covers while still limiting one online booking to a smaller party.

## Availability Mechanism

Availability is computed from all of the following:

- Tenant availability configuration.
- Offering and service schedules for the selected date.
- Weekly hours, special date overrides, closed days, and blocked slots.
- Today-only stopped services.
- Lead time and booking window.
- Active tables for the offering, or legacy service capacity only when no
  active tables exist.
- Existing active reservations, including overlaps created by the effective
  table duration.
- Party-size policy.
- Table conflict rules, including joined tables where allowed.

The result is not just a number of seats. Each slot can report:

- Total capacity.
- Booked covers.
- Remaining covers.
- Whether it is bookable.
- A specific unavailable reason when it cannot be booked.

This is why a slot can show some remaining covers but still reject a booking:
the party may exceed policy, the cutoff may have passed, the service may be
stopped, or no valid table combination may exist.

## Reservation Lifecycle

Reservations can move through:

- `pending`
- `confirmed`
- `seated`
- `completed`
- `cancelled`
- `no_show`

Seated and completed reservations cannot be edited or deleted from the tenant UI.
Completed reservations collapse visually so staff can keep the live list focused
while still expanding a completed booking when needed.

`completed` remains part of same-day occupancy calculations because historical
same-day table occupation can still matter for availability and analytics.

## Email Model

SMTP is configured per tenant. There is no global SMTP account.

Platform administrators manage:

- SMTP host, port, username, password, secure mode, and sender address.
- Global outbound email switch.
- Booking confirmation event switch.
- Review request event switch.
- Booking confirmation template.
- Review request template.
- Review URL.
- SMTP health checks.

Email sends create email log entries for sent, failed, and skipped states.
Skipped is a meaningful outcome: for example, an email can be skipped because
SMTP is missing, the event is disabled, the guest has no email address, or the
reservation is not eligible.

Review request sends use idempotency checks and a send lock to avoid duplicate
delivery. Staff can manually send a review request only after a reservation is
completed.

## Observability

Route handlers use observability wrappers:

- `observePublicRoute`
- `observeAdminRoute`
- `observePlatformRoute`
- `observeSystemRoute`

Non-200 responses and thrown handlers are recorded in platform-visible logs with
request metadata. Where available, request body metadata is captured so platform
operators can debug failed saves without reproducing the exact browser action.

Email delivery is monitored separately through email logs. SMTP health checks
are tenant-specific and can be run by cron or manually from the platform admin.

## Mental Model For Debugging

When something looks wrong, identify the surface first:

- Public booking problem: check tenant resolution, CORS, availability, public
  policy, and booking anti-abuse controls.
- Tenant admin problem: check the staff session tenant id, same-origin CSRF,
  tenant-scoped stores, and reservation/table rules.
- Platform problem: check platform authentication, re-auth requirements,
  sanitization, logs, and whether secrets are being redacted.

Then check whether the behavior belongs to configuration, policy, capacity,
security, or delivery. The same symptom can have different causes. For example,
"email did not arrive" can mean skipped by policy, SMTP failure, immediate
recipient rejection, delayed bounce, or provider-side filtering.
