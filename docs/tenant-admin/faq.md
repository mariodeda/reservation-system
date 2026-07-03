# Staff FAQ

This FAQ answers common staff questions in plain language.

## Access And Navigation

### Why does changing the URL slug not show another restaurant?

Access comes from the logged-in staff session, not the URL slug. The slug is for
routing and branding only.

### How do I get back to the dashboard?

Click the restaurant logo in the header.

### Where did the Dashboard header link go?

It was removed to keep the header cleaner. The logo is the dashboard shortcut.

### Where is Settings?

Settings is the gear icon near Sign out.

## Reservations

### Why can I not edit a reservation?

The reservation may be seated or completed. Those states lock editing and
deletion to protect service history.

### Should I delete a cancelled reservation?

Usually no. Mark it cancelled. Delete only if the reservation was created by
mistake and should not remain in normal operations.

### Why did a completed reservation collapse?

Completed reservations collapse so the active service list stays easy to read.
Expand the card if details are needed.

### Why is Send review email disabled?

Common reasons:

- Reservation is not completed.
- Review email was already sent.
- Guest has no email.
- Platform disabled review request emails.
- Review URL is missing.
- SMTP is not ready.

### Can I send a review email to a no-show?

No. Review requests are for attended, completed reservations.

## Availability And Covers

### Why does a slot show booked covers across multiple times?

A reservation occupies capacity for its effective table duration. If a 19:00
reservation lasts 90 minutes, it overlaps later slots. This is expected.

### Why does the restaurant have enough seats but the booking is rejected?

Possible reasons:

- Party size exceeds max party size.
- Lead time passed.
- Slot is blocked.
- Service was stopped today.
- Date is closed.
- No valid table or joined-table set exists.

### What is the difference between maximum party size and capacity?

Maximum party size is the largest single booking allowed. Capacity is how many
total covers can fit in a slot.

### Why is a service switch disabled in quick booking controls?

The service may be past its latest bookable time after lead time is applied.

## Tables

### Why can I not assign a table that looks empty?

It may conflict with another reservation's duration window, belong to another
offering, be inactive, or be too small for the party.

### What are joined tables?

Joined tables are combinations staff can physically put together for larger
parties. They should match the real floor.

### Should I change table capacity for one special night?

Usually no. Use special dates, blocked slots, stopped services, or manager notes
unless the physical table setup truly changed.

## Notifications

### Does Mark all read delete bookings?

No. It only clears notification unread state.

### Why do I see duplicate notifications?

Possible causes include multiple browser tabs or repeated event delivery. Check
whether there is actually one booking or multiple bookings.

### What should I do with a toast notification?

Use it as an alert. The reservation itself remains in the reservation list.

## Email

### What does an email warning mean?

The guest email may not be reachable. Call the guest.

### Can staff configure SMTP?

No. SMTP is configured by platform administrators.

### The guest did not receive confirmation. What should I do?

Check the email address, call the guest if needed, and ask platform support to
inspect email logs.

### Does Sent guarantee the guest saw the email?

No. Sent means SMTP accepted the message. The email can still be filtered,
bounced later, or hidden by the email client.

## Customers And Analytics

### Why are analytics wrong?

Analytics depend on accurate reservation statuses. Make sure completed,
cancelled, and no-show states are kept up to date.

### How do I find a returning guest?

Use Customers search by name, email, or phone.

### Should notes include sensitive information?

No. Use notes only for service-relevant details.

## When To Escalate

Escalate to platform support when:

- Availability does not load after refresh.
- Many emails fail or skip unexpectedly.
- Public booking site has CORS or tenant key problems.
- Staff see repeated 403 errors.
- Notifications do not clear.
- Data appears to cross tenant boundaries.
- SMTP, domains, public keys, or allowed origins need changes.
