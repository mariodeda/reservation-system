# Platform Tenant Management

## Tenant List

The platform home shows restaurant cards. Each card summarizes:

- Restaurant name and slug.
- Status.
- Last booking.
- SMTP health state.
- Booking confirmation email state.
- Review request email state.

Email feature state is derived from real policy and template readiness. A flow
should be shown as active only when the tenant-wide email switch, the specific
event switch, SMTP readiness, and required template/review configuration are all
ready.

## Tenant Detail

Tenant detail is the canonical platform page for operator-only controls.

Typical sections:

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
- Disable/delete controls.

## Public Key And Marketing Sites

Marketing sites should call public APIs with:

```text
?tenant=<publicKey>
```

For public booking UI policy, marketing clients should read:

```json
{
  "reservationPolicy": {
    "maxPartySize": 20
  }
}
```

The max party size comes from the tenant reservation policy, not slot capacity.

## Impersonation

Platform operators can impersonate a tenant from the tenant detail page. The
button opens the tenant admin in a new tab. Impersonation requires operator
password re-authentication and is blocked for disabled restaurants.

Tenant staff do not need to see impersonation state. Platform logs still record
non-read mutations performed during impersonation.

