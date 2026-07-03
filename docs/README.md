# Reservation System Documentation

This documentation describes the live reservation service, its operator
surfaces, and the public API contracts used by external restaurant websites.

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

- Public booking API: consumed by marketing websites with
  `?tenant=<publicKey>`.
- Tenant admin: `/admin/<slug>`, used by restaurant staff.
- Platform admin: `/platform`, used by platform operators.

The platform and tenant admin surfaces are intentionally separate. Platform
operators own tenant provisioning, domains, public keys, SMTP, outbound email
policy, logs, and impersonation. Tenant staff own day-to-day reservations,
tables, waitlist, availability, customers, analytics, and tenant-local settings.

