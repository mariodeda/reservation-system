import type { AvailabilityConfig, ReservationSource } from "./types";

export const OVER_MAX_PARTY_MODE = "manual_confirmation" as const;

export function requiresManualConfirmationForParty(
  partySize: number,
  config: Pick<AvailabilityConfig, "maxPartySize">,
  source: ReservationSource = "web",
): boolean {
  return source === "web" && Number.isInteger(partySize) && partySize > config.maxPartySize;
}
