# Tenant Notifications And Email

Tenant notifications help staff notice new booking activity while working in
the admin. Email state helps staff understand whether guests are likely to
receive confirmations and review requests.

## Notifications

Tenant admin listens for reservation events through server-sent events. New
reservation events can produce:

- A bell notification.
- A toast notification in the bottom-right corner.

The bell popup shows recent reservation notifications. `Mark all read` should
clear unread state in the UI. Dismissing a toast with the X button should also
mark that notification as read.

Notifications are not reservations. Clearing a notification does not delete or
cancel the booking. The reservation remains visible in the reservation list.

## Duplicate Protection

The browser deduplicates reservation-created events by reservation id so the
same booking should not produce duplicate or triplicate notifications in the
same tab.

If staff see duplicates:

- Check whether multiple browser tabs are open.
- Confirm whether the duplicate rows refer to the exact same reservation.
- Refresh stale tabs.
- Report persistent duplicates to platform support with the reservation time and
  guest name.

## Reservation Email Warnings

Reservation cards can display email delivery warnings when the guest email is
known to be unreachable through SMTP rejection or bounce processing.

Staff should follow up by phone when a reservation card warns that the guest
email is not reachable. If the guest provides a corrected email, update the
reservation or customer contact details according to the available workflow.

## Booking Confirmation Emails

Booking confirmation emails are controlled by platform configuration. Staff do
not enable or disable the global confirmation flow from tenant admin.

If a guest says they did not receive a confirmation:

1. Check whether the reservation has an email address.
2. Check whether the reservation card shows an email warning.
3. Ask platform support to inspect email logs for sent, failed, or skipped
   status.
4. Confirm the guest checked spam or promotions folders.

## Review Request Emails

Staff can send a review request email only after a reservation is completed. If
a review request was already sent, the action is disabled and shown as already
sent.

Review emails use the platform-configured review URL and templates. There is no
custom feedback form in this application.

If the action is missing or disabled, check:

- The reservation is completed.
- The guest has an email address.
- A review request was not already sent.
- Platform email policy and review URL are configured.

## What Staff Should Escalate

Contact platform support when:

- Booking confirmations are skipped or failing for many guests.
- Review email buttons are unavailable despite completed reservations.
- SMTP warnings appear on many reservations.
- Notifications do not clear after marking them read.
- New online bookings do not appear without refresh.

Include the restaurant name, date, guest name, reservation time, and any visible
warning text. That gives platform operators enough context to filter logs
quickly.
