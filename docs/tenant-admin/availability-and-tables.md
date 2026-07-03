# Availability And Tables

Availability and tables decide what guests can book and what staff can safely
manage. This is the most important configuration area for preventing
overbooking, bad table assignments, and confusing slot availability.

## What Availability Controls

Availability controls:

- Weekly service hours.
- Service names.
- Slot intervals.
- Service-specific table duration.
- Default table duration.
- Minimum party size.
- Maximum party size.
- Booking window.
- Lead time.
- Closed days.
- Special dates.
- Blocked slots.
- Today-only stopped services.

Tables control:

- Physical seating capacity.
- Which offering a table belongs to.
- Whether a table is active.
- Whether tables can be joined.

The public booking calendar depends on both. Staff should think of availability
as "when can guests book?" and tables as "where can guests physically sit?"

## Availability Page Overview

Use the Availability page when:

- Restaurant hours change.
- Lunch or dinner times change.
- The restaurant adds or removes a service.
- A holiday or private event changes one date.
- A time must be blocked.
- Lead time or booking window needs adjustment.
- Maximum online party size changes.
- Table duration differs by service.

Do not make live changes during a busy service unless necessary. Availability
changes can immediately affect public booking.

## Weekly Services

Weekly services define normal repeated service windows.

Each service row includes:

| Field | Meaning |
| --- | --- |
| Service name | Staff-facing and guest-facing service label, such as Lunch or Dinner. |
| From | First time in the service window. |
| To | End of the service window. |
| Every (min) | Slot interval, such as every 15 or 30 minutes. |
| Duration | How long reservations in this service occupy tables. |
| Actions | Edit, duplicate, or remove the service row depending on UI controls. |

Times use 24-hour format. Use service names that staff understand immediately.

## Service Name

Use names like:

- Lunch.
- Dinner.
- Brunch.
- Patio Lunch.
- Bar.
- Private Room.

Avoid vague names like `Service 1`. Staff will see the service name when
creating and managing reservations.

## From And To

`From` is the first service time. `To` is the end of the service window.

Example:

```text
From: 12:00
To: 15:00
Every: 30
```

This creates bookable slot times based on the interval and service rules.

## Every (min)

`Every (min)` controls how often slots appear.

Shorter intervals give more flexibility but can make service harder to manage.
Longer intervals are simpler but may reduce booking options.

Common choices:

- 15 minutes: flexible, higher operational complexity.
- 30 minutes: common balance.
- 60 minutes: simple, but less flexible.

## Duration

Duration is how long a reservation occupies table capacity.

Example:

- Lunch: 75 minutes.
- Dinner: 120 minutes.
- Tasting menu: 180 minutes.

Duration affects:

- Table conflict checks.
- Slot cover calculations.
- Availability pressure.
- Floor/day calendar layout.
- Whether later slots remain safe to book.

If duration is too short, the system may allow overbooking. If duration is too
long, the system may block too much availability.

## Default Duration Versus Service Duration

There are two duration layers:

| Duration Type | When Used |
| --- | --- |
| Default table duration | Fallback when a service row has no specific duration. |
| Service duration | Preferred value for that service and day. |

Use service duration when lunch, dinner, brunch, or special services have
different turn times. Keep the default duration as a safe fallback.

## Minimum And Maximum Party Size

Minimum party size controls the smallest booking accepted. Maximum party size
controls the largest single booking accepted.

Maximum party size is not the same as slot capacity. A restaurant may have 80
seats available but allow only 12 or 20 guests in one online booking.

If a guest wants a larger party than the online maximum, staff can decide
whether to handle it manually based on restaurant policy and table feasibility.

## Booking Window

Booking window controls how far into the future guests can book.

Examples:

- 14 days: short-term booking only.
- 30 days: common restaurant window.
- 90 days: useful for destination or event-heavy restaurants.

If guests say they cannot book a future date, check booking window before
assuming the date is closed.

## Lead Time

Lead time prevents guests from booking too close to the reservation time.

Example: if lead time is 120 minutes, a guest cannot book a 19:00 slot after
17:00.

Lead time protects staff from last-minute online bookings the restaurant cannot
prepare for. Staff may still decide to create a manual booking if operationally
safe.

## Closed Days

Closed days block entire dates. Use them for:

- Holidays.
- Staff vacations.
- Renovation days.
- Private buyouts.
- Unexpected closures.

Closed days are clearer than blocking every slot manually.

## Special Dates

Special dates override normal weekly hours for one date.

Use special dates for:

- New Year's Eve.
- Valentine's Day.
- One-off brunch.
- Private event with changed hours.
- A holiday service that differs from normal schedule.

Always test special dates after saving. They are common sources of confusion
because they intentionally override the normal weekly schedule.

## Blocked Slots

Blocked slots close specific times inside an otherwise open service.

Use blocked slots for:

- Kitchen break.
- Private party at a certain time.
- Large group hold.
- Maintenance window.
- Temporary staff shortage.

Blocked slots should be specific. If the whole date is closed, use closed day.
If the whole service is closed today, use the quick stop control or special date
depending on whether it is temporary or planned.

## Today-Only Stopped Services

The header quick action stops online bookings for one service today. It is
operational, temporary, and visible to staff.

Use it when:

- The service is unexpectedly full.
- The restaurant is short-staffed.
- Weather affects seating.
- The kitchen asks to stop incoming online bookings.

It does not delete existing reservations.

## Tables And Capacity

When active tables exist for an offering, table seats drive slot capacity.

That means:

- Active tables count.
- Inactive tables do not count.
- Offering-bound tables count only for the matching offering.
- Joined tables can help fit larger parties when configured.

Capacity should reflect real seating, not desired sales volume.

## Legacy Capacity

If no active tables exist for an offering, the system may fall back to legacy
service capacity. This is a compatibility path. For accurate operations, staff
should configure real tables.

If covers look much higher or lower than expected, check whether the service is
using table capacity or legacy capacity.

## Safe Change Process

When changing availability:

1. Make the smallest change that solves the problem.
2. Save.
3. Check the affected date on Reservations.
4. Check at least one public availability response or booking page if possible.
5. Confirm staff understand the change.

For major schedule changes, avoid editing during active booking peaks.

## Setup Checklist

Before accepting live bookings:

1. Create tables with accurate labels and capacities.
2. Disable unavailable tables.
3. Bind tables to offerings where needed.
4. Configure normal weekly services.
5. Set service-specific durations.
6. Set default duration.
7. Set minimum and maximum party size.
8. Set lead time.
9. Set booking window.
10. Add known closed days.
11. Add known special dates.
12. Add blocked slots.
13. Test public booking for a normal day.
14. Test public booking for a special day.
15. Create a staff test booking and assign a table.

## Questions Staff Often Ask

### Why was capacity removed from weekly service rows?

Capacity should come from real active tables when tables are configured. This is
more accurate than typing a number into each service row.

### Should I change table duration or slot interval?

Change duration when guests occupy tables for a different amount of time. Change
slot interval when you want booking times to appear more or less frequently.

### Why does changing duration affect covers?

Longer duration means reservations overlap more future slots. Shorter duration
frees capacity sooner.

### Why can I not stop a service today?

The latest bookable time may have passed after lead time. There is nothing left
for online guests to book.

### What should I do for a private event?

If the whole date is private, use closed day or special date. If only some times
are private, use blocked slots. If the decision is same-day and temporary, use
today-only stop controls.
