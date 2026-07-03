# Tenant Reservations

## Reservation Page

The reservations page is the main operational screen. It includes:

- Date selector.
- Offering selector when multiple offerings exist.
- Service and slot availability cards.
- Reservation list.
- New reservation modal.
- Floor/day calendar modal.
- Waitlist modal.

## Slot Cards

Slot cards show:

- Slot time.
- Booked covers compared with active table capacity.
- Availability status.
- Specific unavailable reason when unavailable.

Unavailable reasons include:

- Service stopped today.
- Time blocked.
- Booking cutoff passed.
- Not enough covers left.
- Fully booked.
- Service ended.

Slot capacity is derived from active table seats for the offering when tables
exist. Slot booked covers include overlapping reservations according to the
effective table duration for that service and date.

## New Reservation Modal

The modal collects:

- Offering.
- Date.
- Service.
- Time.
- Guest count.
- Guest name.
- Phone.
- Email.
- Notes/allergies.

Staff-created reservations may bypass some public booking restrictions so staff
can record real-world bookings, but table conflicts and seated/completed edit
rules still apply where relevant.

## Reservation Actions

Actions can include:

- Table assignment.
- Edit reservation.
- Delete reservation.
- Send review email.

Seated or completed reservations cannot be modified or deleted. Completed
reservations collapse visually and show only the minimum operational details
until expanded.

## Floor/Day Calendar

The floor/day calendar displays the whole day. A current-time sweep indicator is
shown at the bottom so it does not overlap reservation timing content. The view
handles continuous and non-continuous opening hours.

## Waitlist

The waitlist is available from the reservations page as a modal. Staff can add,
update, and seat waitlist entries.

