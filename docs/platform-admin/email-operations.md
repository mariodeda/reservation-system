# Platform Email Operations

## Email Ownership

Email is platform-owned. Tenant staff do not configure SMTP or global email flow
policy.

Per tenant, platform operators manage:

- SMTP host, port, user, password, secure mode, and from address.
- Global outbound email switch.
- Booking confirmation switch.
- Post-visit review request switch.
- Feedback/review request delay.
- Booking confirmation template.
- Review request template.
- Review URL.

## Email States

Email logs and UI summaries use three states:

- Sent: the app attempted and accepted a send through SMTP.
- Failed: the send failed or a bounce was later recorded.
- Skipped: policy or configuration suppressed the send.

Common skipped reasons:

- SMTP not configured.
- Email event disabled.
- No recipient.
- No review URL.
- Reservation not attended/completed.

## Booking Confirmation Emails

Booking confirmation emails are sent when:

- Tenant outbound email is enabled.
- Booking confirmation event is enabled.
- SMTP is configured.
- A recipient email exists.

The email includes a calendar attachment. No platform-side calendar account is
required; the event name and restaurant details are generated from tenant and
reservation data.

## Review Request Emails

Review request emails are sent only after a reservation is completed and the
configured delay has elapsed. Staff may also trigger a review request manually
from a completed reservation. If a review request was already sent, the button is
disabled.

The review link points to the tenant's configured review URL. There is no custom
feedback form in this application.

## SMTP Health

SMTP health checks can run from cron or be triggered manually by a platform
operator. Results are recorded per tenant and displayed on platform restaurant
cards.

