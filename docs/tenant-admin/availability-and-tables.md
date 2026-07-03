# Tenant Availability And Tables

Availability and tables determine what the public booking calendar can offer and
what staff see on the reservations page. This is one of the most important
sections for a restaurant to understand before accepting live bookings.

## Availability Page

Availability controls:

- Minimum party size.
- Maximum party size.
- Booking window.
- Lead time.
- Default table duration.
- Weekly service windows.
- Special date overrides.
- Closed days.
- Blocked slots.

These settings work together. Changing only one value can affect public booking,
staff slot cards, table conflicts, and the floor/day calendar.

## Weekly Services

Each weekly service row contains:

- Service name.
- From.
- To.
- Every (min).
- Duration.
- Actions.

Times use 24-hour format. Capacity is no longer managed from weekly service rows
when active tables exist. Active table seats drive bookable covers.

Use clear service names such as `Lunch`, `Dinner`, `Patio Dinner`, or `Bar`.
Staff will see these names during reservation creation and availability review.

## From, To, And Every

`From` is the first possible slot time for the service. `To` is the end of the
service window. `Every (min)` controls the interval between generated slots.

Example:

```text
From: 12:00
To: 15:00
Every: 30
```

This creates slots such as 12:00, 12:30, 13:00, 13:30, and so on according to
the service rules.

## Table Duration

There are two duration layers:

- Default table duration: fallback used when a service row has no duration.
- Service duration: per-service/per-day override.

The effective duration drives:

- Table conflict windows.
- Slot overlap calculations.
- Covers booked per slot.
- Availability status.
- Floor/day calendar reservation width or placement.

If dinner normally turns tables in 120 minutes and lunch turns tables in 75
minutes, set those durations on the relevant service rows. Leave the default as
a safe fallback.

## Tables Page

Tables represent real seating capacity. Each table has:

- Label.
- Capacity.
- Active state.
- Optional offering binding.
- Joinable metadata.

When active tables exist for an offering, their active seats drive slot
capacity. If a table is inactive, it should not contribute to availability.

Use offering binding when a table belongs only to a specific area or booking
channel, such as patio or bar. Leave it unbound only when it should be available
to the default shared pool.

## Joinable Tables

Joinable tables allow the system to suggest or assign combined tables for larger
parties. Joinable metadata should reflect real physical possibilities. Do not
mark tables joinable if staff cannot actually combine them during service.

For large parties, table assignment may use a joined set. Conflict checks must
consider every table in the set.

## Closed Days, Special Dates, And Blocked Slots

Use closed days for full-day closures such as holidays.

Use special date overrides when a specific date has different hours, such as New
Year's Eve or a private event day.

Use blocked slots for targeted closures inside otherwise normal service, such as
a private party at 20:00 or a kitchen break.

## Lead Time And Booking Window

Lead time prevents guests from booking too close to service time. Booking window
controls how far into the future guests can book.

For today, lead time also affects quick stop controls. If the latest bookable
time for a service has already passed after applying lead time, the stop switch
is disabled because there is nothing left to stop for online booking.

## Stopping Bookings Today

The header quick action lets staff stop online bookings for a service for today.
Use it when the restaurant is unexpectedly full, short-staffed, hosting a
private event, or no longer accepting online bookings for the remaining service.

Manually stopped services are visible in controls and slot cards. This visibility
is important so staff do not confuse a stopped service with a system error.

## Practical Setup Checklist

Before going live:

1. Create all active tables with correct capacities.
2. Disable tables that should not count for online capacity.
3. Bind tables to offerings if needed.
4. Configure weekly services for each day.
5. Set service-specific durations where lunch and dinner differ.
6. Set minimum and maximum party size.
7. Set lead time and booking window.
8. Add known closures and special dates.
9. Test a few public availability dates.
10. Create a test staff reservation and confirm table assignment behaves as
    expected.

## Troubleshooting

If too many covers appear available:

- Check active tables and their capacities.
- Check whether tables are duplicated across offerings.
- Check whether inactive tables are still active.
- Check whether a service still has legacy capacity because no active tables
  exist for that offering.

If bookings are rejected unexpectedly:

- Check max party size policy.
- Check lead time.
- Check blocked slots.
- Check closed days and special date overrides.
- Check effective table duration and overlapping reservations.
- Check whether a valid table or joined table set exists.
