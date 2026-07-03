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
