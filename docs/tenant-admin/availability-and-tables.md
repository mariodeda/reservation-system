# Tenant Availability And Tables

## Availability Page

Availability controls the public booking calendar and staff availability views.

Main controls:

- Minimum party size.
- Maximum party size.
- Booking window.
- Lead time.
- Default table duration.
- Weekly service windows.
- Special date overrides.
- Closed days.
- Blocked slots.

## Weekly Services

Each weekly service row contains:

- Service name.
- From.
- To.
- Every (min).
- Duration.
- Actions.

Times use 24-hour format. Capacity is no longer managed from weekly service rows
when active tables exist; table capacity drives bookable covers.

## Table Duration

There are two duration layers:

- Default table duration: fallback used when a service row has no duration.
- Service duration: per-service/per-day override.

The effective duration drives:

- Table conflict windows.
- Slot overlap calculations.
- Covers booked per slot.
- Availability status.

## Tables Page

Tables represent real seating capacity. Each table has:

- Label.
- Capacity.
- Active state.
- Optional offering binding.
- Joinable metadata.

When active tables exist for an offering, their active seats drive slot capacity.
Joined tables can be used for larger parties when configured as joinable.

## Stopping Bookings Today

The header quick action lets staff stop online bookings for a service for today.
If the service's latest bookable time has passed after applying lead time, that
control is disabled. Manually stopped services are visible in the controls and
slot cards.

