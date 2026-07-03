# Reservations

The Reservations page is the main live-service workspace. Staff use it to review
availability, create bookings, manage waitlist entries, assign tables, update
reservation status, send review requests, and understand the day from both a
slot and floor perspective.

Use this page whenever you need more control than the dashboard provides.

## What The Page Is For

The Reservations page answers these questions:

- What date and offering am I managing?
- Which services are open?
- Which slots are bookable?
- How many covers are already reserved?
- Why is a slot unavailable?
- Which guests are expected?
- Which guests are seated or completed?
- Which tables are assigned?
- Is there a waitlist?
- Can we accept another booking?

## Page Areas

| Area | Purpose |
| --- | --- |
| Date selector | Chooses the service date. |
| Offering selector | Chooses the bookable area or channel when the restaurant has more than one. |
| Service cards | Summarize service-level slot status and capacity pressure. |
| Slot cards | Show availability for each bookable time. |
| Reservation list | Shows bookings for the selected date and offering. |
| New reservation modal | Adds staff, phone, or walk-in bookings. |
| Floor/day modal | Shows the whole day visually across tables. |
| Waitlist modal | Manages parties waiting for a possible opening. |

Most information depends on the selected date and offering. If the page looks
wrong, confirm those two controls first.

## Date Selector

Use the date selector to move between days. Staff commonly use it to:

- Prepare for tomorrow.
- Review a future large party.
- Check a past reservation.
- Add a booking for a future date.

If availability cannot load for a date, refresh once, then check whether the
date has special rules, closed days, or recently edited availability.

## Offering Selector

Some restaurants have multiple offerings, such as:

- Main dining.
- Patio.
- Bar.
- Private room.

If an offering selector appears, choose the correct area before reading slot
capacity or assigning tables. Tables can be bound to specific offerings, so a
patio table may not be available when viewing main dining.

## Service Cards

Service cards summarize each service on the selected date. A service is a block
of time such as lunch or dinner.

The service card helps staff understand:

- Service name.
- Service hours.
- Slot interval.
- Reserved covers versus total active table capacity.
- Capacity pressure.
- Whether the service is closed, stopped, or still bookable.

Capacity indicators should be read as operational pressure, not as a guarantee
that every possible party can be accepted. A slot can still be unavailable for a
specific party size, cutoff, block, or table conflict.

## Slot Cards

Slot cards represent individual bookable times. They should show:

- Time.
- Booked covers.
- Total slot capacity.
- Availability state.
- Specific unavailable reason when not bookable.

Clicking a bookable slot should open the new reservation modal with date,
service, offering, and time prefilled.

## Unavailable Slot Reasons

When a slot is not available, staff should see why. Common reasons:

| Reason | Meaning | Staff Response |
| --- | --- | --- |
| Service stopped today | Staff manually stopped online bookings for this service. | Existing bookings remain valid. Reopen only if operationally safe. |
| Time blocked | A manager blocked that time. | Check blocked-slot setup or manager notes. |
| Booking cutoff passed | Lead time no longer allows new online booking. | Staff may still decide whether a manual booking is possible. |
| Not enough covers left | The slot cannot fit the requested party size. | Try another time, smaller party, or manual manager override if appropriate. |
| Fully booked | No meaningful capacity remains. | Use waitlist or another service time. |
| Service ended | The service is past its latest slot plus duration. | Do not accept new bookings for that service unless manually approved. |
| Restaurant closed | The date is closed or outside schedule. | Check closed days and special dates. |

## Covers Explained

Slot covers show reserved covers over total available table capacity for that
slot. Example:

```text
24 / 80 covers
```

This means 24 guest seats are already reserved against 80 active table seats for
that slot. It does not mean the restaurant accepts a single party of 80.

Maximum party size is a separate booking policy. Staff should not confuse total
capacity with the largest allowed booking.

## Why Covers Can Appear In Multiple Slots

Reservations occupy capacity for their effective table duration. If dinner has a
90-minute duration, a 19:00 booking can affect 19:00, 19:30, and 20:00 slot
pressure depending on the slot interval.

This is expected and prevents overbooking across turns. It may look like covers
are counted more than once, but they are being counted in each overlapping time
window where the table is still occupied.

## New Reservation Modal

Use the new reservation modal for:

- Phone bookings.
- Walk-ins.
- Staff-entered bookings.
- Operational exceptions.
- Bookings created from a selected slot.

Required information typically includes:

- Date.
- Offering.
- Service.
- Time.
- Party size.
- Guest name.
- Phone or email.

Optional but useful information:

- Allergies.
- Seating preference.
- High chair or accessibility needs.
- Special occasion.
- Internal notes.

Every input should have a visible label. If staff cannot tell what a field means,
that is a usability issue to report.

## Staff Booking Versus Public Booking

Staff bookings may allow operational exceptions that public guests cannot make
online. This is useful for real restaurant work, but staff should still respect:

- Physical table capacity.
- Table conflicts.
- Service hours.
- Guest contact quality.
- Seated/completed edit locks.
- Restaurant manager policy.

Do not use staff booking to routinely bypass rules that protect the restaurant
from overbooking.

## Reservation List

The reservation list shows bookings for the selected date and offering. Staff
should scan for:

- Arrival time.
- Guest name.
- Party size.
- Status.
- Source, such as online or staff.
- Table assignment.
- Notes or allergies.
- Email warnings.
- Available actions.

During service, keep statuses up to date so the list remains useful for the next
staff member.

## Floor/Day Calendar Modal

Open the floor/day modal when the list is not enough. It is useful for visual
questions:

- Which tables are occupied now?
- Which tables turn soon?
- Where are overlaps?
- Can a large party fit later?
- Is there a gap between lunch and dinner?

The modal shows the whole day. The current-time sweep line is placed at the
bottom to avoid covering reservation time labels. Closed periods should remain
visually understandable, especially for restaurants with separate lunch and
dinner services.

## Waitlist Modal

Use the waitlist when demand exists but a confirmed booking cannot currently be
accepted.

Good waitlist entries include:

- Guest name.
- Party size.
- Phone number.
- Desired time or time range.
- Notes about flexibility.
- Any urgency or special needs.

When capacity opens, staff can contact the guest and create or update a
reservation according to the restaurant's process.

## Reservation Actions

Common actions include:

- Assign table.
- Edit reservation.
- Delete reservation.
- Send review email.
- Update status.

Actions should be clear and named. If an action is disabled, check the
reservation status and eligibility before assuming the UI is broken.

## Seated And Completed Locking

Once a reservation is seated or completed:

- Edit is disabled.
- Delete is disabled.
- Core booking details should not be changed.

This protects service history and prevents accidental edits after guests have
already arrived or left.

## Completed Reservation Display

Completed reservations collapse to a minimal view:

```text
12:00
Guest name - 2 guests
Completed
```

This keeps active work readable. Expand the card only when details are needed.

## Email Warnings On Reservation Cards

If the reservation card warns that the guest email is not reachable:

1. Call the guest.
2. Confirm the reservation details by phone.
3. Ask for a corrected email address.
4. Update contact details where possible.
5. Add a note if follow-up is still needed.

Do not rely on email for that guest until the address is corrected.

## Common Reservation Page Questions

### Why can staff add a booking when public booking would reject it?

Staff workflows support real-world exceptions. However, table conflicts and
status locks still protect the restaurant.

### Why did my table assignment disappear after editing?

Changing date, time, service, offering, party size, or duration can make the old
table assignment unsafe. The system may clear it so staff can choose a valid
table again.

### Why is a slot greyed out but still visible?

The slot is part of the day's structure, but it is not currently bookable. The
reason should be shown on the card.

### Why are there no actions on a reservation?

The reservation may be completed, seated, cancelled, or otherwise in a state
where actions are not allowed.

## Troubleshooting

### Availability Fails To Load

1. Confirm the selected date.
2. Refresh the page.
3. Confirm the staff session is still valid.
4. Try a different date.
5. Check whether availability settings were recently edited.
6. Ask platform support to check logs if it persists.

### Covers Look Too High

1. Check active table capacities.
2. Check offering binding.
3. Check whether active tables are duplicated.
4. Check service duration overlap.
5. Check whether reservations are correctly active or cancelled.

### A Booking Cannot Be Added

1. Read the unavailable reason.
2. Check party size.
3. Check lead time and booking window.
4. Check closed days and blocked slots.
5. Check table availability.
6. Check whether the service was stopped today.

### Notifications Appear But No Reservation Is Visible

1. Confirm selected date and offering.
2. Refresh the reservation list.
3. Check whether the booking belongs to another offering.
4. Ask platform support if the notification continues to point nowhere.
