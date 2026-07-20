# Notifications And Email

Notifications help staff react to new booking activity. Email state helps staff
understand whether guests are receiving messages and when staff should follow up
by phone.

Notifications are stored by the system, not only in the open browser tab. If a
staff member logs in after a booking arrived, unread booking notifications are
loaded from the server and shown in the bell popup. Live toast notifications are
an additional convenience while the admin page is open.

## Notification Types

The restaurant admin can show:

- Bell notifications in the header.
- Toast notifications in the bottom-right corner.
- Reservation-card warnings.
- External booking source updates, such as TheFork or DISH imports.

Notifications are alerts about activity. They are not the reservation data
itself.

## Bell Popup

The bell popup shows unread reservation notifications for the restaurant tenant
that is currently logged in. It does not show notifications from other
restaurants.

Staff can:

- Open the bell to review notifications.
- Use `Mark all read` to clear unread state.
- Click a notification to mark it read and open the reservations page for that
  date.

Unread state is saved on the server. Closing the browser or logging in from a
different device should not bring back notifications that were already marked
read.

If unread state does not clear after clicking `Mark all read`:

1. Click Mark all read once.
2. Close and reopen the popup.
3. Refresh the page.
4. Report the issue if unread state returns for the same notifications.

## Toast Notifications

Toast notifications appear in the bottom-right corner. They are useful during
service because staff can notice new online bookings without leaving the current
screen.

Clicking the X button should dismiss the toast and mark that notification read.
Dismissing a toast does not cancel or delete the reservation.

## Duplicate Notification Protection

The system creates durable notifications with a server-side duplicate key. This
means the same reservation creation event should not create duplicate unread
notifications, even if a browser reconnects or a background import retries the
same record.

External booking updates from integrations can produce a notification when the
external reservation changes date, time, party size, or other operational
details. Those are intentionally shown because they can affect capacity and
staff planning.

Staff can still become confused when:

- Multiple browser tabs are open.
- Multiple real reservations are made by the same guest.
- An old browser tab reconnects.
- Staff mistake notifications for reservation rows.
- An external platform sends a legitimate update for a booking that was already
  imported.

When in doubt, check the reservation list for the selected date and bookable area.

## What Happens At Login

When the tenant admin loads, the header asks the server for recent unread
notifications. This covers bookings that arrived while no staff page was open.
After that, a live connection listens for new durable notifications. If the live
connection drops, the header shows a reconnecting state and retries
automatically.

Recommended staff workflow:

1. At the start of a shift, open the bell and review unread notifications.
2. Click any notification that needs attention.
3. Use `Mark all read` after the team has reviewed the list.
4. Leave the page open during service to receive live toast alerts.

## External Booking Notifications

External bookings synced from platforms such as TheFork and DISH are shown in
the same tenant notification system. They are still tenant-isolated and appear
only for the restaurant whose integration produced the booking.

External notifications are useful because they can reduce availability on the
public booking API and can create overbooking pressure if an external platform
accepts more bookings than expected. Staff should review external booking
notifications together with the reservations list and the slot status UI.

## Notification Troubleshooting

### Mark All Read Does Nothing

Try:

1. Close and reopen the popup.
2. Refresh the page.
3. Check whether notifications are already read but still visible as history.
4. Report if unread indicators remain active.

### Toast Keeps Coming Back

Try:

1. Check other browser tabs.
2. Refresh the active tab.
3. Confirm whether the reservation is new or the same old booking.
4. Report guest name, date, and time if it repeats.

### New Reservations Do Not Appear

Try:

1. Refresh the reservation list.
2. Confirm the selected date.
3. Confirm the selected bookable area.
4. Check internet connection.
5. Ask platform support to check system logs if the issue persists.

## Booking Confirmation Emails

Booking confirmations are controlled by platform support. Staff do not turn on
email sending or confirmation rules from the restaurant admin.

If a guest says the confirmation did not arrive:

1. Confirm the guest email address.
2. Check whether the reservation card shows an email warning.
3. Confirm the booking details by phone if needed.
4. Ask platform support to check email logs.

## Calendar Attachments

Booking confirmation emails can include a calendar attachment. Different email
clients display these differently:

- Some show an RSVP-style invitation.
- Some show an `.ics` attachment.
- Some add the event automatically after the guest accepts.
- Some hide calendar details behind a menu.

If the guest cannot find the calendar event, first confirm the email arrived,
then ask them to check how their email client displays calendar attachments.

## Review Request Emails

Review request emails are sent after a completed visit, either automatically
after the configured delay or manually by staff when the action is available.

Staff can send a review request only when:

- The reservation is completed.
- The guest has an email address.
- A review request was not already sent.
- Platform support has allowed review emails.
- The restaurant has a review link saved.
- Email sending is ready.

There is no feedback form inside this system. Review links take guests to the
restaurant's external review site, set up by platform support.

## Email Warning On Reservation Cards

An email warning means the system has reason to believe the guest email is not
reachable. This can happen because:

- The email address was rejected immediately.
- The email provider later reported that delivery failed.
- A previous send failed.

Staff response:

1. Call the guest.
2. Confirm the reservation.
3. Ask for a corrected email.
4. Update the reservation/customer record if possible.
5. Add a note if manual follow-up is still required.

## Sent, Failed, And Skipped

Platform email logs use three states:

| State | Meaning For Staff |
| --- | --- |
| Sent | The message was accepted for delivery. This does not guarantee the guest saw it. |
| Failed | Sending failed or a bounce was recorded. Staff may need to call the guest. |
| Skipped | The system intentionally did not send because a rule or required setting was not ready. |

Restaurant staff usually do not see the full platform email log page. Ask platform
support to check it when needed.

## Common Email Questions

### Can staff resend a booking confirmation?

Use the actions available in the reservation card. If no resend action exists,
confirm details by phone and ask platform support whether resend is supported.

### Can staff send review email before completion?

No. Review requests are for completed visits only.

### Why is review email already sent?

The system records review request sends to prevent duplicates. If already sent,
the button stays disabled.

### Does no email warning mean delivery is guaranteed?

No. It only means the system has not recorded a known failure. Guests can still
miss emails due to spam filters, mailbox rules, or client behavior.

## When To Escalate

Escalate to platform support when:

- Many guests report missing confirmations.
- Review emails are unavailable for completed bookings.
- Email warnings appear on many reservations.
- Notifications do not clear after refresh.
- New online bookings do not appear in tenant admin.
- Staff need email sending, template, review link, or email rule changes.
