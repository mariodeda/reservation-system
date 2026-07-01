import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/reservations/tenant-context";
import { reservationBus, type ReservationEvent } from "@/lib/reservations/events";
import { observeAdminRoute } from "@/lib/observability/route-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const enc = new TextEncoder();
const sse = (event: string, data: unknown) =>
  enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
const comment = enc.encode(": heartbeat\n\n");

export async function GET(req: NextRequest) {
  return observeAdminRoute(req, "/api/admin/events", getEvents, req);
}

async function getEvents(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;
  const tenantId = ctx.tenant.id;

  let controller: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      controller.enqueue(sse("connected", { ok: true }));

      const onCreated = (e: ReservationEvent) => {
        if (e.tenantId !== tenantId) return;
        try { controller.enqueue(sse("reservation.created", e)); } catch { /* closed */ }
      };
      const onUpdated = (e: ReservationEvent) => {
        if (e.tenantId !== tenantId) return;
        try { controller.enqueue(sse("reservation.updated", e)); } catch { /* closed */ }
      };

      reservationBus.on("reservation.created", onCreated);
      reservationBus.on("reservation.updated", onUpdated);

      // 25 s heartbeat — keeps the connection alive through proxies
      const hb = setInterval(() => {
        try { controller.enqueue(comment); } catch { clearInterval(hb); }
      }, 25_000);

      req.signal.addEventListener("abort", () => {
        reservationBus.off("reservation.created", onCreated);
        reservationBus.off("reservation.updated", onUpdated);
        clearInterval(hb);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no", // tell nginx not to buffer SSE
      Connection: "keep-alive",
    },
  });
}
