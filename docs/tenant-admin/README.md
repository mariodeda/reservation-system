# Tenant Admin Guide

Tenant admin lives at `/admin/<slug>`. It is the restaurant staff workspace for
daily service: checking bookings, seating guests, assigning tables, stopping
online bookings when needed, managing waitlist entries, and reviewing customers
and statistics.

The tenant slug in the URL is used for routing and branding. It is not the
security authority. The logged-in staff session decides which restaurant data is
available.

## Main Areas

| Area | What Staff Do There |
| --- | --- |
| Dashboard | See today's reservations and fast operational actions. |
| Reservations | Manage calendar, slots, bookings, table assignment, floor/day modal, waitlist modal, and review request actions. |
| Tables | Maintain dining-room capacity and table metadata. |
| Availability | Configure weekly hours, services, durations, closed days, blocked slots, lead time, booking window, and party-size policy. |
| Clients & Statistics | Search customers and review performance analytics. |
| Settings | Manage tenant-local preferences and staff password changes. |

Clicking the tenant logo returns staff to the dashboard. Header navigation keeps
operational pages close together so staff can move quickly during service.

## Daily Workflow

Before service:

1. Open the dashboard and review today's reservations.
2. Open reservations for the service date.
3. Check slot cards for capacity pressure and unavailable reasons.
4. Check waitlist entries.
5. Confirm any special blocks, closed periods, or stopped services.

During service:

1. Seat arriving guests and assign tables.
2. Add walk-ins or phone bookings from the reservation modal.
3. Use the floor/day modal when staff need the whole-day seating view.
4. Stop online bookings for a service if the restaurant can no longer accept
   more guests today.
5. Watch notifications for new online bookings.

After service:

1. Mark attended reservations as completed.
2. Mark no-shows accurately.
3. Send review request emails for completed bookings when appropriate.
4. Review analytics and customer notes if needed.

## What Staff Can And Cannot Change

Staff can change operational configuration:

- Availability hours.
- Service durations.
- Lead time and booking window.
- Party-size policy.
- Tables and table metadata.
- Blocked slots and closed days.
- Reservation status and table assignment.

Staff cannot change platform-only configuration:

- SMTP credentials.
- Global email event policy.
- Public tenant key.
- Allowed origins.
- Domains.
- Platform logs.
- Platform-wide email logs.

If an email feature, domain, or public website integration needs to change,
contact a platform administrator.

## Reservation Status Basics

Common statuses:

- Confirmed: active booking expected to arrive.
- Seated: guest has arrived and is occupying a table.
- Completed: visit is finished.
- Cancelled: booking was cancelled.
- No-show: guest did not attend.

Seated and completed reservations cannot be edited or deleted. This protects
operational history and prevents accidental changes after the restaurant has
already acted on the booking.

## Common Staff Questions

### Why can I not edit this reservation?

The reservation may already be seated or completed. At that point, use status
and notes rather than editing core booking details.

### Why does a time slot say unavailable?

The slot card should show the reason. Common reasons include booking cutoff
passed, service stopped today, blocked time, service ended, fully booked, or not
enough remaining covers for the requested party.

### Why does a guest email show a warning?

The system may know that the email address is unreachable from SMTP rejection or
bounce processing. Staff should call the guest when the card shows this warning.

### Why did "Mark all read" not remove historical reservations?

Notifications are alerts, not reservations. Marking notifications as read should
clear unread notification indicators and popup emphasis, but it does not delete
reservations from the reservation list.
