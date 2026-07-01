<!-- BEGIN:nextjs-agent-rules -->
# This Is Not The Next.js You Know

This project uses **Next.js 16**. APIs, file conventions, routing behavior, and
middleware naming may differ from older Next.js versions. Before changing Next
route handlers, layouts, server components, proxy behavior, caching, or build
configuration, read the relevant guide in `node_modules/next/dist/docs/` and
heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Reservation System Agent Guide

Multi-tenant restaurant reservation backend plus staff and platform UIs on
**Next.js 16**, **React 19**, and **MySQL** via `mysql2`. Tests run with
`vitest` and `mysql-memory-server`. Email is sent through `nodemailer` using
per-tenant SMTP settings. There is no global SMTP configuration.

## Product Surfaces

- **Public booking API**: `/api/availability`, `/api/reservations`,
  `/api/reservations/lookup`, `/api/tenant`, `/api/feedback/*`.
  Marketing sites are separate apps and select the tenant with
  `?tenant=<publicKey>`; Host fallback exists for same-domain deployments.
- **Staff admin**: `/admin/<slug>`. Staff manage reservations, waitlist,
  customers, tables, availability, analytics, and tenant-owned operational
  settings. The slug is for routing and page branding; the session is the
  authority for tenant access.
- **Platform console**: `/platform`. Operators manage tenants, domains,
  public keys, branding, SMTP, allowed origins, email flow policy, mock data,
  and staff-password resets.

## Non-Negotiable Architecture Rules

- `src/proxy.ts` is the Edge middleware. It verifies HMAC session cookies only.
  It must not import MySQL stores, `node:crypto` password hashing, or any Node
  runtime-only reservation modules.
- Route handlers and server components do tenant lookup and database work in
  the Node runtime. API route handlers should declare `export const runtime =
  "nodejs"` unless there is a specific reason not to.
- Admin API tenant identity comes from `requireAdmin(req)` and the session
  tenant id, not from slug, host, request body, or query string.
- Platform API access goes through `requirePlatform(req)`.
- Public API tenant identity is resolved by `requireTenant(req)`, preferring
  `?tenant=<publicKey>` and falling back to Host.
- All tenant-scoped data access must go through `getStore().forTenant(tenant.id)`
  or the relevant tenant-scoped store constructor/helper. Never query shared
  tables without a tenant predicate.
- External reservation references use `referenceOf(id)`. Do not expose raw
  reservation IDs to guest-facing/public responses.
- Schema migration is automatic on startup through `src/instrumentation.ts` and
  `src/lib/reservations/mysql-schema.ts`. Keep migrations idempotent.

## Security And Abuse Rules

- Public booking anti-abuse in `/api/reservations` is intentional: 16KB body
  cap, honeypot `_hp`, submit timing `_t`, silent fake-success for bots,
  MySQL-backed fixed-window rate limits by IP/email/phone, and max active
  reservations per contact. Preserve these controls.
- Public lookup `/api/reservations/lookup` is stricter than booking and is used
  for guest self-service. Keep lookup rate limits, tenant CORS, and reference
  based access semantics intact.
- Cookie-authenticated admin/platform mutations must pass the same-origin CSRF
  check in `tenant-context.ts`. Do not bypass it for convenience.
- Sensitive platform mutations, currently tenant delete and staff password
  reset, require operator password re-auth. Preserve and extend that pattern
  for similarly destructive platform actions.
- CORS is per tenant. Public endpoints must wrap responses with
  `withCors(res, allowedOrigin(req, tenant))` and export `OPTIONS` using
  `preflight(...)`. Only origins in `tenant.settings.allowedOrigins` are echoed.

## Tenancy And Settings

- Tenant settings are modeled in `src/lib/reservations/tenant.ts` and sanitized
  in `sanitize-tenant.ts`. Platform writes must pass through sanitization.
- Availability config is modeled in `types.ts` and sanitized in
  `sanitize-config.ts`. Staff edits in `/admin` persist live config; defaults in
  `src/reservation.config.ts` only seed new tenants.
- `templateSettings()` and `templateAvailability()` are defaults, not global
  runtime configuration for existing tenants.
- `sanitizeTenant`/`sanitizeConfig` must preserve explicit false values and avoid
  accidental feature re-enabling during partial platform updates.

## Offerings And Availability

- Multi-offering support is real. Use `getOfferings()` and offering helpers;
  do not read or rewrite `config.offerings` directly unless you are inside the
  offering normalization/sanitization code.
- The primary/legacy offering id is always `DEFAULT_OFFERING_ID` (`"main"`).
  Existing reservations depend on this. Never rename or derive it.
- Legacy single-schedule configs are synthesized into one `"main"` offering at
  read time and should not be rewritten until the tenant saves config.
- Capacity-sensitive public booking writes must use `createReservationChecked`
  to close the read-then-write race.

## Reservations, Tables, And Guest Self-Service

- Reservation statuses are: `pending`, `confirmed`, `seated`, `completed`,
  `cancelled`, `no_show`.
- `ACTIVE_STATUSES` intentionally includes `completed` because historical
  same-day occupancy can still matter for table/capacity calculations. Be
  deliberate before changing status semantics.
- Guest self-service lookup can modify or cancel eligible reservations through
  `/api/reservations/lookup`. Guest modifications must revalidate availability
  and clear table assignment when date/time/service/party changes would make an
  existing table assignment unsafe.
- Table assignment supports both single tables (`tableId`) and joined table
  sets (`tableIds`). Joined tables are stored as JSON on reservations; conflict
  checks must consider every table id in the set.
- `joinable` tables are not just metadata. `TableStore` can suggest/assign
  combined joinable tables for large parties.
- Date/time/service/offering edits on reservations with assigned tables must
  revalidate table conflicts.
- Per-reservation `durationMinsOverride` affects table conflict windows. Keep it
  in table validation, row UI, route patch handling, and persistence together.

## Email, Feedback, And Logs

- Tenant SMTP is configured only per tenant. Do not add global mail env vars.
- Platform operators own the email flow policy:
  - `settings.emailEnabled` is the global outbound email switch.
  - `settings.emailEvents.bookingConfirmation` controls booking confirmations.
  - `settings.emailEvents.feedbackRequest` controls post-visit review requests.
  - `settings.feedbackRequestDelayHours` controls when automatic review requests
    become due after reservation time.
  - `settings.feedbackEnabled` is a legacy compatibility alias for feedback
    request/collection behavior.
- Staff/tenant admin UI must not expose platform-only email policy controls.
- Use `src/lib/reservations/email-policy.ts` for email event checks, feedback
  collection checks, attended-guest checks, and delay calculations. Do not
  duplicate policy branches in routes.
- Feedback request sends should funnel through `feedback-automation.ts` so that
  no request is sent before the tenant delay or to a no-show/cancelled/unattended
  reservation. Currently only `completed` means the guest attended.
- There is no external scheduler in this app. Due delayed feedback requests are
  processed opportunistically from the admin reservation list path and on status
  changes. If adding a real scheduler, keep the same idempotency checks.
- `sendConfirmationEmail` and `sendFeedbackRequestEmail` never throw; they
  return skipped/error results and write high-signal email log entries.
- Email log access is tenant-scoped. Do not allow cross-tenant reads by
  reservation id alone.

## Public Feedback

- Public feedback links are token-based and tenant-scoped.
- Disabling outbound email globally should suppress new sends but should not by
  itself invalidate already-issued feedback links.
- Disabling feedback/review collection should make public feedback links return
  the disabled response.
- Keep CORS behavior for `/api/feedback/[token]`; marketing sites need it.

## Platform Console

- Platform tenant pages are the only place for operator-only controls such as
  domains, public tenant key, CORS allowed origins, SMTP, email flow policy,
  staff password reset, destructive tenant actions, and mock data.
- Platform tenant detail UI should stay clear in both light and dark themes.
  Use existing surface tokens (`bg-surface-container`,
  `bg-surface-container-high`, `border-outline-variant`,
  `text-on-surface-variant`, `bg-primary`, `text-on-primary`) instead of
  hard-coded one-off palettes.
- For destructive platform actions, keep confirmation copy explicit and require
  operator password re-auth where appropriate.

## Staff Admin UI

- Admin/operator strings live in `src/i18n/admin.ts` and `src/i18n/it.ts`.
  Guest-facing marketing copy is not in this repo.
- Keep admin UI dense, scannable, and operational. Avoid marketing-style hero
  patterns in staff tools.
- Preserve light/dark contrast by using the established design tokens in
  `globals.css` and existing components. Avoid new arbitrary colors unless they
  serve a specific status/semantic need.
- If adding controls to reservation rows or modals, verify they work on narrow
  screens and do not obscure the existing status, table, waitlist, and feedback
  actions.

## Route Handler Conventions

- Public route handlers should:
  - resolve tenant with `requireTenant(req)`;
  - use per-tenant CORS helpers on every response;
  - include `OPTIONS` preflight when called cross-origin;
  - avoid leaking raw ids or cross-tenant state.
- Admin route handlers should:
  - use `requireAdmin(req)`;
  - trust the session tenant id;
  - use tenant-scoped stores;
  - emit reservation events when reservation state changes.
- Platform route handlers should:
  - use `requirePlatform(req)`;
  - sanitize tenant settings before persistence;
  - redact secrets such as SMTP passwords before returning settings.

## Testing Expectations

- Use focused tests for changed behavior, then run the broader suite when the
  blast radius touches shared stores, routes, tenancy, security, availability,
  email, or UI contracts.
- Main commands:
  ```bash
  npm test
  npm run build
  npm run test:coverage
  ```
- Tests use in-memory MySQL through `mysql-memory-server`; do not require a
  local MySQL daemon for normal test runs.
- Existing email failure-path tests intentionally log stderr. The Node
  `--localstorage-file was provided without a valid path` warning has been fixed
  in `test/setup-locale.ts`; do not reintroduce it by touching Node's lazy
  `globalThis.localStorage` accessor incorrectly.
- When changing database schema, update `mysql-schema.ts`, MySQL store mapping,
  types, route tests, and store contract tests together.
- When changing public API behavior, verify CORS and marketing-site integration
  assumptions, not just internal route status codes.

## Commands And Setup

```bash
npm install
cp .env.example .env.local
npm run dev
npm test
npm run build
npm run platform -- create-admin --username ops --password 'strong-pass'
npm run tenant -- create --slug acme --name "Acme Osteria" \
  --username staff --password 'pw' --host admin.acme.com \
  --allowed-origins "https://www.acme.com,https://acme.com"
```

Required environment: `SESSION_SECRET` plus either `DATABASE_URL` or
`MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`.
Schema is created on first boot.

## Working Style For Agents

- Read the nearby code and tests before editing. This repo has intentionally
  centralized helpers for tenancy, CORS, offerings, email policy, feedback
  automation, table conflicts, and sanitization.
- Prefer existing helper APIs and design tokens over new abstractions.
- Keep edits tenant-safe, route-safe, and test-backed.
- Do not revert unrelated changes. If the worktree is dirty, identify which
  changes are yours and work around the rest.
