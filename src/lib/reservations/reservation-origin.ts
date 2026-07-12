import type { ReservationOrigin } from "./types";

export const RESERVATION_ORIGINS = [
  "google",
  "google_maps",
  "instagram",
  "facebook",
  "external_other",
] as const satisfies readonly ReservationOrigin[];

const ORIGIN_SET = new Set<string>(RESERVATION_ORIGINS);

export function isReservationOrigin(value: unknown): value is ReservationOrigin {
  return typeof value === "string" && ORIGIN_SET.has(value);
}

export function sanitizeReservationOrigin(value: unknown): ReservationOrigin | undefined {
  return isReservationOrigin(value) ? value : undefined;
}

export function reservationOriginLabel(origin: ReservationOrigin): string {
  switch (origin) {
    case "google":
      return "Google";
    case "google_maps":
      return "Google Maps";
    case "instagram":
      return "Instagram";
    case "facebook":
      return "Facebook";
    case "external_other":
      return "Other referral";
  }
}
