# Dashboard And Navigation

The dashboard is the staff starting point. It is designed for quick awareness:
what is happening today, what needs attention, and where staff should go next.

## Header Navigation

The header gives staff fast access to operational areas:

- Tenant logo: returns to the dashboard.
- Reservations: opens the main reservation workspace.
- Tables: opens table setup and capacity management.
- Availability: opens weekly hours, booking rules, closed days, and blocks.
- Clients & Statistics: dropdown for customer records and analytics.
- Settings icon: opens tenant-local settings and staff password change.
- Sign out: ends the staff session.

The dashboard link is intentionally not duplicated in the header. Use the tenant
logo to return home.

## Clients & Statistics Dropdown

The `Clients & Statistics` item groups two related sections:

- Customers: guest records, contact details, and reservation history.
- Analytics: performance and booking summaries.

The dropdown should close when staff click outside it. If it remains open and
covers the page, refresh the browser and report the issue if it repeats.

## Dashboard Reservations

The dashboard focuses on today's reservations. It is useful before and during
service because it avoids making staff choose a date first.

Typical dashboard tasks:

- See how many guests are expected today.
- Identify upcoming arrivals.
- Assign or adjust tables when table assignment is available.
- Update guest status during service.
- Notice email warnings or operational alerts.

If staff need the full slot grid, waitlist, floor/day calendar, or date changes,
they should move to the Reservations page.

## Quick Booking Controls

The header can include a quick action for stopping today's remaining online
bookings by service. Use it only for same-day operational decisions, such as:

- The kitchen is at capacity.
- The restaurant is short-staffed.
- A private event reduces available space.
- Weather makes patio seating unavailable.
- A service is already effectively closed.

If the latest bookable time for a service has passed after applying lead time,
that service switch is disabled because there are no remaining public slots to
stop.

When a service is manually stopped, staff should see that state clearly in the
controls and on relevant slot cards. This prevents confusion between "closed by
staff choice" and "system cannot load availability."

## Bell Notifications

The bell shows recent reservation notifications. Use it to catch new online
bookings while staff are working elsewhere in the admin.

Actions:

- Open bell: review recent notifications.
- Mark all read: clear unread state.
- Click a notification: use it as a pointer to the reservation context.

Notifications do not replace the reservation list. A booking remains in
Reservations even after its notification is dismissed.

## Toast Notifications

Toast notifications appear in the bottom-right corner for new events. Dismissing
a toast with the X button should mark that notification as read.

If staff see the same toast repeatedly:

1. Check whether multiple tabs are open.
2. Refresh the active tab.
3. Check the bell unread count.
4. Report the guest name, time, and date if it keeps recurring.

## Sign Out

Staff should sign out on shared devices at the end of a shift. If the restaurant
uses a shared front-desk computer, make sign-out part of the closing procedure.

## Dashboard Questions

### Why is the table assignment dropdown missing on the dashboard?

The reservation may not be eligible for table assignment, tables may not be
configured, or the dashboard may show a compact action set. Use the full
Reservations page if the dashboard does not provide enough detail.

### Why does the dashboard not show another date?

The dashboard is for today. Use the Reservations page and date selector for
future or past dates.

### Why does a stopped service still show existing reservations?

Stopping bookings prevents additional online bookings for today. It does not
cancel or hide reservations that already exist.
