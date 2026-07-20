import { randomUUID } from "node:crypto";
import type {
  AvailabilityConfig,
  NewReservationInput,
  Reservation,
  ReservationStatus,
} from "./types";
import { offeringOf } from "./offerings";
import { MySqlStore } from "./mysql-store";
import { sanitizeReservationOrigin } from "./reservation-origin";

/**
 * Storage interface — the rest of the system depends only on this.
 */
export interface ReservationStore {
  getConfig(): Promise<AvailabilityConfig>;
  saveConfig(config: AvailabilityConfig): Promise<AvailabilityConfig>;
  listReservations(filter?: ReservationFilter): Promise<Reservation[]>;
  searchReservations(query: string, filter?: ReservationSearchFilter): Promise<Reservation[]>;
  getReservation(id: string): Promise<Reservation | null>;
  createReservation(input: NewReservationInput): Promise<Reservation>;
  /**
   * Create only if `validate` (run atomically against the current data) passes.
   * Closes the read-then-write capacity race for concurrent bookings.
   */
  createReservationChecked(
    input: NewReservationInput,
    validate: (existing: Reservation[]) => string | null,
  ): Promise<{ reservation?: Reservation; error?: string }>;
  updateReservation(
    id: string,
    patch: Partial<Reservation>,
  ): Promise<Reservation | null>;
  deleteReservation(id: string): Promise<boolean>;
  /** Find reservations matching BOTH normalized email AND phone. Used for guest self-service lookup. */
  findByContact(email: string, phone: string): Promise<Reservation[]>;
  /** Count active reservations from a date onward that match either normalized email or phone. */
  countActiveByContact(from: string, email: string, phone: string): Promise<number>;
}

export interface ReservationFilter {
  date?: string;
  from?: string;
  to?: string;
  status?: ReservationStatus;
}

export interface ReservationSearchFilter {
  status?: ReservationStatus;
  limit?: number;
}

/**
 * A backend selects/creates a tenant-scoped {@link ReservationStore}. Every
 * caller must scope to a tenant before touching data.
 */
export interface StoreBackend {
  forTenant(tenantId: string): ReservationStore;
}

const tenantStores = new Map<string, ReservationStore>();

const backend: StoreBackend = {
  forTenant(tenantId: string): ReservationStore {
    let s = tenantStores.get(tenantId);
    if (!s) {
      s = new MySqlStore(tenantId);
      tenantStores.set(tenantId, s);
    }
    return s;
  },
};

export function getStore(): StoreBackend {
  return backend;
}

/** Test-only: drop cached per-tenant store instances. */
export function resetStoreCache(): void {
  tenantStores.clear();
}

export function buildReservation(input: NewReservationInput): Reservation {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    date: input.date,
    time: input.time,
    offering: offeringOf(input.offering),
    service: input.service,
    partySize: input.partySize,
    name: input.name.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    occasion: input.occasion?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    tableLabel: input.tableLabel?.trim() || undefined,
    tableId: input.tableId || undefined,
    tableIds: input.tableIds?.length ? input.tableIds : input.tableId ? [input.tableId] : undefined,
    status: input.status ?? (input.source === "admin" ? "confirmed" : "pending"),
    source: input.source ?? "web",
    reservationOrigin: input.source === "web" || input.source === undefined
      ? sanitizeReservationOrigin(input.reservationOrigin)
      : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

/** A short, human-friendly booking reference derived from the id. */
export function referenceOf(id: string): string {
  return id.replace(/-/g, "").slice(0, 6).toUpperCase();
}
