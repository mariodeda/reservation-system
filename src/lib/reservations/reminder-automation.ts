import { sendReservationReminderEmail } from "./email";
import { hasSentEmail, withEmailSendLock } from "./email-log-store";
import { isEmailEventEnabled, isReservationReminderDue } from "./email-policy";
import { getOfferings } from "./offerings";
import type { Tenant } from "./tenant";
import { getTenantStore } from "./tenant-store";
import type { AvailabilityConfig, Reservation } from "./types";
import { getStore } from "./store";
import { isExternalReservationSource } from "./external-sources";
import { localizedServiceLabel } from "./service-catalog";
import { AUTOMATED_EMAIL_CONCURRENCY, settleLimited } from "./automation-batch";

export interface ReminderCronTenantResult {
  tenantId: string;
  tenantName: string;
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
}

function serviceLabel(reservation: Reservation, config: AvailabilityConfig, tenant: Tenant): string | undefined {
  const offerings = getOfferings(config, tenant.name);
  const offering = offerings.find((o) => o.id === reservation.offering);
  const services = offering
    ? (offering.dateOverrides[reservation.date]?.services ?? offering.weekly[new Date(`${reservation.date}T12:00:00Z`).getUTCDay()]?.services)
    : undefined;
  const service = services?.find((s) => s.id === reservation.service);
  const label = service ? localizedServiceLabel(service, tenant.settings.locale) : undefined;
  return offerings.length > 1 && offering?.label ? (label ? `${offering.label} · ${label}` : offering.label) : label;
}

export async function sendReminderForReservation(
  reservation: Reservation,
  tenant: Tenant,
  config: AvailabilityConfig,
): Promise<{ sent: boolean; skipped?: boolean }> {
  if (
    isExternalReservationSource(reservation.source) ||
    !reservation.email ||
    !isEmailEventEnabled(tenant.settings, "reservationReminder") ||
    !isReservationReminderDue(reservation, tenant.settings)
  ) {
    return { sent: false, skipped: true };
  }

  return withEmailSendLock(tenant.id, reservation.id, "reservationReminder", async () => {
    const alreadySent = await hasSentEmail(reservation.id, "reservationReminder").catch(() => false);
    if (alreadySent) return { sent: false, skipped: true };
    return sendReservationReminderEmail(reservation, tenant, serviceLabel(reservation, config, tenant), config);
  });
}

export async function processDueReservationReminders(
  reservations: Reservation[],
  tenant: Tenant,
  config: AvailabilityConfig,
): Promise<{ processed: number; sent: number; skipped: number; failed: number }> {
  const empty = { processed: 0, sent: 0, skipped: 0, failed: 0 };
  if (!isEmailEventEnabled(tenant.settings, "reservationReminder")) return empty;
  const due = reservations.filter((r) => r.email && isReservationReminderDue(r, tenant.settings));
  if (!due.length) return empty;
  const results = await settleLimited(due, AUTOMATED_EMAIL_CONCURRENCY, (r) =>
    sendReminderForReservation(r, tenant, config),
  );
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const result of results) {
    if (result.status === "rejected") {
      failed += 1;
      console.error("[reminders] due reminder failed:", result.reason);
    } else if (result.value.sent) {
      sent += 1;
    } else if (result.value.skipped) {
      skipped += 1;
    }
  }
  return { processed: due.length, sent, skipped, failed };
}

export async function runDueReservationReminderCron(): Promise<ReminderCronTenantResult[]> {
  const tenants = (await getTenantStore().list()).filter((tenant) => tenant.status === "active");
  const results: ReminderCronTenantResult[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const inThirtyOneDays = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  for (const tenant of tenants) {
    if (!isEmailEventEnabled(tenant.settings, "reservationReminder")) continue;
    const store = getStore().forTenant(tenant.id);
    const [config, reservations] = await Promise.all([
      store.getConfig(),
      store.listReservations({ from: today, to: inThirtyOneDays }),
    ]);
    const active = reservations.filter((r) =>
      (r.status === "pending" || r.status === "confirmed") &&
      !isExternalReservationSource(r.source),
    );
    const summary = await processDueReservationReminders(active, tenant, config);
    if (summary.processed > 0 || summary.failed > 0) {
      results.push({ tenantId: tenant.id, tenantName: tenant.name, ...summary });
    }
  }
  return results;
}
