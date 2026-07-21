import { sendFeedbackRequestEmail } from "./email";
import { hasGuestAttended, isEmailEventEnabled, isFeedbackAutoSendEnabled, isFeedbackRequestDue } from "./email-policy";
import { hasSentEmail, withEmailSendLock } from "./email-log-store";
import { listFeedbackRequestCandidates } from "./mysql-store";
import type { Tenant } from "./tenant";
import { getTenantStore } from "./tenant-store";
import type { Reservation } from "./types";
import { recordAppEvent } from "@/lib/observability/app-event-store";
import { isExternalReservationSource } from "./external-sources";
import { AUTOMATED_EMAIL_CONCURRENCY, settleLimited } from "./automation-batch";

export const FEEDBACK_AUTOMATION_LOOKBACK_DAYS = 7;

function localDateInTimezone(timezone: string, now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (byType.year && byType.month && byType.day) return `${byType.year}-${byType.month}-${byType.day}`;
  } catch {
    // Fall through to UTC for invalid legacy timezone data.
  }
  return now.toISOString().slice(0, 10);
}

export function feedbackAutomationCutoffDate(
  timezone: string,
  now = new Date(),
  lookbackDays = FEEDBACK_AUTOMATION_LOOKBACK_DAYS,
): string {
  const localDate = localDateInTimezone(timezone, now);
  const [year, month, day] = localDate.split("-").map(Number);
  const cutoff = new Date(Date.UTC(year, month - 1, day - Math.max(0, Math.trunc(lookbackDays))));
  return cutoff.toISOString().slice(0, 10);
}

export async function sendFeedbackRequestForReservation(
  reservation: Reservation,
  tenant: Tenant,
): Promise<{ sent: boolean; skipped?: boolean }> {
  if (
    isExternalReservationSource(reservation.source) ||
    !hasGuestAttended(reservation) ||
    !reservation.email ||
    !tenant.settings.reviewUrl ||
    !isEmailEventEnabled(tenant.settings, "feedbackRequest") ||
    !isFeedbackAutoSendEnabled(tenant.settings) ||
    !isFeedbackRequestDue(reservation, tenant.settings)
  ) {
    return { sent: false, skipped: true };
  }

  return withEmailSendLock(tenant.id, reservation.id, "feedbackRequest", async () => {
    const alreadySent = await hasSentEmail(reservation.id, "feedbackRequest").catch(() => false);
    if (alreadySent) return { sent: false, skipped: true };

    const result = await sendFeedbackRequestEmail(reservation, tenant);
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
  });
}

export async function processDueFeedbackRequests(
  reservations: Reservation[],
  tenant: Tenant,
): Promise<{ processed: number; sent: number; skipped: number; failed: number }> {
  const empty = { processed: 0, sent: 0, skipped: 0, failed: 0 };
  if (
    !tenant.settings.reviewUrl ||
    !isEmailEventEnabled(tenant.settings, "feedbackRequest") ||
    !isFeedbackAutoSendEnabled(tenant.settings)
  ) {
    return empty;
  }
  const due = reservations.filter((r) => hasGuestAttended(r) && r.email && isFeedbackRequestDue(r, tenant.settings));
  if (!due.length) return empty;
  const results = await settleLimited(due, AUTOMATED_EMAIL_CONCURRENCY, (r) =>
    sendFeedbackRequestForReservation(r, tenant),
  );
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const result of results) {
    if (result.status === "rejected") {
      failed += 1;
      console.error("[feedback] due request failed:", result.reason);
    } else if (result.value.sent) {
      sent += 1;
    } else if (result.value.skipped) {
      skipped += 1;
    }
  }
  return { processed: due.length, sent, skipped, failed };
}

export interface FeedbackCronTenantResult {
  tenantId: string;
  tenantName: string;
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
}

export async function runDueFeedbackRequestCron(): Promise<FeedbackCronTenantResult[]> {
  const tenants = (await getTenantStore().list()).filter((tenant) => tenant.status === "active");
  const results: FeedbackCronTenantResult[] = [];
  for (const tenant of tenants) {
    if (
      !tenant.settings.reviewUrl ||
      !isEmailEventEnabled(tenant.settings, "feedbackRequest") ||
      !isFeedbackAutoSendEnabled(tenant.settings)
    ) {
      continue;
    }
    const candidates = await listFeedbackRequestCandidates(
      tenant.id,
      500,
      feedbackAutomationCutoffDate(tenant.settings.timezone),
    );
    const summary = await processDueFeedbackRequests(candidates, tenant);
    if (summary.processed > 0 || summary.failed > 0) {
      results.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        ...summary,
      });
    }
  }
  return results;
}
