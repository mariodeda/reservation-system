# Platform Tenant Management

Tenant management is the platform administrator's main workspace for restaurant
setup, support, and sensitive configuration. It is the only place where
operators should manage public keys, domains, allowed origins, SMTP, email flow
policy, review URLs, staff password resets, impersonation, and destructive
tenant actions.

## Tenant List

The platform home shows restaurant cards. Each card summarizes:

- Restaurant name and slug.
- Active or disabled status.
- Last booking activity.
- SMTP health state.
- Booking confirmation email readiness.
- Review request email readiness.

Use the list as a monitoring surface. A restaurant with failed SMTP health or an
inactive email flow may still accept bookings, but guests may not receive
confirmation or review emails.

## Tenant Detail

Tenant detail is the canonical page for operator-only controls. Typical
sections include:

- Identity and status.
- Branding and public tenant key.
- Booking API allowed origins.
- Domains.
- SMTP settings.
- Email flow policy.
- Email templates.
- Review URL.
- TheFork one-way sync.
- DISH one-way sync.
- Mock data operations.
- Staff password reset.
- Impersonation.
- Disable and delete controls.

When editing tenant settings, remember that partial saves must preserve explicit
disabled states. If an email event is intentionally off, saving unrelated fields
should not turn it back on.

## Public Key And Marketing Sites

Marketing websites should call public APIs with:

```text
?tenant=<publicKey>
```

The public key is stable client configuration. If it changes, external websites
must be updated. Treat public key rotation as an integration change, not a
routine edit.

For public booking UI policy, marketing clients should read:

```json
{
  "reservationPolicy": {
    "maxPartySize": 20
  }
}
```

The max party size comes from the tenant reservation policy. It is not slot
capacity. A slot can have 30 or 180 available covers while the maximum online
party size remains 20.

## Allowed Origins

Allowed origins control which marketing sites can call public APIs from a
browser. Add exact origins such as:

```text
https://www.example-restaurant.com
https://example-restaurant.com
```

Avoid broad or unrelated origins. If a marketing site fails with CORS errors,
compare the browser's exact Origin header with the tenant's allowed origins.

## Domains

Domains are used for same-domain deployments and host fallback tenant
resolution. Public key resolution remains the preferred integration path for
marketing websites because it is explicit and stable.

When adding domains:

- Confirm the domain belongs to the restaurant.
- Avoid assigning the same domain to multiple tenants.
- Test both public and admin routing after changes.

## SMTP And Email Flow Summary

The platform card summary intentionally separates SMTP health from email flow
readiness:

- SMTP health means the app can connect to the tenant's SMTP server.
- Booking confirmation readiness means confirmation email can actually be sent.
- Review request readiness means review email can actually be sent.

Review request readiness also depends on a review URL and usable template
content. If the review URL is missing, the review flow should not appear active.

## External Reservation Integrations

External reservation integrations are configured per tenant from tenant detail.
They are one-way imports into our system: imported reservations appear in the
tenant reservation UI, count against our public availability APIs, and are
clearly labeled as external. Staff can assign a local table, but booking
details, status, guest contact data, and email actions remain controlled by the
external platform.

### TheFork

TheFork uses official B2B API credentials plus a tenant-specific webhook.

Required fields:

- Client ID.
- Client secret.
- Restaurant UUID.
- Enabled toggle.

The Restaurant UUID is required. Do not enable a group-only TheFork integration
for a tenant, because group-level data cannot strictly prove that each
reservation belongs to one restaurant tenant. The platform prevents enabling
the same TheFork Restaurant UUID on multiple tenants.

When saving TheFork credentials, the platform validates the API connection
before storing the integration as enabled. If validation fails, the previous
working configuration remains in place.

The webhook URL is generated per tenant:

```text
/api/integrations/thefork/webhook/<tenantId>
```

Configure TheFork to call that tenant-specific URL with:

```http
Authorization: Bearer <tenant-specific-token>
```

The webhook handler verifies the URL tenant id, the tenant-specific token, and
the TheFork restaurant UUID. A webhook sent to the wrong tenant URL or with a
restaurant mismatch is rejected and logged.

Manual actions:

- **Sync now** imports today's TheFork updates.
- **First sync** imports upcoming TheFork reservations through the tenant
  booking window and skips existing imports.

### DISH

DISH does not provide a public reservation API for this account. The DISH
integration is a read-only manager-page sync that depends on authenticated HTML
pages staying compatible.

Required fields:

- DISH email.
- DISH password.
- DISH establishment id, from the `est` query value in the DISH Reservation
  tool URL.
- Enabled toggle.

When saving DISH credentials, the platform tests the login before enabling the
integration. The password is stored encrypted and is never returned to the
browser. The establishment id scopes reservation-page requests to the exact
restaurant context shown by DISH. The platform prevents enabling the same DISH
login email on multiple tenants, because the HTML flow has no stronger stable
restaurant identifier.

Manual actions:

- **Sync now** imports today.
- **Sync last 60 days** imports the last 60 calendar days, including today, and
  skips existing imports. Use it for the initial import and for repair catch-up
  runs. The platform runs this in 7-day batches so the DISH manager pages and
  platform UI remain responsive.

Scheduled DISH sync runs through `POST /api/platform/cron/dish-sync` every 15
minutes. It syncs today and tomorrow for all active tenants with enabled DISH
integrations. It does not run historical backfills automatically.

### Operational Rules

External reservations must remain tenant-scoped at every layer:

- Integration credentials are stored per tenant.
- External reservation links are keyed by tenant id, provider, and external id.
- Imports write through the tenant-scoped reservation store.
- Public availability counts external covers for the same tenant only.
- Guest self-service lookup does not expose external reservations.
- Local booking confirmation and review email actions are disabled for external
  reservations.

Use platform logs to investigate sync behavior. Search for `external_sync`,
`thefork`, `dish`, or an external reservation id.

## Staff Password Reset

Staff password reset is sensitive because it grants access to tenant admin. It
requires platform operator re-authentication. Share new credentials through a
secure channel and encourage the restaurant to change the password after first
login when appropriate.

## Impersonation

Platform operators can impersonate a tenant from the tenant detail page. The
button opens tenant admin in a new tab. Impersonation requires operator password
re-authentication and is blocked for disabled restaurants.

Tenant staff do not need to see impersonation state. Platform logs still record
non-read mutations performed during impersonation.

Use impersonation for support tasks such as verifying what staff see, checking a
reservation workflow, or reproducing a tenant-side issue. Avoid making live
operational changes unless the restaurant requested it or the support case
requires it.

## Disable And Delete

Disabling a tenant should be used when the restaurant must stop operating but
data should remain available. Deleting is destructive and should be treated as a
last resort. Destructive actions require explicit confirmation and operator
password re-authentication.

Before disabling or deleting:

- Confirm the tenant identity.
- Confirm the impact on public booking websites.
- Check whether there are active bookings.
- Export or preserve any data required by the business process.
