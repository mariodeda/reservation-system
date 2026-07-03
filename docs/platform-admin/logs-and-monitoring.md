# Platform Logs And Monitoring

## Route Logs

The platform logs page shows platform-visible application events. Route
observability records:

- Non-200 responses.
- Thrown route handlers.
- Impersonation mutations.
- Request metadata, including body metadata where available.

Filters support searching by route, reason, request id, reservation id, and
reference.

## Email Logs

The email logs page is platform-only. Tenants do not have access to the
platform-wide email log page.

Operators can filter by:

- Tenant.
- Email type.
- Status.
- Recipient/search text.
- Date range.

Statuses include sent, failed, and skipped.

## Bounce Processing

The bounce webhook records downstream delivery failures when an email provider
or mailbox pipeline reports a bounce. SMTP recipient rejection catches some bad
addresses immediately, but bounce processing is needed for delayed failures.

## Health Checks

The health endpoint reports database status. SMTP health is tenant-specific and
reported through SMTP health checks rather than the global health endpoint.

