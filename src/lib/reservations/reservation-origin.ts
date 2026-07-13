import type { ReservationOrigin } from "./types";

export type ReservationOriginContext =
  | "external"
  | "direct_or_unknown"
  | "same_site"
  | "unavailable";

export const RESERVATION_ORIGINS = [
  "google",
  "google_maps",
  "instagram",
  "facebook",
  "external_other",
] as const satisfies readonly ReservationOrigin[];

export const RESERVATION_ORIGIN_CONTEXTS = [
  "external",
  "direct_or_unknown",
  "same_site",
  "unavailable",
] as const satisfies readonly ReservationOriginContext[];

const ORIGIN_SET = new Set<string>(RESERVATION_ORIGINS);
const ORIGIN_CONTEXT_SET = new Set<string>(RESERVATION_ORIGIN_CONTEXTS);

export function isReservationOrigin(value: unknown): value is ReservationOrigin {
  return typeof value === "string" && ORIGIN_SET.has(value);
}

export function sanitizeReservationOrigin(value: unknown): ReservationOrigin | undefined {
  return isReservationOrigin(value) ? value : undefined;
}

export function isReservationOriginContext(value: unknown): value is ReservationOriginContext {
  return typeof value === "string" && ORIGIN_CONTEXT_SET.has(value);
}

export function sanitizeReservationOriginContext(value: unknown): ReservationOriginContext | undefined {
  return isReservationOriginContext(value) ? value : undefined;
}

export function reservationOriginInputState(value: unknown): "absent" | "valid" | "invalid" {
  if (value === undefined) return "absent";
  return isReservationOrigin(value) ? "valid" : "invalid";
}

export function reservationOriginContextInputState(value: unknown): "absent" | "valid" | "invalid" {
  if (value === undefined) return "absent";
  return isReservationOriginContext(value) ? "valid" : "invalid";
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
