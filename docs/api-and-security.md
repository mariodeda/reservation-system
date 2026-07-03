# API And Security Model

## Public Endpoints

Public endpoints are CORS-gated per tenant and must use tenant resolution via
`requireTenant(req)` or public tenant resolution helpers.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/tenant?tenant=<publicKey>` | Public tenant branding and booking UI policy. |
| `GET /api/availability?date=YYYY-MM-DD&tenant=<publicKey>` | Public day availability. |
| `GET /api/availability?month=YYYY-MM&tenant=<publicKey>` | Public month availability. |
| `POST /api/reservations?tenant=<publicKey>` | Public reservation creation. |
| `POST /api/reservations/lookup?tenant=<publicKey>` | Guest lookup by contact/reference. |
| `PATCH /api/reservations/lookup?tenant=<publicKey>` | Guest self-service modification. |
| `DELETE /api/reservations/lookup?tenant=<publicKey>` | Guest self-service cancellation. |

Public responses expose only booking-safe data. Raw reservation ids are never
returned to guests; guest-facing references use `referenceOf(id)`.

## Tenant Admin Endpoints

Tenant admin endpoints use `requireAdmin(req)`. The session tenant id is the
authority. The URL slug is only UI routing and branding.

Major groups:

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

Cookie-authenticated admin mutations must pass same-origin CSRF checks in the
tenant context layer.

## Platform Endpoints

Platform endpoints use `requirePlatform(req)` unless they are login/logout or
system webhook endpoints.

Major groups:

- `/api/platform/tenants`
- `/api/platform/tenants/[id]`
- `/api/platform/tenants/[id]/domains`
- `/api/platform/tenants/[id]/password`
- `/api/platform/tenants/[id]/mock`
- `/api/platform/tenants/[id]/impersonation`
- `/api/platform/logs`
- `/api/platform/email-logs`
- `/api/platform/analytics`
- `/api/platform/cron/smtp-health`
- `/api/platform/bounces`

Sensitive mutations such as tenant deletion, staff password reset, and
impersonation require operator password re-authentication.

## Anti-Abuse Controls

Public booking and lookup endpoints include:

- Request body size limits.
- Honeypot field checks.
- Submit timing checks.
- Silent fake success for likely bots.
- MySQL-backed fixed-window rate limits by IP, email, and phone.
- Maximum active reservations per contact.

Do not bypass these controls in marketing integrations.

## CORS

CORS is tenant-specific. Public endpoints echo only origins configured in the
tenant's allowed origins. Marketing websites must be added to the tenant's
allowed origins before cross-origin browser calls will succeed.

