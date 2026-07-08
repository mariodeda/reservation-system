import {
  type AvailabilityConfig,
  DEFAULT_OFFERING_ID,
  type Offering,
  type OfferingId,
  type OfferingSummary,
} from "./types";
import { serviceLabelsFor } from "./service-catalog";

/**
 * Offering normalization — the single place that turns any stored config (legacy
 * single-schedule or new multi-offering) into a canonical list of offerings.
 *
 * A single-offering tenant is just a multi-offering tenant with exactly one
 * offering whose id is DEFAULT_OFFERING_ID ("main"). Legacy configs (no
 * `offerings`) are synthesized into one such offering from their top-level
 * weekly/dateOverrides/blockedSlots — so existing data and behavior are
 * preserved without rewriting anything on disk until the tenant next saves.
 */

/** Resolve a config into its canonical, non-empty list of offerings. */
export function getOfferings(
  config: AvailabilityConfig,
  fallbackLabel = "Dining",
): Offering[] {
  if (config.offerings && config.offerings.length > 0) {
    // Read-time defense: the primary offering's id MUST be DEFAULT_OFFERING_ID
    // so it stays in lockstep with the reservation backfill/column-default. If a
    // stored config somehow has a different primary id (a write that bypassed
    // sanitizeConfig, a hand-edit, a future migration), coalesce it here rather
    // than orphaning every "main" reservation's capacity.
    const [first, ...rest] = config.offerings;
    if (first.id === DEFAULT_OFFERING_ID) return config.offerings;
    return [{ ...first, id: DEFAULT_OFFERING_ID }, ...rest];
  }
  return [
    {
      id: DEFAULT_OFFERING_ID,
      label: fallbackLabel,
      weekly: config.weekly,
      dateOverrides: config.dateOverrides,
      blockedSlots: config.blockedSlots,
    },
  ];
}

/**
 * Resolve a single offering by id. Missing/empty/unknown ids coalesce to the
 * primary offering — this is what makes every legacy call site (and any
 * reservation row whose offering is NULL/"") resolve to "main".
 */
export function getOffering(
  config: AvailabilityConfig,
  offeringId?: OfferingId | null,
): Offering {
  const offerings = getOfferings(config);
  const wanted = offeringId && offeringId.length > 0 ? offeringId : DEFAULT_OFFERING_ID;
  return offerings.find((o) => o.id === wanted) ?? offerings[0];
}

/** True when the tenant exposes more than one offering (drives the UI pickers). */
export function isMultiOffering(config: AvailabilityConfig): boolean {
  return getOfferings(config).length > 1;
}

/** Lightweight descriptors for offering pickers. */
export function offeringSummaries(
  config: AvailabilityConfig,
  fallbackLabel = "Dining",
): OfferingSummary[] {
  const servicesByOffering = new Map(offeringServiceMap(config, fallbackLabel).map((o) => [o.id, o.services]));
  return getOfferings(config, fallbackLabel).map((o) => ({
    id: o.id,
    label: o.label,
    description: o.description,
    services: servicesByOffering.get(o.id) ?? [],
  }));
}

/** Normalize a possibly-missing reservation offering to the primary id. */
export function offeringOf(value?: OfferingId | null): OfferingId {
  return value && value.length > 0 ? value : DEFAULT_OFFERING_ID;
}

/** An offering with the flat set of service (time-band) ids/labels it uses. */
export interface OfferingServices {
  id: OfferingId;
  label: string;
  services: { id: string; label: string; labelEn?: string; labelIt?: string }[];
}

/**
 * Build the per-offering service list (deduped across weekly + overrides) for
 * admin pickers. Service ids are only unique within an offering, so callers
 * must key by (offering, service) — never by service id alone.
 */
export function offeringServiceMap(
  config: AvailabilityConfig,
  fallbackLabel = "Dining",
): OfferingServices[] {
  return getOfferings(config, fallbackLabel).map((o) => {
    const m = new Map<string, { label: string; labelEn: string; labelIt: string }>();
    for (const day of [...Object.values(o.weekly), ...Object.values(o.dateOverrides)]) {
      day.services?.forEach((s) => m.set(s.id, { label: s.label, ...serviceLabelsFor(s) }));
    }
    return { id: o.id, label: o.label, services: [...m].map(([id, labels]) => ({ id, ...labels })) };
  });
}
