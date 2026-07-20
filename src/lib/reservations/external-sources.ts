import type { ReservationSource } from "./types";

export const EXTERNAL_RESERVATION_SOURCES = ["thefork", "dish"] as const;

export type ExternalReservationSource = (typeof EXTERNAL_RESERVATION_SOURCES)[number];

export function isExternalReservationSource(source: ReservationSource): source is ExternalReservationSource {
  return (EXTERNAL_RESERVATION_SOURCES as readonly ReservationSource[]).includes(source);
}

export function externalReservationLabel(source: ExternalReservationSource): string {
  return source === "thefork" ? "TheFork" : "DISH";
}
