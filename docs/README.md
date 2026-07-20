# Reservation System Documentation

This documentation explains how the reservation system is operated day to day.
It is written for two audiences:

- Platform administrators who create and support restaurants.
- Restaurant staff who manage reservations, tables, availability, customers,
  notifications, and daily service.

The system is intentionally split into platform-level controls and tenant-level
controls. Platform administrators manage sensitive configuration such as
domains, public keys, SMTP, email policy, logs, and impersonation. Restaurant
staff manage operational work: reservations, guests, seating, waitlist,
availability, tables, and local settings.

## Documentation Tree

- [System Overview](./system-overview.md)
- [API And Security Model](./api-and-security.md)
- [Platform Admin Guide](./platform-admin/README.md)
  - [Tenant Management](./platform-admin/tenant-management.md)
  - [Email Operations](./platform-admin/email-operations.md)
  - [Logs And Monitoring](./platform-admin/logs-and-monitoring.md)
- [Tenant Admin Guide](./tenant-admin/README.md)
  - [Reservations](./tenant-admin/reservations.md)
  - [Availability And Tables](./tenant-admin/availability-and-tables.md)
  - [Customers, Analytics, And Settings](./tenant-admin/customers-analytics-settings.md)
  - [Notifications And Email](./tenant-admin/notifications-and-email.md)

## Product Surfaces

The product has three main surfaces.

| Surface | URL | Used By | Main Purpose |
| --- | --- | --- | --- |
| Public booking API | `/api/*` with `?tenant=<publicKey>` | External restaurant websites | Availability lookup, booking creation, guest lookup, guest changes. |
| Tenant admin | `/admin/<slug>` | Restaurant staff | Day-to-day reservation and service management. |
| Platform admin | `/platform` | Platform operators | Tenant setup, sensitive configuration, support, logs, and monitoring. |

The public marketing websites are separate applications. They should not
hardcode restaurant policy such as maximum party size. They should read
public-safe policy from the public tenant endpoint.

## First-Day Orientation

If you are a new platform administrator, start with:

1. Read [System Overview](./system-overview.md) to understand tenants,
   offerings, services, tables, availability, and email.
2. Read [Tenant Management](./platform-admin/tenant-management.md) before
   creating or modifying a restaurant.
3. Read [Email Operations](./platform-admin/email-operations.md) before enabling
   booking confirmation or review request email.
4. Use [Logs And Monitoring](./platform-admin/logs-and-monitoring.md) when a
   tenant reports failed saves, 403 responses, missing emails, or SMTP issues.

If you are a new restaurant staff administrator, start with:

1. Read [Tenant Admin Guide](./tenant-admin/README.md) for the daily workflow.
2. Read [Reservations](./tenant-admin/reservations.md) before handling live
   service.
3. Read [Availability And Tables](./tenant-admin/availability-and-tables.md)
   before changing hours, durations, party-size limits, or table layout.
4. Read [Notifications And Email](./tenant-admin/notifications-and-email.md) so
   you know what alerts mean and when staff should call a guest.

## Responsibility Boundaries

Platform administrators should handle:

- Creating, disabling, and deleting restaurants.
- Public tenant keys and marketing-site origins.
- Domains and routing.
- SMTP credentials and sender identity.
- Email feature switches and templates.
- Review URLs.
- Platform logs and email logs.
- Impersonation for support.
- Staff password resets.

Restaurant staff should handle:

- Today's reservations and seating.
- Manual reservations, walk-ins, and waitlist entries.
- Table assignment.
- Guest status changes such as seated, completed, cancelled, or no-show.
- Daily booking stop controls.
- Availability, service duration, closed days, and blocked slots.
- Customer lookup and analytics.
- Local password changes.

This boundary matters for security. A tenant staff user should never be able to
change SMTP credentials, public keys, allowed origins, or another tenant's data.

## Common Support Questions

### Why can the marketing site not book a party size that fits in the room?

Availability has two different concepts:

- Table capacity: how many seats can physically be booked in a slot.
- Reservation policy: the maximum party size allowed for one online booking.

A restaurant may have 180 seats available but still limit online bookings to 20
guests per reservation. Marketing sites should display the public
`reservationPolicy.maxPartySize` value, not infer it from slot capacity.

### Why does a slot show seats but still reject a booking?

A slot can be unavailable for reasons other than raw seats:

- The booking cutoff passed.
- The service was manually stopped for today.
- The time is blocked.
- The restaurant is closed on that date.
- The party size is outside policy.
- Existing reservations overlap the slot for the effective table duration.
- No safe table or joined-table assignment is possible.

### Why did an email not send?

Check platform email logs first. A skipped email is not always an error. Common
causes are missing SMTP configuration, disabled email event, missing recipient,
missing review URL, or a reservation that is not eligible for review email.

### Why did the platform show a 403?

403 usually means authentication or same-origin CSRF validation failed. Check
the route, current session, cookies, request origin, and platform logs metadata.
For platform mutations, also check whether the operation requires operator
password re-authentication.
