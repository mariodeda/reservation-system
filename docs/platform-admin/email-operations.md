# Platform Email Operations

Email is platform-owned. Tenant staff can see email-related reservation state,
but they do not configure SMTP, global email policy, or templates. This keeps
sender identity, credentials, and delivery behavior under platform control.

## What Platform Operators Manage

Per tenant, platform operators manage:

- SMTP host.
- SMTP port.
- SMTP username.
- SMTP password.
- Secure mode.
- From address and display identity.
- Global outbound email switch.
- Booking confirmation event switch.
- Review request event switch.
- Feedback/review request delay.
- Booking confirmation template.
- Review request template.
- Review URL.

There is no global SMTP fallback. If a tenant has no SMTP configuration, that
tenant's emails should be skipped or fail according to the specific send path.

## Email States

Email logs and UI summaries use three states:

| State | Meaning | Operator Action |
| --- | --- | --- |
| Sent | The app attempted the send and SMTP accepted it. | Usually no action unless the guest still reports non-delivery. |
| Failed | SMTP send failed or a bounce was recorded later. | Inspect error metadata and SMTP/provider state. |
| Skipped | Policy or configuration intentionally suppressed the send. | Fix missing configuration or leave as-is if intentional. |

Common skipped reasons:

- Global outbound email disabled.
- Specific email event disabled.
- SMTP not configured.
- Missing recipient.
- Missing review URL.
- Template not ready.
- Reservation not completed.
- Reservation no-show or cancelled.
- Review request already sent.

Skipped does not always mean the system is broken. It often means the system
correctly refused to send an email that did not meet policy.

## Booking Confirmation Emails

Booking confirmation emails are sent when:

- Tenant outbound email is enabled.
- Booking confirmation event is enabled.
- SMTP is configured.
- A recipient email exists.
- Template requirements are satisfied.

The confirmation email includes a calendar attachment. No platform-side calendar
account is required. The calendar event is generated from reservation and tenant
data, including restaurant identity, reservation time, guest party size, and
configured location details where available.

If a guest does not see the calendar invite, check the email client first. Some
clients show calendar attachments differently. Then check the raw email
attachment, email logs, and whether the message was altered by the SMTP provider.

## Review Request Emails

Review request emails are sent only after a reservation is completed and the
configured delay has elapsed. Staff may also trigger a review request manually
from a completed reservation. If a review request was already sent, the button
is disabled and states that it was already sent.

The review link points to the tenant's configured review URL. There is no custom
feedback form in this application. Review email templates should invite the
guest to leave a review on the configured external review site.

Review request sends are idempotent. The system should avoid sending duplicate
review emails for the same eligible reservation, including when automatic
processing and manual staff actions happen close together.

Automatic review requests are processed by the platform cron endpoint
`POST /api/platform/cron/feedback-requests`. Schedule it every 30 minutes with
`Authorization: Bearer <CRON_SECRET>`. Staff page loads must not trigger this
sweep; they only read reservation state. The immediate status-change path still
attempts a send when a reservation is marked completed and the tenant delay has
already elapsed.

## SMTP Health

SMTP health checks verify that the app can connect to a tenant's SMTP server.
They can run from cron or be triggered manually by a platform operator. Manual
checks do not replace or disable the scheduled checks.

Schedule the SMTP health cron endpoint `POST /api/platform/cron/smtp-health`
every 6 hours with `Authorization: Bearer <CRON_SECRET>`.

Restaurant cards show SMTP state with color-coded status so an operator can
quickly identify tenants that need attention.

Health checks answer "can the app connect to SMTP?" They do not guarantee that a
particular recipient mailbox will accept a message later.

## Recipient Rejection And Bounces

Some invalid email addresses are rejected immediately by SMTP. Others are
accepted first and fail later as bounces. This means the system needs both:

- Immediate SMTP error handling.
- Bounce processing from downstream providers.

When a guest email is known to be unreachable, tenant reservation cards can show
a warning so staff can follow up by phone.

## Troubleshooting Delivery

When an operator investigates a missing email:

1. Open platform email logs.
2. Filter by tenant, recipient, date, and email type.
3. Check whether the result is sent, failed, or skipped.
4. For skipped, read the reason and fix configuration if needed.
5. For failed, inspect SMTP or bounce metadata.
6. For sent, check spam/quarantine, recipient mailbox rules, and later bounce
   events.
7. If calendar invites are missing, check whether the email client hides `.ics`
   attachments or requires a specific invite view.

Do not assume "not in inbox" means the application did not send. Email delivery
is a chain: application, SMTP acceptance, provider processing, recipient
server, mailbox filtering, and client display.
