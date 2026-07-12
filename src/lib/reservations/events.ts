import { EventEmitter } from "node:events";
import { notifyReservationEvent } from "./notifications";
import type { ReservationOrigin, ReservationStatus } from "./types";

export interface ReservationEvent {
  type: "reservation.created" | "reservation.updated";
  tenantId: string;
  id: string;
  name: string;
  partySize: number;
  date: string;
  time: string;
  service: string;
  offering: string;
  status: ReservationStatus;
  source: "web" | "admin" | "thefork" | "dish";
  reservationOrigin?: ReservationOrigin;
}

class ReservationBus extends EventEmitter {}

// One instance per Node.js process — the SSE route adds/removes listeners here.
export const reservationBus = new ReservationBus();
reservationBus.setMaxListeners(500);

export function emitReservation(event: ReservationEvent, opts: { notify?: boolean } = {}): void {
  reservationBus.emit(event.type, event);
  if (opts.notify === false) return;
  notifyReservationEvent(event).catch((err) => {
    console.error("[notifications] reservation notification failed:", err);
  });
}
