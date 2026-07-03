# Reservation Lifecycle And Actions

This page explains reservation statuses, action buttons, edit rules, delete
rules, table assignment, review email actions, and the safest way to handle
common guest situations.

## Reservation Statuses

| Status | Meaning | Typical Staff Action |
| --- | --- | --- |
| Pending | The booking exists but may need confirmation or review. | Confirm, contact guest, or update details. |
| Confirmed | The guest is expected to arrive. | Keep visible for service and assign a table when needed. |
| Seated | The guest has arrived and is occupying a table. | Do not edit core booking details. Mark completed after the visit. |
| Completed | The visit is finished. | Keep history, optionally send review request. |
| Cancelled | The booking was cancelled. | No seating action needed. |
| No-show | The guest did not attend. | Mark accurately for analytics and future context. |

## Why Status Accuracy Matters

Status is not just a label. It affects:

- Whether staff can edit or delete the reservation.
- Whether the reservation counts in operational views.
- Whether review request email can be sent.
- Analytics such as no-show rate and completed covers.
- Staff understanding of what still needs attention.

## Editing Reservations

Use `Edit reservation` when the guest changes details before they are seated:

- Date.
- Time.
- Service.
- Offering.
- Party size.
- Name.
- Phone.
- Email.
- Notes or allergies.

Editing is disabled once the reservation is seated or completed. This protects
service history. If a seated guest changes table or party size, use operational
status and notes where available instead of rewriting the original booking.

## Delete Reservation

Use `Delete reservation` carefully. Deleting removes the reservation from normal
operational flow. Prefer status changes when they better describe reality:

- Guest cancelled: use cancelled.
- Guest did not arrive: use no-show.
- Guest attended: use completed.

Delete should be reserved for mistakes such as duplicate manual entry or test
data that should not remain in operations.

Deletion is disabled once a reservation is seated or completed.

## Table Assignment

Table assignment connects a reservation to one or more physical tables.

Staff can assign:

- A single table.
- A joined set of tables when the table setup allows it.

Before assigning, check:

- Party size fits the table or joined set.
- The table is active.
- The table belongs to the correct offering or shared pool.
- The assignment does not conflict with another reservation in the effective
  duration window.

If a reservation's date, time, service, offering, party size, or duration
changes, the old assignment may become unsafe. The system should revalidate and
clear unsafe assignments.

## Joined Tables

Joined tables should represent real floor operations. If tables cannot
physically be joined during service, they should not be marked joinable in table
setup.

When a joined set is used, conflicts must consider every table in the set. A
conflict on any one table makes the joined assignment unsafe.

## Completed Reservation Collapse

Completed reservations collapse visually to keep active service readable. The
collapsed view should show only the essentials:

```text
12:00
Guest name - 2 guests
Completed
```

Staff can expand the card if they need more details. This is useful after a busy
service because completed bookings should not compete visually with upcoming or
currently seated guests.

## Review Request Email Action

`Send review email` is available only after a reservation is completed. If a
review request was already sent, the button is disabled and should say that the
request was already sent.

The action can be unavailable because:

- The reservation is not completed.
- The guest has no email address.
- The review request was already sent.
- Platform email policy disables review requests.
- The tenant has no review URL configured.
- SMTP is unavailable.

If staff believe the action should be available, ask platform support to check
email configuration and logs.

## Handling Common Guest Changes

### Guest Calls To Change Time

1. Open the reservation.
2. Check the target slot availability.
3. Edit the time if the reservation is not seated or completed.
4. Recheck table assignment after saving.
5. Confirm the change with the guest.

### Guest Changes Party Size

1. Check whether the new size fits policy and capacity.
2. Edit the party size if allowed.
3. Reassign table if the old table no longer fits.
4. Add a note when the change affects service preparation.

### Guest Cancels

1. Prefer marking cancelled over deleting.
2. Keep notes if the cancellation contains useful context.
3. Do not send review request email.

### Guest Arrives

1. Mark seated.
2. Assign a table if not already assigned.
3. Avoid editing core reservation details after seating.

### Guest Leaves

1. Mark completed.
2. Confirm no further operational action is needed.
3. Send review request email only if appropriate and available.

### Guest Does Not Arrive

1. Mark no-show after the restaurant's normal grace period.
2. Do not mark completed.
3. Do not send review request email.

## Action Safety Rules

- Do not edit or delete seated reservations.
- Do not edit or delete completed reservations.
- Do not send review emails for no-shows or cancelled bookings.
- Do not use delete to represent normal cancellation.
- Do not assign a table that is physically impossible for the party.
- Do not ignore email unreachable warnings; call the guest.
