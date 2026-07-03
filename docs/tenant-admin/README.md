# Staff Admin Manual

This manual is for restaurant staff administrators using `/admin/<slug>`.
It explains every tenant-side feature in practical language: what each screen is
for, how staff should use it during service, what each action changes, and what
to check when something looks wrong.

The tenant admin is the restaurant workspace. It is not a platform configuration
area. Staff manage daily operations: reservations, guests, seating, tables,
availability, waitlist, customers, notifications, and local settings. Platform
administrators manage sensitive items such as SMTP, public tenant keys, allowed
origins, domains, platform logs, and global email policy.

## Manual Sections

- [Dashboard And Navigation](./dashboard-and-navigation.md)
- [Reservations](./reservations.md)
- [Reservation Lifecycle And Actions](./reservation-lifecycle.md)
- [Availability And Tables](./availability-and-tables.md)
- [Tables And Floor Operations](./tables-and-floor.md)
- [Customers, Analytics, And Settings](./customers-analytics-settings.md)
- [Notifications And Email](./notifications-and-email.md)
- [Operational Playbooks](./operational-playbooks.md)
- [Staff FAQ](./faq.md)

## Who Should Read This

| Role | Recommended Sections |
| --- | --- |
| Host or front-desk staff | Dashboard, Reservations, Reservation Lifecycle, Notifications, Playbooks. |
| Floor manager | Reservations, Tables And Floor Operations, Availability, Playbooks. |
| General manager | All sections, especially Availability, Customers, Analytics, Settings, and FAQ. |
| New staff admin | Start here, then read Dashboard, Reservations, and Playbooks before service. |

## Core Mental Model

The system separates four ideas that are easy to confuse:

| Concept | Meaning |
| --- | --- |
| Reservation | A guest booking with date, time, service, party size, contact details, status, notes, and optional table assignment. |
| Availability | The rules that decide what times can be booked online or by staff. |
| Table capacity | The physical seats available from active tables for an offering. |
| Reservation policy | Rules such as minimum and maximum party size for one booking. |

Example: a restaurant may have 180 physical seats available at 19:00 but still
allow only 20 guests in a single online booking. The first number is capacity.
The second number is booking policy.

## Daily Operating Rhythm

### Before Service

1. Open the dashboard and review today's bookings.
2. Open the reservations page for the correct date and offering.
3. Check service and slot cards for capacity pressure.
4. Check unavailable slot reasons, stopped services, blocked slots, and closed
   periods.
5. Open the waitlist modal if the restaurant expects high demand.
6. Confirm table assignments for large parties and special notes.
7. If the restaurant is already full or short-staffed, use the quick action to
   stop today's remaining online bookings for the affected service.

### During Service

1. Watch new booking notifications.
2. Seat arriving guests and assign tables.
3. Add phone bookings and walk-ins from the reservation modal.
4. Use the floor/day calendar modal to understand table flow.
5. Keep statuses current: confirmed, seated, completed, cancelled, or no-show.
6. Follow up by phone when a reservation warns that the guest email is not
   reachable.

### After Service

1. Mark attended reservations as completed.
2. Mark no-shows accurately.
3. Send review request emails only for completed reservations when appropriate.
4. Review customer notes and analytics if the manager needs a service recap.
5. Record any configuration issues to fix before the next service.

## What Staff Can Change

Staff can manage operational data:

- Reservations and reservation status.
- Table assignment.
- Walk-ins and phone bookings.
- Waitlist entries.
- Availability hours.
- Service durations.
- Closed days and blocked slots.
- Lead time and booking window.
- Party-size policy.
- Tables and table metadata.
- Customer records and local notes.
- Staff password from tenant settings.

## What Staff Cannot Change

Staff cannot manage platform-sensitive configuration:

- SMTP credentials.
- Global outbound email policy.
- Booking confirmation template policy.
- Review request template policy.
- Public tenant key.
- Allowed origins for marketing sites.
- Domains.
- Platform logs.
- Platform-wide email logs.

If one of these needs to change, ask a platform administrator.

## Important Rules Staff Should Remember

- The logged-in session decides tenant access. Changing the URL slug does not
  grant access to another restaurant.
- Seated and completed reservations cannot be edited or deleted.
- Completed reservations collapse to a minimal view so active service work stays
  visible.
- Staff-created reservations may be allowed for operational exceptions, but
  table conflicts and status rules still matter.
- Slot covers can count the same reservation in multiple nearby slots when the
  table duration overlaps those slots. This is expected.
- Notifications are alerts. Marking notifications read does not delete
  reservations.
- Email warnings mean staff should call the guest.
- Review request emails are only available after a reservation is completed.

## Quick Glossary

| Term | Meaning |
| --- | --- |
| Offering | A bookable area or channel, such as main dining, patio, or bar. |
| Service | A time window inside an offering, such as lunch or dinner. |
| Slot | A bookable time generated inside a service. |
| Cover | One guest seat in a reservation. |
| Lead time | Minimum time before a slot when guests can still book online. |
| Booking window | How far into the future guests can book. |
| Table duration | How long a reservation occupies table capacity. |
| Waitlist | Parties waiting for capacity when a booking cannot be accepted yet. |
| No-show | A guest who did not attend. |
| Review request | A post-visit email asking the guest to leave an external review. |

## When To Ask Platform Support

Ask platform support when:

- Booking confirmations or review emails fail for many guests.
- SMTP or email warnings appear broadly.
- The public website cannot load availability.
- Staff cannot save settings because of repeated 403 or server errors.
- Notifications do not update after refresh.
- A tenant appears to see data from another restaurant.
- A domain, public key, allowed origin, or SMTP setting must change.
