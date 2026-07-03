# Platform Logs And Monitoring

Platform logs are the first place to look when something fails in production.
They are designed for operator support: enough context to understand what
happened, without exposing secrets.

## Route Logs

The platform logs page shows platform-visible application events. Route
observability records:

- Non-200 responses.
- Thrown route handlers.
- Impersonation mutations.
- Request method and path.
- Request id.
- Tenant or reservation identifiers where available.
- Request metadata, including body metadata where available.

Filters support searching by route, reason, request id, reservation id, and
reference. Use these filters before scanning manually.

## Metadata

Metadata is especially important for failed saves. It can show the sanitized
shape of the incoming request body, query parameters, status code, and failure
reason. This helps diagnose issues such as:

- 403 from missing or invalid session.
- 403 from same-origin CSRF failure.
- 400 from invalid payload shape.
- 404 from tenant or reservation mismatch.
- 409 from conflict or state rules.
- 500 from unexpected server errors.

Body metadata should be visible in the platform admin metadata section when it
is available. Secrets must still be redacted.

## Email Logs

The email logs page is platform-only. Tenants do not have access to the
platform-wide email log page.

Operators can filter by:

- Tenant.
- Email type.
- Status.
- Recipient or search text.
- Date range.

Statuses include sent, failed, and skipped. Read skipped reasons carefully:
skipped is often expected when policy says not to send.

## SMTP Monitoring

SMTP health is tenant-specific. It is displayed on restaurant cards and can be
refreshed manually by a platform operator. Scheduled SMTP checks should continue
independently from manual checks.

Use SMTP health to identify configuration or connectivity issues. Use email
logs to understand individual send attempts.

## Bounce Processing

The bounce webhook records downstream delivery failures when an email provider
or mailbox pipeline reports a bounce. SMTP recipient rejection catches some bad
addresses immediately, but bounce processing is needed for delayed failures.

When bounce data marks an email as unreachable, tenant staff should see a clear
reservation warning so they can call the guest.

## Global Health

The global health endpoint reports system-level status such as database
connectivity. It does not replace tenant-specific SMTP health checks and does
not prove that public booking logic is correct.

## Practical Investigation Flow

For failed platform saves:

1. Reproduce or ask for the exact time and route.
2. Open platform logs and filter by route or request id.
3. Check status code and reason.
4. Inspect metadata, including captured body shape.
5. Confirm whether re-authentication or CSRF rules applied.
6. Fix the underlying configuration or payload issue.

For missing emails:

1. Open email logs.
2. Filter by tenant and recipient.
3. Check status and reason.
4. Compare SMTP health and event policy.
5. Check bounce records for delayed failures.

For suspected cross-tenant access:

1. Confirm the request surface: public, tenant admin, or platform.
2. Confirm which tenant id was used by the session or public key.
3. Confirm store access was tenant-scoped.
4. Escalate if any shared-table query lacks tenant filtering.
