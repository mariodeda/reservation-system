# API And Security Model

This page explains the API surfaces and the security rules that keep public
guests, restaurant staff, and platform operators separated.

## Public Endpoints

Public endpoints are used by restaurant marketing websites. They are designed to
be safe for browser clients and must resolve tenant identity from the public
tenant key or host.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/tenant?tenant=<publicKey>` | Public tenant branding and booking UI policy. |
| `GET /api/availability?date=YYYY-MM-DD&tenant=<publicKey>` | Public availability for one day. |
| `GET /api/availability?month=YYYY-MM&tenant=<publicKey>` | Public availability summary for a month. |
| `POST /api/reservations?tenant=<publicKey>` | Public reservation creation. |
| `POST /api/reservations/lookup?tenant=<publicKey>` | Guest lookup by contact and reference. |
| `PATCH /api/reservations/lookup?tenant=<publicKey>` | Guest self-service modification. |
| `DELETE /api/reservations/lookup?tenant=<publicKey>` | Guest self-service cancellation. |

Public responses expose only booking-safe information. They must not expose raw
database reservation ids, private settings, SMTP configuration, internal logs,
or cross-tenant data.

Guest-facing reservation references use the external reference generated from
the reservation id. Marketing sites should treat that reference as the only
guest-visible reservation identifier.

## Public Tenant Policy

Marketing websites should read public booking policy instead of hardcoding it.
The public tenant response includes:

```json
{
  "reservationPolicy": {
    "maxPartySize": 20
  }
}
```

This value comes from the tenant reservation policy. It must not be inferred
from slot capacity or remaining covers. Slot capacity answers "how many covers
could fit at this time"; max party size answers "how large one online booking is
allowed to be."

## Public Booking Protection

Public booking endpoints include anti-abuse controls:

- Request body size limits.
- Honeypot field checks.
- Submit timing checks.
- Silent fake success for likely bots.
- Fixed-window rate limits by IP, email, and phone.
- Maximum active reservations per contact.
- Availability revalidation at write time.

Marketing integrations should pass normal user-submitted data and should not try
to bypass these controls. If a marketing site gets unexpected fake success or a
rejection, inspect body fields, submit timing, tenant key, CORS origin, and rate
limit behavior.

## CORS

CORS is configured per tenant. Public endpoints echo only allowed origins from
the tenant settings. A marketing website must be listed in the tenant's allowed
origins before cross-origin browser calls will work.

Correct CORS behavior protects one restaurant from another restaurant's website
and prevents arbitrary websites from using the booking API with a user's
browser context.

## Tenant Admin Endpoints

Tenant admin endpoints are used by `/admin/<slug>`. The slug is useful for
routing and branding, but it is not security authority. Access comes from the
staff session cookie and `requireAdmin(req)`.

Major endpoint groups include:

- `/api/admin/reservations`
- `/api/admin/reservations/[id]`
- `/api/admin/reservations/[id]/table`
- `/api/admin/reservations/[id]/feedback`
- `/api/admin/reservations/[id]/emails`
- `/api/admin/availability`
- `/api/admin/config`
- `/api/admin/tables`
- `/api/admin/waitlist`
- `/api/admin/customers`
- `/api/admin/analytics`
- `/api/admin/events`
- `/api/admin/today-booking-controls`
- `/api/admin/settings/password`

Cookie-authenticated admin mutations must pass the same-origin CSRF check in the
tenant context layer. A failed check should produce a 403 and should be visible
in platform logs with enough request metadata to diagnose the problem.

## Platform Endpoints

Platform endpoints are used by `/platform` and require `requirePlatform(req)`,
except login/logout and explicitly public system endpoints.

Major endpoint groups include:

- `/api/platform/tenants`
- `/api/platform/tenants/[id]`
- `/api/platform/tenants/[id]/domains`
- `/api/platform/tenants/[id]/password`
- `/api/platform/tenants/[id]/mock`
- `/api/platform/tenants/[id]/impersonation`
- `/api/platform/logs`
- `/api/platform/email-logs`
- `/api/platform/analytics`
- `/api/platform/cron/dish-sync`
- `/api/platform/cron/feedback-requests`
- `/api/platform/cron/smtp-health`
- `/api/platform/bounces`

Schedule `/api/platform/cron/dish-sync` every 15 minutes with
`Authorization: Bearer $CRON_SECRET`. It syncs enabled DISH tenants for today
and tomorrow, keeping external bookings reflected in staff UI and public
availability without running historical backfills automatically.

Schedule `/api/platform/cron/smtp-health` every 6 hours with
`Authorization: Bearer $CRON_SECRET`. Operators can still trigger SMTP checks
manually from the platform console when investigating a restaurant.

Sensitive platform mutations require operator password re-authentication. This
pattern applies to destructive actions and privileged support actions such as
tenant deletion, staff password reset, and impersonation.

## External Integration Endpoints

External reservation integrations import data into a single tenant and must
never become cross-tenant data channels.

TheFork webhook URLs are tenant-specific:

```text
POST /api/integrations/thefork/webhook/<tenantId>
Authorization: Bearer <tenant-specific-token>
```

The handler verifies the tenant id from the path, the tenant-specific webhook
token, and the TheFork Restaurant UUID in the payload or follow-up API data.
Webhook payloads with the wrong tenant, token, restaurant identifier, method, or
unsupported event type are rejected or ignored and logged as `external_sync`
events.

DISH has no public incoming webhook. It is pulled by platform-controlled manual
actions and the `dish-sync` cron. DISH credentials are tenant-scoped, tested
before enabling, encrypted at rest, and never returned to the browser.

## Sanitization And Redaction

Tenant settings and availability config must be sanitized before persistence.
Sanitization preserves explicit `false` values so partial updates do not
accidentally re-enable disabled features.

Responses that include settings must redact secrets. SMTP passwords should never
be returned to the browser once saved. Platform UI can show whether a secret is
configured, but not the secret itself.

## Impersonation Security

Platform impersonation is a support feature. It opens the tenant admin in a new
tab and allows an operator to inspect or support tenant operations.

Rules:

- Only platform operators can start impersonation.
- Operator password re-authentication is required.
- Disabled tenants cannot be impersonated.
- Tenant staff do not need to see impersonation state.
- Non-read mutations performed during impersonation are logged for platform
  auditability.

Impersonation must not become a shortcut around tenant isolation. It should use
the normal tenant admin paths with explicit platform-issued impersonation state.

## Practical Debugging Checklist

For a public API issue:

- Confirm the tenant public key.
- Confirm the marketing origin is allowed.
- Confirm the endpoint includes required query parameters.
- Check availability and policy separately.
- Check platform logs for non-200 responses.

For a tenant admin issue:

- Confirm the staff session is valid.
- Confirm the request origin matches same-origin CSRF expectations.
- Confirm the affected reservation/table/customer belongs to the session tenant.
- Check whether the reservation status blocks the requested action.

For a platform issue:

- Confirm platform session validity.
- Confirm whether re-authentication is required.
- Check sanitized payload shape.
- Check platform logs metadata, including captured body metadata where present.
