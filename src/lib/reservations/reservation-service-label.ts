import { scheduleForDate } from "./availability";
import { getOfferings, offeringServiceMap } from "./offerings";
import type { AvailabilityConfig, Reservation } from "./types";

export function reservationServiceDisplayLabel(
  reservation: Pick<Reservation, "date" | "offering" | "service">,
  config: AvailabilityConfig,
  fallbackOfferingLabel = "Dining",
): string | undefined {
  const offeringId = reservation.offering || "main";
  const serviceWindow = scheduleForDate(config, reservation.date, offeringId).services.find(
    (s) => s.id === reservation.service,
  );
  const serviceLabel = serviceWindow?.label ??
    offeringServiceMap(config, fallbackOfferingLabel)
      .find((o) => o.id === offeringId)
      ?.services.find((s) => s.id === reservation.service)
      ?.label;
  const offerings = getOfferings(config, fallbackOfferingLabel);
  const offeringLabel = offerings.find((o) => o.id === offeringId)?.label;
  if (offerings.length <= 1 || !offeringLabel) return serviceLabel;
  return serviceLabel ? `${offeringLabel} · ${serviceLabel}` : offeringLabel;
}
