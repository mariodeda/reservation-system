import { EventEmitter } from "node:events";
import { notifyReservationEvent } from "./notifications";

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
  source: "web" | "admin" | "thefork" | "dish";
}

class ReservationBus extends EventEmitter {}

// One instance per Node.js process — the SSE route adds/removes listeners here.
export const reservationBus = new ReservationBus();
reservationBus.setMaxListeners(500);

export function emitReservation(event: ReservationEvent): void {
  reservationBus.emit(event.type, event);
  notifyReservationEvent(event).catch((err) => {
    console.error("[notifications] reservation notification failed:", err);
  });
}
