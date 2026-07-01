import { createFeedbackToken, getFeedbackByReservation } from "./feedback-store";
import { sendFeedbackRequestEmail } from "./email";
import { hasGuestAttended, isEmailEventEnabled, isFeedbackRequestDue } from "./email-policy";
import type { Tenant } from "./tenant";
import type { Reservation } from "./types";
import { recordAppEvent } from "@/lib/observability/app-event-store";

export async function sendFeedbackRequestForReservation(
  reservation: Reservation,
  tenant: Tenant,
): Promise<{ sent: boolean; skipped?: boolean }> {
  if (
    !hasGuestAttended(reservation) ||
    !reservation.email ||
    !isEmailEventEnabled(tenant.settings, "feedbackRequest") ||
    !isFeedbackRequestDue(reservation, tenant.settings)
  ) {
    return { sent: false, skipped: true };
  }

  const existing = await getFeedbackByReservation(reservation.id).catch(() => null);
  if (existing) return { sent: false, skipped: true };

  const record = await createFeedbackToken(reservation.id, tenant.id);
  const siteUrl = tenant.settings.url?.replace(/\/$/, "") ?? "";
  const feedbackUrl = `${siteUrl}/feedback/${record.token}`;
  const result = await sendFeedbackRequestEmail(reservation, tenant, feedbackUrl);
  await recordAppEvent({
    level: result.sent ? "info" : result.error ? "error" : "warn",
    event: result.sent ? "feedback.request.sent" : "feedback.request.skipped_or_failed",
    surface: "system",
    tenantId: tenant.id,
    actorType: "system",
    reservationId: reservation.id,
    status: result.sent ? 200 : 0,
    reason: result.error ?? (result.skipped ? "skipped" : undefined),
    metadata: { date: reservation.date, time: reservation.time },
  });
  return result;
}

export async function processDueFeedbackRequests(
  reservations: Reservation[],
  tenant: Tenant,
): Promise<void> {
  if (!isEmailEventEnabled(tenant.settings, "feedbackRequest")) return;
  const due = reservations.filter((r) => hasGuestAttended(r) && r.email && isFeedbackRequestDue(r, tenant.settings));
  if (!due.length) return;
  const results = await Promise.allSettled(due.map((r) => sendFeedbackRequestForReservation(r, tenant)));
  for (const result of results) {
    if (result.status === "rejected") console.error("[feedback] due request failed:", result.reason);
  }
}
