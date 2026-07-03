import { generateSlots, scheduleForDate, toMinutes } from "./availability";
import { fetchTheForkCustomer, fetchTheForkReservation, fetchTheForkReservationIds, type TheForkReservationDetail } from "./thefork-client";
import { getOffering } from "./offerings";
import { getStore } from "./store";
import type { AvailabilityConfig, Reservation, ReservationStatus, ServiceId } from "./types";
import {
  findExternalReservation,
  getTheForkIntegration,
  markTheForkSyncResult,
  upsertExternalReservationLink,
  type TheForkIntegration,
} from "./thefork-store";
import { emitReservation } from "./events";
import { recordAppEvent } from "@/lib/observability/app-event-store";
import { safeError } from "@/lib/observability/logger";

export interface TheForkSyncResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
}

export interface TheForkSyncOptions {
  startDate: string;
  endDate: string;
  filterBy?: "updatedDate" | "mealDate";
  emitEvents?: boolean;
  skipExisting?: boolean;
  deadlineAt?: number;
  trigger?: "manual" | "first" | "cron" | "webhook" | "system";
}

function safeText(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function localParts(iso: string, timezone: string): { date: string; time: string } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function mapStatus(reservation: TheForkReservationDetail): ReservationStatus {
  if (reservation.status === "CANCELED" || reservation.status === "REFUSED") return "cancelled";
  if (reservation.status === "NO_SHOW") return "no_show";
  if (reservation.mealStatus === "LEFT") return "completed";
  if (reservation.mealStatus === "ARRIVED" || reservation.mealStatus === "SEATED" || reservation.mealStatus === "PARTIALLY_ARRIVED") return "seated";
  if (reservation.status === "REQUESTED") return "pending";
  return "confirmed";
}

function inferService(config: AvailabilityConfig, date: string, time: string): ServiceId {
  const offering = getOffering(config, "main");
  const schedule = scheduleForDate(config, date, offering.id);
  if (schedule.closed) return "thefork";
  const exact = schedule.services.find((s) => generateSlots(s).includes(time));
  if (exact) return exact.id;
  const mins = toMinutes(time);
  const containing = schedule.services.find((s) => mins >= toMinutes(s.start) && mins <= toMinutes(s.end));
  return containing?.id ?? "thefork";
}

function joinNotes(parts: Array<string | null | undefined>): string | undefined {
  const lines = parts.map((p) => p?.trim()).filter(Boolean) as string[];
  return lines.length ? lines.join("\n") : undefined;
}

function compactExternalValue(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value.trim().slice(0, 300) || undefined;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const json = JSON.stringify(value);
    return json && json !== "{}" && json !== "[]" ? json.slice(0, 500) : undefined;
  } catch {
    return undefined;
  }
}

function changed(existing: Reservation, patch: Partial<Reservation>): boolean {
  return Object.entries(patch).some(([key, value]) => (existing as unknown as Record<string, unknown>)[key] !== value);
}

export async function importTheForkReservation(
  integration: TheForkIntegration,
  reservationUuid: string,
  opts: { emitEvents?: boolean } = {},
): Promise<"created" | "updated" | "skipped"> {
  if (!integration.enabled) return "skipped";
  const store = getStore().forTenant(integration.tenantId);
  const config = await store.getConfig();
  const detail = await fetchTheForkReservation(integration, reservationUuid);
  const externalId = safeText(detail.reservationUuid, 80) || reservationUuid;
  const detailRestaurantUuid = safeText(detail.restaurantUuid, 80);
  if (integration.restaurantUuid && detailRestaurantUuid !== integration.restaurantUuid) {
    throw new Error("TheFork reservation belongs to a different restaurant.");
  }
  const mealDate = safeText(detail.mealDate, 80);
  if (!mealDate) return "skipped";
  const customerUuid = safeText(detail.customerUuid, 80);
  const customer = customerUuid ? await fetchTheForkCustomer(integration, customerUuid) : null;
  const local = localParts(mealDate, config.timezone);
  if (!local) return "skipped";
  const { date, time } = local;
  const status = mapStatus(detail);
  const firstName = safeText(customer?.firstName, 120);
  const lastName = safeText(customer?.lastName, 120);
  const name = `${firstName} ${lastName}`.trim() || "TheFork guest";
  const notes = joinNotes([
    "External source: TheFork",
    `TheFork reservation: ${externalId}`,
    safeText(detail.status, 40) ? `TheFork status: ${safeText(detail.status, 40)}` : undefined,
    safeText(detail.mealStatus, 40) ? `TheFork meal status: ${safeText(detail.mealStatus, 40)}` : undefined,
    safeText(detail.customerNote) ? `Guest note: ${safeText(detail.customerNote)}` : undefined,
    safeText(detail.restaurantNote) ? `Restaurant note: ${safeText(detail.restaurantNote)}` : undefined,
    safeText(detail.reservationChannel, 120) ? `TheFork channel: ${safeText(detail.reservationChannel, 120)}` : undefined,
    compactExternalValue(detail.offerDetails) ? `TheFork offer: ${compactExternalValue(detail.offerDetails)}` : undefined,
    compactExternalValue(detail.customFields) ? `TheFork custom fields: ${compactExternalValue(detail.customFields)}` : undefined,
    compactExternalValue(detail.utmTrackingInformation) ? `TheFork tracking: ${compactExternalValue(detail.utmTrackingInformation)}` : undefined,
    compactExternalValue(detail.billAmount) ? `TheFork bill amount: ${compactExternalValue(detail.billAmount)}` : undefined,
  ]);
  const patch: Partial<Reservation> = {
    date,
    time,
    offering: "main",
    service: inferService(config, date, time),
    partySize: Math.max(1, Math.trunc(Number(detail.partySize)) || 1),
    name,
    email: safeText(customer?.email, 254),
    phone: safeText(customer?.phone, 80),
    notes,
    status,
    source: "thefork",
  };

  const existingId = await findExternalReservation(integration.tenantId, "thefork", externalId);
  let reservation: Reservation;
  let outcome: "created" | "updated" | "skipped";
  if (existingId) {
    const existing = await store.getReservation(existingId);
    if (!existing) {
      reservation = await store.createReservation({
        date,
        time,
        offering: "main",
        service: patch.service!,
        partySize: patch.partySize!,
        name,
        email: patch.email ?? "",
        phone: patch.phone ?? "",
        notes,
        source: "thefork",
        status,
      });
      outcome = "created";
    } else if (changed(existing, patch)) {
      reservation = (await store.updateReservation(existing.id, patch)) ?? existing;
      outcome = "updated";
    } else {
      reservation = existing;
      outcome = "skipped";
    }
  } else {
    reservation = await store.createReservation({
      date,
      time,
      offering: "main",
      service: patch.service!,
      partySize: patch.partySize!,
      name,
      email: patch.email ?? "",
      phone: patch.phone ?? "",
      notes,
      source: "thefork",
      status,
    });
    outcome = "created";
  }

  await upsertExternalReservationLink({
    tenantId: integration.tenantId,
    provider: "thefork",
    externalId,
    reservationId: reservation.id,
    externalRestaurantId: detailRestaurantUuid || undefined,
    externalCustomerId: customerUuid || undefined,
    externalStatus: safeText(detail.status, 40) || undefined,
    externalMealStatus: safeText(detail.mealStatus, 40) || undefined,
    externalUpdatedAt: safeText(detail.updatedAt, 40) || undefined,
    raw: detail,
  });

  if (outcome !== "skipped" && opts.emitEvents !== false) {
    emitReservation({
      type: outcome === "created" ? "reservation.created" : "reservation.updated",
      tenantId: integration.tenantId,
      id: reservation.id,
      name: reservation.name,
      partySize: reservation.partySize,
      date: reservation.date,
      time: reservation.time,
      service: reservation.service,
      offering: reservation.offering,
      source: "thefork",
    });
  }
  return outcome;
}

export async function syncTheForkReservations(
  tenantId: string,
  opts: TheForkSyncOptions,
): Promise<TheForkSyncResult> {
  const integration = await getTheForkIntegration(tenantId);
  if (!integration?.enabled) throw new Error("TheFork integration is not enabled.");
  if (!integration.restaurantUuid) throw new Error("TheFork sync requires a tenant-specific restaurant UUID.");
  const result: TheForkSyncResult = { imported: 0, updated: 0, skipped: 0, errors: 0 };
  const provider = "thefork";
  const trigger = opts.trigger ?? "system";
  const assertWithinDeadline = () => {
    if (opts.deadlineAt && Date.now() >= opts.deadlineAt) {
      throw new Error("TheFork sync timed out before completing. Re-run it to continue; existing imports will be skipped.");
    }
  };
  try {
    await recordAppEvent({
      level: "info",
      event: "external_sync.started",
      surface: "system",
      actorType: "system",
      tenantId,
      metadata: {
        provider,
        trigger,
        startDate: opts.startDate,
        endDate: opts.endDate,
        filterBy: opts.filterBy ?? "updatedDate",
        skipExisting: Boolean(opts.skipExisting),
        restaurantUuid: integration.restaurantUuid,
      },
    });
    let page = 1;
    for (;;) {
      assertWithinDeadline();
      const data = await fetchTheForkReservationIds(integration, { ...opts, page, limit: 100 });
      for (const id of data.data) {
        try {
          assertWithinDeadline();
          if (opts.skipExisting && await findExternalReservation(integration.tenantId, "thefork", id)) {
            result.skipped += 1;
            continue;
          }
          const outcome = await importTheForkReservation(integration, id, { emitEvents: opts.emitEvents });
          if (outcome === "created") result.imported += 1;
          else if (outcome === "updated") result.updated += 1;
          else result.skipped += 1;
        } catch (err) {
          console.error("[thefork] import failed", id, err);
          await recordAppEvent({
            level: "warn",
            event: "external_sync.reservation_failed",
            surface: "system",
            actorType: "system",
            tenantId,
            reason: err instanceof Error ? err.message : "TheFork reservation import failed.",
            metadata: {
              provider,
              trigger,
              externalId: id,
              error: safeError(err),
              page,
            },
          });
          result.errors += 1;
        }
      }
      if (page * data.limit >= data.totalCount || data.data.length === 0) break;
      page += 1;
    }
    await markTheForkSyncResult(tenantId, result.errors ? `${result.errors} reservation imports failed.` : undefined);
    await recordAppEvent({
      level: result.errors ? "warn" : "info",
      event: "external_sync.completed",
      surface: "system",
      actorType: "system",
      tenantId,
      reason: result.errors ? `${result.errors} reservation imports failed.` : undefined,
      metadata: {
        provider,
        trigger,
        startDate: opts.startDate,
        endDate: opts.endDate,
        filterBy: opts.filterBy ?? "updatedDate",
        imported: result.imported,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
      },
    });
    return result;
  } catch (err) {
    await markTheForkSyncResult(tenantId, err instanceof Error ? err.message : "TheFork sync failed.");
    await recordAppEvent({
      level: "error",
      event: "external_sync.failed",
      surface: "system",
      actorType: "system",
      tenantId,
      reason: err instanceof Error ? err.message : "TheFork sync failed.",
      metadata: {
        provider,
        trigger,
        startDate: opts.startDate,
        endDate: opts.endDate,
        filterBy: opts.filterBy ?? "updatedDate",
        imported: result.imported,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
        error: safeError(err),
      },
    });
    throw err;
  }
}
