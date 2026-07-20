import type { ServiceId, ServiceWindow } from "./types";

export interface ServiceName {
  id: ServiceId;
  en: string;
  it: string;
}

export const SERVICE_NAME_POOL: ServiceName[] = [
  { id: "breakfast", en: "Breakfast", it: "Colazione" },
  { id: "brunch", en: "Brunch", it: "Brunch" },
  { id: "lunch", en: "Lunch", it: "Pranzo" },
  { id: "aperitivo", en: "Aperitivo", it: "Aperitivo" },
  { id: "dinner", en: "Dinner", it: "Cena" },
  { id: "late_night", en: "Late night", it: "Dopocena" },
  { id: "tasting", en: "Tasting menu", it: "Menu degustazione" },
  { id: "event", en: "Event", it: "Evento" },
];

const SERVICE_BY_ID = new Map(SERVICE_NAME_POOL.map((service) => [service.id, service]));

export function serviceNameFor(id: ServiceId | undefined, fallback?: string): ServiceName {
  const known = id ? SERVICE_BY_ID.get(id) : undefined;
  if (known) return known;
  const label = fallback?.trim() || id || "Service";
  const fallbackId = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "service";
  return { id: id ?? fallbackId, en: label, it: label };
}

export function canonicalServiceLabel(id: ServiceId, fallback: string): string {
  return serviceNameFor(id, fallback).en;
}

export function serviceLabelsFor(window: Pick<ServiceWindow, "id" | "label">): { labelEn: string; labelIt: string } {
  const service = serviceNameFor(window.id, window.label);
  return { labelEn: service.en, labelIt: service.it };
}

export function localizedServiceLabel(window: Pick<ServiceWindow, "id" | "label">, locale?: string): string {
  const service = serviceNameFor(window.id, window.label);
  return locale?.toLowerCase().startsWith("it") ? service.it : service.en;
}
