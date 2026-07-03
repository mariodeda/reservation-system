# Tenant Reservations

The reservations page is the main operational screen for restaurant staff. It is
where staff watch availability, add bookings, assign tables, update statuses,
manage the waitlist, and handle service-day exceptions.

## Page Layout

The page includes:

- Date selector.
- Offering selector when multiple offerings exist.
- Service and slot availability cards.
- Reservation list.
- New reservation modal.
- Floor/day calendar modal.
- Waitlist modal.

Use the date and offering controls first. Most other information on the page is
computed from that selection.

## Service And Slot Cards

Slot cards show the state of a specific bookable time. They are designed to help
staff quickly answer:

- Is this slot still bookable?
- How many covers are already reserved?
- How much pressure is on this service?
- Why is this slot unavailable?

Slot cards show booked covers compared with active table capacity. This is
reserved covers over total bookable covers for the slot, not the maximum size of
one reservation.

Unavailable reasons can include:

- Service stopped today.
- Time blocked.
- Booking cutoff passed.
- Not enough covers left.
- Fully booked.
- Service ended.
- Restaurant closed.

When a service is closed because the latest slot plus table duration has passed,
the availability icon is hidden and the covers recap is greyed out while still
remaining readable.

## How Covers Are Calculated

When active tables exist for an offering, their active seats drive slot
capacity. Existing active reservations are counted against slots they overlap.
Overlap is based on the effective table duration for that service and date.

Example: if dinner has a 90-minute duration, a 19:00 reservation affects later
slots that overlap that 90-minute window. This is why the same guest count can
appear in more than one slot's booked-cover calculation.

This is intentional. It prevents the restaurant from accepting too many covers
across overlapping table turns.

## Opening The New Reservation Modal

Staff can open the new reservation modal from actions on the page or by
clicking an available slot. When opened from a slot, the modal should prefill the
selected date, service, and time so staff can create the booking quickly.

The modal collects:

- Offering.
- Date.
- Service.
- Time.
- Guest count.
- Guest name.
- Phone.
- Email.
- Notes and allergies.

Inputs should have visible labels. Staff should never need to guess which field
they are editing during service.

## Staff-Created Reservations

Staff-created reservations may bypass some public booking restrictions so staff
can record real-world bookings, phone bookings, or operational exceptions.
However, the system still protects important rules:

- Table conflicts must be respected.
- Seated reservations cannot be modified or deleted.
- Completed reservations cannot be modified or deleted.
- Unsafe table assignment should be cleared when core booking details change.

## Reservation Actions

Actions can include:

- Table assignment.
- Edit reservation.
- Delete reservation.
- Send review email.

Actions are displayed inline with table selection where space allows. Buttons
should be clearly named so staff understand what each action does.

Seated or completed reservations cannot be modified or deleted. Completed
reservations collapse visually and show only the minimum operational details
until expanded:

```text
12:00
Guest name · 2 guests
Completed
```

This keeps completed visits from visually competing with active service work.

## Table Assignment

Table assignment lets staff assign a single table or a joined set of tables.
Joined tables are only valid when the table setup allows them.

The dropdown should remain readable in light and dark themes. Rows should be
vertically centered, and hover tooltips should explain the table information
being shown.

If a reservation's date, time, service, offering, guest count, or duration
changes, the existing table assignment may no longer be safe. In that case, the
system should revalidate conflicts and clear unsafe assignments.

## Floor/Day Calendar

The floor/day calendar opens as a modal. It displays the whole day so staff can
understand service flow at a glance.

The current-time sweep indicator is shown at the bottom so it does not overlap
reservation timing content. Restaurants may have continuous opening hours or
separate lunch and dinner windows, so the calendar must handle closed gaps
without pretending they are bookable time.

Use this modal when staff need a visual answer to questions like:

- Which tables are occupied later?
- Where are the turn overlaps?
- Is there a quiet gap between services?
- Can a larger booking be placed safely?

## Waitlist

The waitlist opens as a modal from the reservations page. Staff can add, update,
and seat waitlist entries.

Use the waitlist when demand exists but a booking cannot currently be accepted.
When capacity becomes available, staff can convert or manually create a
reservation from the waitlist context.

## Review Request Action

Staff can send a review request email only after a reservation is completed. If
the review request was already sent, the action is disabled and states that the
request was already sent.

If the action is unavailable, check:

- Reservation status.
- Whether a review email was already sent.
- Whether the guest has an email address.
- Whether platform email policy and review URL are configured.

## Troubleshooting The Reservations Page

If availability fails to load:

1. Confirm the selected date is valid.
2. Refresh the page and check whether the tenant session is still active.
3. Check whether availability configuration is valid.
4. Ask a platform administrator to check route logs for the availability API.

If covers look too high:

1. Confirm active table seats for the selected offering.
2. Confirm whether booked covers are appearing in multiple overlapping slots
   because of service duration.
3. Confirm the service duration and default duration values.
4. Check for active reservations in the same overlapping window.

If notifications duplicate:

1. Confirm whether multiple browser tabs are open.
2. Check whether the same reservation id is repeated.
3. Refresh one tab and verify unread state.
4. Report persistent duplicate reservation-created events to platform support.
