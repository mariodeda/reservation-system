import type { OfferingServices } from "@/lib/reservations/offerings";

export function serviceLabelFromOfferings(
  offerings: OfferingServices[],
  offeringId?: string | null,
  serviceId?: string | null,
): string {
  if (!serviceId) return "";
  const offering = offerings.find((o) => o.id === (offeringId || "main"));
  return offering?.services.find((s) => s.id === serviceId)?.label ?? serviceId;
}
