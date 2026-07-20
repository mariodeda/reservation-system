import type { Tenant } from "./tenant";
import type { AvailabilityConfig, Reservation } from "./types";
import { getOfferings } from "./offerings";
import { scheduleForDate } from "./availability";
import { localizedServiceLabel } from "./service-catalog";

export function reservationEmailServiceLabel(
  reservation: Pick<Reservation, "date" | "offering" | "service">,
  tenant: Pick<Tenant, "name" | "settings">,
  config: AvailabilityConfig,
): string | undefined {
  const offeringId = reservation.offering || "main";
  const serviceWindow = scheduleForDate(config, reservation.date, offeringId).services.find(
    (s) => s.id === reservation.service,
  );
  const serviceLabel = serviceWindow ? localizedServiceLabel(serviceWindow, tenant.settings.locale) : undefined;
  const offerings = getOfferings(config, tenant.name);
  const offeringLabel = offerings.find((o) => o.id === offeringId)?.label;
  if (offerings.length <= 1 || !offeringLabel) return serviceLabel;
  return serviceLabel ? `${offeringLabel} · ${serviceLabel}` : offeringLabel;
}
