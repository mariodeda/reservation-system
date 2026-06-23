import { createFeedbackToken, getFeedbackByReservation } from "./feedback-store";
import { sendFeedbackRequestEmail } from "./email";
import { isEmailEventEnabled, isFeedbackRequestDue } from "./email-policy";
import type { Tenant } from "./tenant";
import type { Reservation } from "./types";

export async function sendFeedbackRequestForReservation(
  reservation: Reservation,
  tenant: Tenant,
): Promise<{ sent: boolean; skipped?: boolean }> {
  if (
    reservation.status !== "completed" ||
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
  return sendFeedbackRequestEmail(reservation, tenant, feedbackUrl);
}

export async function processDueFeedbackRequests(
  reservations: Reservation[],
  tenant: Tenant,
): Promise<void> {
  if (!isEmailEventEnabled(tenant.settings, "feedbackRequest")) return;
  const due = reservations.filter((r) => r.status === "completed" && r.email && isFeedbackRequestDue(r, tenant.settings));
  if (!due.length) return;
  const results = await Promise.allSettled(due.map((r) => sendFeedbackRequestForReservation(r, tenant)));
  for (const result of results) {
    if (result.status === "rejected") console.error("[feedback] due request failed:", result.reason);
  }
}
