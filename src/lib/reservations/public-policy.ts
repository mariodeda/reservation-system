import type { AvailabilityConfig, OfferingSummary } from "./types";

export interface PublicReservationPolicy {
  maxPartySize: number;
}

export interface PublicTenantResponse {
  name: string;
  theme?: { primary?: string; onPrimary?: string };
  reservationPolicy: PublicReservationPolicy;
}

export interface PublicOfferingsResponse {
  offerings: OfferingSummary[];
  reservationPolicy: PublicReservationPolicy;
}

export function publicReservationPolicy(config: Pick<AvailabilityConfig, "maxPartySize">): PublicReservationPolicy {
  return { maxPartySize: config.maxPartySize };
}
