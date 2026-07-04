import { addDays, generateSlots, nowInTz, scheduleForDate, toMinutes } from "./availability";
import { DishClient, parseDishReservationDetail, parseDishReservationList, type DishReservationListItem } from "./dish-client";
import { getDishIntegration, listEnabledDishIntegrations, markDishSyncResult, type DishIntegration } from "./dish-store";
import { emitReservation } from "./events";
import { getOffering } from "./offerings";
import { getStore } from "./store";
import { getTenantStore } from "./tenant-store";
import {
  findExternalReservation,
  upsertExternalReservationLink,
} from "./thefork-store";
import type { AvailabilityConfig, Reservation, ReservationStatus, ServiceId } from "./types";
import { recordAppEvent } from "@/lib/observability/app-event-store";
import { safeError } from "@/lib/observability/logger";

export interface DishSyncResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
  daysFetched?: number;
  parsedItems?: number;
  emptyDays?: number;
}

export interface DishSyncOptions {
  startDate: string;
  endDate: string;
  emitEvents?: boolean;
  skipExisting?: boolean;
  deadlineAt?: number;
  detailMode?: "new" | "always" | "never";
  trigger?: "manual" | "first" | "history60" | "cron" | "system";
}

export interface DishCronTenantResult extends DishSyncResult {
  tenantId: string;
  tenantName: string;
  startDate: string;
  endDate: string;
  ok: boolean;
  error?: string;
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

function mapStatus(status: string): ReservationStatus {
  const s = status.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (s.includes("CANCEL")) return "cancelled";
  if (s === "REJECTED") return "cancelled";
  if (s.includes("NO_SHOW") || s.includes("NOSHOW")) return "no_show";
  if (s === "DONE" || s === "COMPLETED" || s === "COMPLETE") return "completed";
  if (s === "ARRIVED" || s === "SEATED") return "seated";
  return "confirmed";
}

function inferService(config: AvailabilityConfig, date: string, time: string): ServiceId {
  const offering = getOffering(config, "main");
  const schedule = scheduleForDate(config, date, offering.id);
  if (schedule.closed) return "dish";
  const exact = schedule.services.find((s) => generateSlots(s).includes(time));
  if (exact) return exact.id;
  const mins = toMinutes(time);
  const containing = schedule.services.find((s) => mins >= toMinutes(s.start) && mins <= toMinutes(s.end));
  return containing?.id ?? "dish";
}

function changed(existing: Reservation, patch: Partial<Reservation>): boolean {
  return Object.entries(patch).some(([key, value]) => (existing as unknown as Record<string, unknown>)[key] !== value);
}

function notesFor(item: DishReservationListItem, detail?: ReturnType<typeof parseDishReservationDetail>): string | undefined {
  const parts = [
    "External source: DISH",
    item.origin ? `DISH origin: ${item.origin}` : undefined,
    item.status ? `DISH status: ${item.status}` : undefined,
    detail?.createdAt ? `DISH created: ${detail.createdAt}` : undefined,
    detail?.source ? `DISH source: ${detail.source}` : undefined,
    detail?.visits ? `DISH visits: ${detail.visits}` : undefined,
    item.notes,
    detail?.notes,
    detail?.internalGuestInformation ? `Internal guest information: ${detail.internalGuestInformation}` : undefined,
    detail?.allergies ? `Allergies: ${detail.allergies}` : undefined,
    detail?.diet ? `Diet: ${detail.diet}` : undefined,
  ].map((p) => p?.trim()).filter(Boolean) as string[];
  return [...new Set(parts)].join("\n") || undefined;
}

async function importDishItem(
  integration: DishIntegration,
  client: DishClient,
  item: DishReservationListItem,
  config: AvailabilityConfig,
  opts: { emitEvents?: boolean; skipExisting?: boolean; detailMode?: "new" | "always" | "never" },
): Promise<"created" | "updated" | "skipped"> {
  const existingId = await findExternalReservation(integration.tenantId, "dish", item.externalId);
  if (opts.skipExisting && existingId) return "skipped";

  const shouldFetchDetail = opts.detailMode === "always" || (!existingId && opts.detailMode !== "never");
  let detail: ReturnType<typeof parseDishReservationDetail> | undefined;
  if (shouldFetchDetail) {
    const html = await client.fetchReservationDetailHtml(item.editUrl);
    detail = parseDishReservationDetail(html, item.externalId);
  }

  const local = localParts(item.startDate, config.timezone);
  if (!local) return "skipped";
  const name = safeText(detail?.name, 160) || item.name || "DISH guest";
  const patch: Partial<Reservation> = {
    date: local.date,
    time: local.time,
    offering: "main",
    service: inferService(config, local.date, local.time),
    partySize: Math.max(1, Math.trunc(Number(detail?.partySize ?? item.partySize)) || 1),
    name,
    email: safeText(detail?.email || item.email, 254),
    phone: safeText(detail?.phone, 80),
    occasion: safeText(detail?.occasion, 80),
    notes: notesFor(item, detail),
    status: mapStatus(item.status),
    source: "dish",
  };

  const store = getStore().forTenant(integration.tenantId);
  let reservation: Reservation;
  let outcome: "created" | "updated" | "skipped";
  if (existingId) {
    const existing = await store.getReservation(existingId);
    if (!existing) {
      reservation = await store.createReservation({
        date: patch.date!,
        time: patch.time!,
        offering: "main",
        service: patch.service!,
        partySize: patch.partySize!,
        name,
        email: patch.email ?? "",
        phone: patch.phone ?? "",
        occasion: patch.occasion,
        notes: patch.notes,
        source: "dish",
        status: patch.status,
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
      date: patch.date!,
      time: patch.time!,
      offering: "main",
      service: patch.service!,
      partySize: patch.partySize!,
      name,
      email: patch.email ?? "",
      phone: patch.phone ?? "",
      occasion: patch.occasion,
      notes: patch.notes,
      source: "dish",
      status: patch.status,
    });
    outcome = "created";
  }

  await upsertExternalReservationLink({
    tenantId: integration.tenantId,
    provider: "dish",
    externalId: item.externalId,
    reservationId: reservation.id,
    externalStatus: item.status || undefined,
    externalMealStatus: item.origin || undefined,
    externalUpdatedAt: detail?.createdAt,
    raw: { item, detail },
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
      source: "dish",
    });
  }
  return outcome;
}

export async function syncDishReservations(
  tenantId: string,
  opts: DishSyncOptions,
): Promise<DishSyncResult> {
  const integration = await getDishIntegration(tenantId);
  if (!integration?.enabled) throw new Error("DISH integration is not enabled.");
  if (opts.endDate < opts.startDate) throw new Error("DISH sync end date must be on or after the start date.");
  const result: DishSyncResult = { imported: 0, updated: 0, skipped: 0, errors: 0, daysFetched: 0, parsedItems: 0, emptyDays: 0 };
  const provider = "dish";
  const trigger = opts.trigger ?? "system";
  const emptyDates: string[] = [];
  const assertWithinDeadline = () => {
    if (opts.deadlineAt && Date.now() >= opts.deadlineAt) {
      throw new Error("DISH sync timed out before completing. Re-run it to continue; existing imports will be skipped.");
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
        skipExisting: Boolean(opts.skipExisting),
        detailMode: opts.detailMode ?? "new",
      },
    });
    const client = new DishClient(integration);
    await client.login();
    const config = await getStore().forTenant(tenantId).getConfig();
    let dayCount = 0;
    for (let date = opts.startDate;; date = addDays(date, 1)) {
      if (dayCount > 366) throw new Error("DISH sync range is too large. Use a range of 366 days or less.");
      dayCount += 1;
      assertWithinDeadline();
      const html = await client.fetchReservationsHtml(date);
      const items = parseDishReservationList(html);
      result.daysFetched = (result.daysFetched ?? 0) + 1;
      result.parsedItems = (result.parsedItems ?? 0) + items.length;
      if (items.length === 0) {
        result.emptyDays = (result.emptyDays ?? 0) + 1;
        if (emptyDates.length < 10) emptyDates.push(date);
      }
      for (const item of items) {
        try {
          assertWithinDeadline();
          const outcome = await importDishItem(integration, client, item, config, opts);
          if (outcome === "created") result.imported += 1;
          else if (outcome === "updated") result.updated += 1;
          else result.skipped += 1;
        } catch (err) {
          console.error("[dish] import failed", item.externalId, err);
          await recordAppEvent({
            level: "warn",
            event: "external_sync.reservation_failed",
            surface: "system",
            actorType: "system",
            tenantId,
            reason: err instanceof Error ? err.message : "DISH reservation import failed.",
            metadata: {
              provider,
              trigger,
              externalId: item.externalId,
              date,
              error: safeError(err),
            },
          });
          result.errors += 1;
        }
      }
      if (date >= opts.endDate) break;
    }
    await markDishSyncResult(tenantId, result.errors ? `${result.errors} reservation imports failed.` : undefined);
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
        imported: result.imported,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
        daysFetched: result.daysFetched,
        parsedItems: result.parsedItems,
        emptyDays: result.emptyDays,
        emptyDatesSample: emptyDates,
      },
    });
    return result;
  } catch (err) {
    await markDishSyncResult(tenantId, err instanceof Error ? err.message : "DISH sync failed.");
    await recordAppEvent({
      level: "error",
      event: "external_sync.failed",
      surface: "system",
      actorType: "system",
      tenantId,
      reason: err instanceof Error ? err.message : "DISH sync failed.",
      metadata: {
        provider,
        trigger,
        startDate: opts.startDate,
        endDate: opts.endDate,
        imported: result.imported,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
        daysFetched: result.daysFetched,
        parsedItems: result.parsedItems,
        emptyDays: result.emptyDays,
        emptyDatesSample: emptyDates,
        error: safeError(err),
      },
    });
    throw err;
  }
}

export async function runDishSyncCron(): Promise<DishCronTenantResult[]> {
  const integrations = await listEnabledDishIntegrations();
  const tenantStore = getTenantStore();
  const results: DishCronTenantResult[] = [];
  for (const integration of integrations) {
    const tenant = await tenantStore.getById(integration.tenantId);
    if (!tenant || tenant.status !== "active") continue;
    const config = await getStore().forTenant(tenant.id).getConfig();
    const startDate = nowInTz(config.timezone).dateStr;
    const endDate = addDays(startDate, 1);
    try {
      const result = await syncDishReservations(tenant.id, {
        startDate,
        endDate,
        detailMode: "always",
        trigger: "cron",
        deadlineAt: Date.now() + 110_000,
      });
      results.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        startDate,
        endDate,
        ok: true,
        ...result,
      });
    } catch (err) {
      results.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        startDate,
        endDate,
        ok: false,
        imported: 0,
        updated: 0,
        skipped: 0,
        errors: 1,
        error: err instanceof Error ? err.message : "DISH sync failed.",
      });
    }
  }
  return results;
}
