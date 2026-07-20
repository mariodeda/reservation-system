import type { AvailabilityConfig, DayAvailability, OfferingSummary } from "./types";
import { OVER_MAX_PARTY_MODE } from "./booking-policy";

export interface PublicReservationPolicy {
  maxPartySize: number;
  overMaxPartyMode: typeof OVER_MAX_PARTY_MODE;
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

export interface PublicDayAvailabilityResponse extends DayAvailability {
  offerings: OfferingSummary[];
  reservationPolicy: PublicReservationPolicy;
}

export function publicReservationPolicy(config: Pick<AvailabilityConfig, "maxPartySize">): PublicReservationPolicy {
  return { maxPartySize: config.maxPartySize, overMaxPartyMode: OVER_MAX_PARTY_MODE };
}
