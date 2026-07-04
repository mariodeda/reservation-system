import { EventEmitter } from "node:events";
import { externalReservationLabel, isExternalReservationSource } from "./external-sources";
import {
  createTenantNotification,
  type CreateTenantNotificationInput,
  type TenantNotification,
} from "./notification-store";
import type { ReservationSource } from "./types";
import type { ReservationEvent } from "./events";

class NotificationBus extends EventEmitter {}

export const notificationBus = new NotificationBus();
notificationBus.setMaxListeners(500);

export interface NotificationEvent {
  tenantId: string;
  notification: TenantNotification;
}

function emit(notification: TenantNotification) {
  notificationBus.emit("notification.created", {
    tenantId: notification.tenantId,
    notification,
  } satisfies NotificationEvent);
}

export async function createAndEmitTenantNotification(
  input: CreateTenantNotificationInput,
  opts: { emit?: boolean } = {},
): Promise<TenantNotification> {
  const { notification, created } = await createTenantNotification(input);
  if (opts.emit !== false && created) emit(notification);
  return notification;
}

function sourceLabel(source: ReservationSource): string {
  if (source === "web") return "Online";
  if (source === "admin") return "Staff";
  if (isExternalReservationSource(source)) return externalReservationLabel(source);
  return source;
}

function reservationTitle(event: ReservationEvent): string {
  if (event.type === "reservation.created") {
    if (isExternalReservationSource(event.source)) return `New ${sourceLabel(event.source)} reservation`;
    return event.source === "admin" ? "New staff reservation" : "New online reservation";
  }
  if (isExternalReservationSource(event.source)) return `${sourceLabel(event.source)} reservation updated`;
  return "Reservation updated";
}

function reservationBody(event: ReservationEvent): string {
  return `${event.name} - ${event.partySize} guest${event.partySize === 1 ? "" : "s"} - ${event.date} ${event.time}`;
}

export async function notifyReservationEvent(
  event: ReservationEvent,
  opts: { emit?: boolean; dedupeKey?: string; severity?: CreateTenantNotificationInput["severity"] } = {},
): Promise<TenantNotification | null> {
  const external = isExternalReservationSource(event.source);
  if (event.type === "reservation.updated" && !external) {
    return null;
  }
  const dedupeKey = opts.dedupeKey ??
    (event.type === "reservation.created"
      ? `${event.type}:${event.id}`
      : `${event.type}:${event.source}:${event.id}:${event.date}:${event.time}:${event.partySize}`);
  return createAndEmitTenantNotification({
    tenantId: event.tenantId,
    type: event.type,
    severity: opts.severity ?? (external && event.type === "reservation.updated" ? "warning" : "info"),
    title: reservationTitle(event),
    body: reservationBody(event),
    source: event.source,
    reservationId: event.id,
    dedupeKey,
    metadata: {
      reservation: {
        id: event.id,
        name: event.name,
        partySize: event.partySize,
        date: event.date,
        time: event.time,
        service: event.service,
        offering: event.offering,
        source: event.source,
      },
    },
  }, opts);
}
