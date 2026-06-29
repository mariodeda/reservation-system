import type { Reservation } from "./types";
import type { TenantSettings } from "./tenant";

export type TenantEmailEvent = "bookingConfirmation" | "feedbackRequest";

const DEFAULT_FEEDBACK_DELAY_HOURS = 0;
export const MAX_FEEDBACK_DELAY_HOURS = 24 * 30;

export function normalizeFeedbackRequestDelayHours(value: unknown): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 0) return DEFAULT_FEEDBACK_DELAY_HOURS;
  return Math.min(MAX_FEEDBACK_DELAY_HOURS, n);
}

/**
 * Whether the guest actually showed up — the sole precondition under which a
 * post-visit rating request may be sent. Only "completed" qualifies: staff set
 * it once the party has dined. "pending"/"confirmed" are still upcoming,
 * "seated" is mid-visit (too early to ask), and "cancelled"/"no_show" never
 * attended. This is the single source of truth for feedback eligibility — every
 * send path funnels through it so a rating email can never reach a no-show.
 */
export function hasGuestAttended(reservation: Reservation): boolean {
  return reservation.status === "completed";
}

export function isEmailEventEnabled(settings: TenantSettings, event: TenantEmailEvent): boolean {
  if (!settings.emailEnabled) return false;
  if (event === "feedbackRequest" && settings.feedbackEnabled === false) return false;
  return settings.emailEvents?.[event] ?? (event === "feedbackRequest" ? settings.feedbackEnabled !== false : true);
}

export function isFeedbackCollectionEnabled(settings: TenantSettings): boolean {
  if (settings.feedbackEnabled === false) return false;
  return settings.emailEvents?.feedbackRequest ?? true;
}

function dateOrdinal(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 60_000);
}

function timeMinutes(time: string): number | null {
  const m = /^(\d{2}):(\d{2})/.exec(time);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function localNowMinutes(timezone: string, now: Date): number | null {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const date = `${byType.year}-${byType.month}-${byType.day}`;
  const day = dateOrdinal(date);
  const minutes = timeMinutes(`${byType.hour}:${byType.minute}`);
  return day === null || minutes === null ? null : day + minutes;
}

export function isFeedbackRequestDue(
  reservation: Reservation,
  settings: TenantSettings,
  now = new Date(),
): boolean {
  const day = dateOrdinal(reservation.date);
  const minutes = timeMinutes(reservation.time);
  const nowLocal = localNowMinutes(settings.timezone, now);
  if (day === null || minutes === null || nowLocal === null) return true;
  const delayMinutes = normalizeFeedbackRequestDelayHours(settings.feedbackRequestDelayHours) * 60;
  return nowLocal >= day + minutes + delayMinutes;
}
