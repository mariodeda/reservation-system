# Tables And Floor Operations

Tables are the bridge between online availability and real floor management.
They determine how many covers can be accepted, which bookings can be assigned,
and whether a service is physically realistic.

## Tables Page Purpose

Use the Tables page to maintain the restaurant's real seating layout:

- Table label.
- Seat capacity.
- Active or inactive state.
- Offering binding.
- Joinable behavior.

The table setup should match what staff can actually use during service. If a
table is broken, unavailable, removed for an event, or not used online, disable
it or adjust its offering binding rather than leaving misleading capacity.

## Table Labels

Use labels staff already understand:

- `1`
- `2`
- `Patio 4`
- `Bar 3`
- `Private Room`

Avoid labels that only make sense to one manager. New staff should be able to
look at the label and know where the guest should go.

## Capacity

Capacity is the number of guests the table can reasonably seat. Do not inflate
capacity to make the booking calendar look better. Inflated capacity leads to
overbooking and bad table suggestions.

If a table sometimes seats 2 and sometimes 4, choose the normal operational
capacity and use joined tables or staff judgement for exceptions.

## Active State

Inactive tables should not contribute to availability. Use inactive state for:

- Tables removed from the floor.
- Tables blocked for maintenance.
- Seasonal tables outside the current season.
- Patio tables during bad weather if they should not be bookable.
- Tables held for walk-ins or VIP use.

If the change is only for today, consider whether a blocked slot, stopped
service, or manager note is more appropriate than changing table setup.

## Offering Binding

Offering binding limits a table to a specific booking area or channel.

Examples:

- Patio tables bound to patio offering.
- Bar seats bound to bar offering.
- Private room tables bound to private room offering.
- Main dining tables left shared if they can serve the default offering.

If a table appears available in the wrong area, check offering binding first.

## Joinable Tables

Joinable tables let the system suggest combined tables for larger parties.

Only mark tables joinable if:

- They are physically close.
- Staff can join them without blocking service paths.
- The combined table is acceptable for guests.
- The restaurant actually wants online or staff bookings to use that
  combination.

Bad joinable setup can create unrealistic assignments. Review joinable tables
after floor layout changes.

## Floor/Day Calendar Modal

The floor/day calendar shows the whole day in a visual layout. It helps staff
see:

- Which tables are occupied.
- When reservations overlap.
- Where there are turn gaps.
- Which services are open or closed.
- Whether a large party can fit later.

The current-time sweep line is shown at the bottom so it does not cover timing
content. Closed gaps between services should remain understandable and should
not look like bookable time.

## Continuous And Split Opening Hours

Restaurants can have continuous hours or split services.

Continuous example:

```text
12:00 to 22:00
```

Split example:

```text
Lunch: 12:00 to 15:00
Dinner: 18:00 to 23:00
```

The floor/day view should show the whole day either way. Staff should be able to
see that 16:00 is closed in the split example, even though the day still has a
dinner service later.

## Using Floor View During Service

Use the floor/day modal when:

- A guest asks for a different time.
- Staff need to fit a large party.
- There is a table conflict.
- A table is running late.
- The host needs to understand the next turn.
- The manager wants to stop or reopen same-day bookings.

## Table Assignment Dropdown

The dropdown should show enough information for staff to choose correctly:

- Table label.
- Capacity.
- Availability or conflict hints.
- Joined table information where relevant.

Rows should be vertically centered and readable in both light and dark themes.
Hover tooltips should explain any compact details.

## Common Table Problems

### Slot Capacity Is Too High

Check:

- Duplicate tables.
- Tables with capacity too high.
- Inactive tables still marked active.
- Tables bound to the wrong offering.
- Legacy capacity still used because no active tables exist for an offering.

### Staff Cannot Assign A Table

Check:

- Party size exceeds table capacity.
- Table is inactive.
- Table belongs to another offering.
- Another reservation overlaps the effective duration window.
- Joined table setup is missing or unrealistic.

### Public Booking Accepts Too Many Guests

Check:

- Active table capacities.
- Maximum party size.
- Service duration.
- Slot interval.
- Existing reservations and overlaps.

### Public Booking Rejects Guests Despite Empty Tables

Check:

- Lead time.
- Booking window.
- Closed day or special date.
- Blocked slot.
- Stopped service today.
- Maximum party size.
- No valid table combination.
