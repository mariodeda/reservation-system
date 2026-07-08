/**
 * Domain types for the (project-agnostic) reservation system.
 * Times are "HH:MM" (24h), dates are "YYYY-MM-DD" in the configured timezone.
 */

export type ServiceId = string; // e.g. "lunch" | "dinner" | any custom id

export type OfferingId = string; // e.g. "main" | "sushi" | "cocktails" | "events"

/**
 * The stable id of the primary/legacy offering. A single-offering tenant is
 * modeled as a multi-offering tenant with exactly one offering whose id is this
 * constant. It is used identically across normalization, sanitization, the DB
 * column default, and the reservation backfill — never derive or rename it, or
 * existing reservations (all attributed to "main") would stop counting.
 */
export const DEFAULT_OFFERING_ID: OfferingId = "main";

export interface ServiceWindow {
  id: ServiceId;
  label: string;
  /** First bookable time, "HH:MM". */
  start: string;
  /** Last bookable time (inclusive), "HH:MM". */
  end: string;
  /** Minutes between slots, e.g. 30. */
  interval: number;
  /** Legacy fallback max covers per slot, used only when no active tables exist. */
  capacity: number;
  /**
   * How long a table stays occupied for a booking in this service, in minutes.
   * Used for table conflicts and table-derived availability/capacity windows.
   * Falls back to AvailabilityConfig.turnMinutes when omitted.
   */
  turnMinutes?: number;
}

export interface DaySchedule {
  closed: boolean;
  services: ServiceWindow[];
}

export type CapacityMode = "tables" | "manual";

export type DatedSlotCapacityOverrides = Record<
  string,
  Record<OfferingId, Record<ServiceId, Record<string, number>>>
>;

export type ForwardSlotCapacityOverrides = Record<
  OfferingId,
  Record<ServiceId, Record<string, { effectiveFrom: string; capacity: number }[]>>
>;

/**
 * A bookable offering — the *kind* of experience a guest reserves (Restaurant,
 * Sushi, Cocktails, Events…). Each offering owns its own weekly schedule of
 * time-bands, per-date overrides, and blocked slots. Bookable covers are
 * derived from active tables when configured, falling back to legacy per-service
 * capacity only for tenants without tables. Full-day `closures`, party-size bounds, lead time, booking window,
 * and timezone remain tenant-global (see AvailabilityConfig).
 */
export interface Offering {
  /** offerings[0] / the legacy primary offering is ALWAYS DEFAULT_OFFERING_ID. */
  id: OfferingId;
  label: string;
  description?: string;
  /** Weekly template keyed by weekday (0 = Sunday … 6 = Saturday). */
  weekly: Record<number, DaySchedule>;
  /** Per-date schedule overrides (special hours / one-off events). */
  dateOverrides: Record<string, DaySchedule>;
  /** Individually blocked times per date (applies to every service). */
  blockedSlots: Record<string, string[]>;
}

/** Per-date service-level booking stops keyed by date -> offering -> service ids. */
export type DisabledServices = Record<string, Record<OfferingId, ServiceId[]>>;

/** The operational config that drives both admin and the public frontend. */
export interface AvailabilityConfig {
  timezone: string;
  /** How many days ahead a guest may book. */
  bookingWindowDays: number;
  minPartySize: number;
  maxPartySize: number;
  /** A slot is bookable only if it starts at least this many minutes from now. */
  leadMinutes: number;
  /**
   * Default minutes a table stays occupied per booking. Used when a service
   * does not set ServiceWindow.turnMinutes. Drives table conflicts and
   * table-derived availability/capacity windows. Defaults to 120 when omitted.
   */
  turnMinutes?: number;
  /** Weekly template keyed by weekday (0 = Sunday … 6 = Saturday). */
  weekly: Record<number, DaySchedule>;
  /** Full-day closures, e.g. holidays: ["2026-12-25"]. Tenant-wide. */
  closures: string[];
  /** Per-date schedule overrides (special hours). Keyed by "YYYY-MM-DD". */
  dateOverrides: Record<string, DaySchedule>;
  /** Individually blocked times per date (applies to every service). */
  blockedSlots: Record<string, string[]>;
  /** Manually disabled services for specific dates, used for same-day stop-taking-bookings controls. */
  disabledServices?: DisabledServices;
  /**
   * Controls the source of truth for covers capacity. "tables" preserves the
   * existing behavior: active managed tables drive capacity, with legacy service
   * capacity as fallback when no active tables exist. "manual" ignores tables
   * for availability and booking capacity and uses service/slot capacity.
   */
  capacityMode?: CapacityMode;
  /** One-day slot capacity overrides keyed by date/offering/service/time. */
  slotCapacityOverrides?: DatedSlotCapacityOverrides;
  /** Forward slot overrides keyed by offering/service/time and effective date. */
  forwardSlotCapacityOverrides?: ForwardSlotCapacityOverrides;
  /**
   * Multi-offering support. When present, this is the source of truth and the
   * top-level weekly/dateOverrides/blockedSlots mirror offerings[0] for legacy
   * readers. When absent, the system synthesizes a single "main" offering from
   * the top-level fields (see offerings.ts), so single-offering tenants and
   * pre-existing stored configs behave exactly as before.
   */
  offerings?: Offering[];
}

export type ReservationStatus =
  | "pending"
  | "confirmed"
  | "seated"
  | "completed"
  | "cancelled"
  | "no_show";

export const RESERVATION_STATUSES: ReservationStatus[] = [
  "pending",
  "confirmed",
  "seated",
  "completed",
  "cancelled",
  "no_show",
];

/** Statuses that occupy capacity (count against a slot). */
export const ACTIVE_STATUSES: ReservationStatus[] = [
  "pending",
  "confirmed",
  "seated",
  "completed",
];

export type ReservationSource = "web" | "admin" | "thefork" | "dish";

export interface Reservation {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  /** Which offering this booking belongs to. Defaults to DEFAULT_OFFERING_ID. */
  offering: OfferingId;
  service: ServiceId;
  partySize: number;
  name: string;
  email: string;
  phone: string;
  occasion?: string;
  notes?: string;
  /** Free-text/denormalized table label (kept for display + legacy bookings). */
  tableLabel?: string;
  /** FK to a managed `tables` row, when a physical table is assigned. */
  tableId?: string;
  /** All managed tables used by this booking, for joined/combo table assignments. */
  tableIds?: string[];
  /** Per-reservation turn duration override in minutes. Null clears the override (use config default). */
  durationMinsOverride?: number | null;
  status: ReservationStatus;
  source: ReservationSource;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface NewReservationInput {
  date: string;
  time: string;
  /** Offering id; when omitted, resolves to DEFAULT_OFFERING_ID. */
  offering?: OfferingId;
  service: ServiceId;
  partySize: number;
  name: string;
  email: string;
  phone: string;
  occasion?: string;
  notes?: string;
  tableLabel?: string;
  tableId?: string;
  tableIds?: string[];
  source?: ReservationSource;
  status?: ReservationStatus;
}

/* ---- Availability views returned to the frontend ---- */

export interface SlotAvailability {
  time: string;
  capacity: number;
  booked: number;
  remaining: number;
  /** Positive when imported/external or staff bookings exceed configured table capacity for this slot. */
  overbookedBy?: number;
  available: boolean;
  unavailableReason?: SlotUnavailableReason;
}

export type SlotUnavailableReason = "service_disabled" | "blocked" | "lead_time" | "capacity";

export interface ServiceAvailability {
  id: ServiceId;
  label: string;
  /** Effective table duration for this service on this date, in minutes. */
  turnMinutes: number;
  slots: SlotAvailability[];
}

export interface DayAvailability {
  date: string;
  /** The offering this availability view was computed for. */
  offering?: OfferingId;
  capacityMode?: CapacityMode;
  closed: boolean;
  past: boolean;
  full: boolean;
  services: ServiceAvailability[];
}

/** Lightweight offering descriptor for pickers (public + admin). */
export interface OfferingSummary {
  id: OfferingId;
  label: string;
  description?: string;
}

export type DayStatus = "open" | "closed" | "past" | "full";

export interface MonthDay {
  date: string;
  status: DayStatus;
}

export interface CustomerProfile {
  email: string;
  /** Taken from the most recent reservation. */
  name: string;
  phone: string;
  vip: boolean;
  staffNotes?: string;
  dietaryNotes?: string;
  /** Non-cancelled, non-no-show reservations. */
  visitCount: number;
  /** Sum of party sizes across attended reservations. */
  totalCovers: number;
  noShowCount: number;
  cancelledCount: number;
  firstVisit?: string; // YYYY-MM-DD
  lastVisit?: string;  // YYYY-MM-DD
  updatedAt?: string;
}

/** Per-reservation enrichment computed from customer history. */
export interface ReservationEnrichment {
  visitCount: number;
  customerVip: boolean;
  dietaryNotes?: string;
}

/**
 * A physical, managed table (or combinable unit). Tenant-scoped. A table is a
 * real piece of furniture, so it can host at most one party during any
 * overlapping time window regardless of offering. The optional `offering`
 * binding restricts which offering may use it (null = usable by any offering).
 */
export interface RestaurantTable {
  id: string;
  /** Restrict this table to one offering, or null = any offering. */
  offering: OfferingId | null;
  /** Display label, e.g. "12" or "Patio 3". */
  label: string;
  /** Maximum covers the table seats. */
  capacity: number;
  /** Smallest party worth seating here (avoid putting a couple on a 10-top). */
  minParty: number;
  /** Optional room/zone grouping, e.g. "Terrace". */
  zone?: string;
  /** Sort order within the floor view. */
  sortOrder: number;
  /** Whether this table may be merged with adjacent tables for big parties. */
  joinable: boolean;
  /** Soft-delete flag — inactive tables keep history but drop off pickers. */
  active: boolean;
  createdAt: string;
}

export interface NewTableInput {
  offering?: OfferingId | null;
  label: string;
  capacity: number;
  minParty?: number;
  zone?: string;
  sortOrder?: number;
  joinable?: boolean;
}

/** A table plus its current-day occupancy state (for the floor view). */
export type TableState = "free" | "reserved" | "seated" | "inactive";

export type WaitlistStatus =
  | "waiting"
  | "notified"
  | "seated"
  | "left"
  | "expired";

export const WAITLIST_STATUSES: WaitlistStatus[] = [
  "waiting",
  "notified",
  "seated",
  "left",
  "expired",
];

/** Entries still occupying a spot in the live queue. */
export const WAITLIST_ACTIVE_STATUSES: WaitlistStatus[] = ["waiting", "notified"];

/**
 * A party waiting for a table (walk-ins / overflow). Staff-facing live queue.
 * Seating an entry creates a real reservation (see seatFromWaitlist) and links
 * back via seatedReservationId.
 */
export interface WaitlistEntry {
  id: string;
  offering: OfferingId;
  date: string; // YYYY-MM-DD
  name: string;
  phone?: string;
  email?: string;
  partySize: number;
  /** Minutes quoted to the guest (heuristic on add; editable). */
  quotedWaitMin?: number;
  /** Optional physical pager identifier. */
  pagerLabel?: string;
  status: WaitlistStatus;
  notes?: string;
  /** Reservation created when this entry was seated. */
  seatedReservationId?: string;
  createdAt: string; // ISO
  notifiedAt?: string; // ISO
  seatedAt?: string; // ISO
  updatedAt: string; // ISO
}

export interface NewWaitlistInput {
  offering?: OfferingId;
  date: string;
  name: string;
  phone?: string;
  email?: string;
  partySize: number;
  quotedWaitMin?: number;
  pagerLabel?: string;
  notes?: string;
}
