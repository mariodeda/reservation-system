# Tenant Customers, Analytics, And Settings

The tenant header groups Customers and Analytics under `Clients & Statistics`.
This keeps operational navigation compact while still giving staff access to
guest history and performance reporting.

## Clients & Statistics Navigation

Desktop uses a dropdown. Mobile uses a compact selector. The dropdown should
close when staff click outside it so it does not cover reservation work.

Use:

- Customers when you need guest contact details or reservation history.
- Analytics when you need performance summaries and trends.

## Customers

The customers page supports searching guest records by:

- Name.
- Email.
- Phone.

Customer detail can show reservation history, upcoming visits, contact details,
and useful operational notes. Staff can use this to recognize returning guests,
verify contact information, and follow up when email delivery fails.

When a guest email is known to be unreachable, staff should prefer phone follow
up and correct the email address when the guest provides a better one.

## Analytics

Analytics summarize restaurant performance over a selected period. Typical
metrics include:

- Reservations.
- Covers.
- Guests.
- Service breakdowns.
- Lead-time indicators.
- No-show indicators.
- Customer trends.

Use analytics to answer operational questions:

- Which services are busiest?
- Are certain days under-booked?
- Are no-shows increasing?
- Do guests book far enough in advance?
- Is table capacity aligned with demand?

Analytics are only as useful as reservation status accuracy. Staff should mark
completed, cancelled, and no-show reservations consistently.

## Settings

Tenant settings are for restaurant-local preferences and staff password changes.
Platform-only controls are intentionally not exposed to tenant staff.

Tenant staff can expect settings for operational preferences, but not:

- SMTP credentials.
- Public tenant key.
- Allowed origins.
- Domains.
- Email flow policy.
- Platform logs.
- Platform email logs.

Password changes are disabled during platform impersonation. If a staff password
must be reset, a platform administrator should use the platform tenant detail
page.

## Good Data Practices

- Keep phone numbers and emails accurate.
- Use notes for service-relevant details, not sensitive unrelated information.
- Update statuses promptly after service.
- Avoid duplicate customer records when possible by using consistent contact
  information.

Better data improves notifications, guest follow-up, analytics, and email
delivery troubleshooting.
