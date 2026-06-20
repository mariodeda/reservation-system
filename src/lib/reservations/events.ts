import { EventEmitter } from "node:events";

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
  source: "web" | "admin";
}

class ReservationBus extends EventEmitter {}

// One instance per Node.js process — the SSE route adds/removes listeners here.
export const reservationBus = new ReservationBus();
reservationBus.setMaxListeners(500);

export function emitReservation(event: ReservationEvent): void {
  reservationBus.emit(event.type, event);
}
