# Tenant Notifications And Email

## Notifications

Tenant admin listens for reservation events through server-sent events. New
reservation events produce:

- A bell notification.
- A toast notification.

Duplicate reservation-created events are deduplicated in the browser tab by
reservation id. Mark all read and toast dismissal update the local notification
state immediately.

## Reservation Email State

Reservation cards can display email delivery warnings when the guest email is
known to be unreachable through SMTP rejection or bounce processing.

Staff should follow up by phone when a reservation card warns that the guest
email is not reachable.

## Review Request Emails

Staff can send a review request email only after a reservation is completed. If
a review request was already sent, the action is disabled and shown as already
sent.

Review emails use the platform-configured review URL and templates. There is no
custom feedback form in this application.

