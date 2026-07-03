import { NextResponse, type NextRequest } from "next/server";
import { importTheForkReservation } from "@/lib/reservations/thefork-sync";
import { markTheForkWebhookReceived, verifyTheForkWebhookToken } from "@/lib/reservations/thefork-store";
import { clientIp, rateLimit } from "@/lib/reservations/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WebhookBody = {
  entityType?: unknown;
  eventType?: unknown;
  uuid?: unknown;
  restaurantUuid?: unknown;
};

const MAX_WEBHOOK_BODY_BYTES = 16_384;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESERVATION_EVENTS = new Set(["reservationCreated", "reservationUpdated"]);

function bearerToken(req: NextRequest): string {
  const authorization = req.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization)?.[1]?.trim();
  return bearer || req.nextUrl.searchParams.get("token")?.trim() || "";
}

function restaurantContext(req: NextRequest, body: WebhookBody): string | undefined {
  const header = req.headers.get("customerid") ?? req.headers.get("customer-id") ?? undefined;
  return typeof body.restaurantUuid === "string" ? body.restaurantUuid : header?.trim();
}

async function readWebhookBody(req: NextRequest): Promise<WebhookBody | null> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return null;
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_WEBHOOK_BODY_BYTES) throw new Error("body_too_large");
  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_WEBHOOK_BODY_BYTES) throw new Error("body_too_large");
  const parsed = JSON.parse(raw) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as WebhookBody : null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await ctx.params;
  if (!UUID_RE.test(tenantId)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!(await rateLimit(`thefork-webhook:${tenantId}:${clientIp(req)}`, 120, 60_000))) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const token = bearerToken(req);
  const integration = await verifyTheForkWebhookToken(tenantId, token);
  if (!integration) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: WebhookBody;
  try {
    const parsed = await readWebhookBody(req);
    if (!parsed) return NextResponse.json({ error: "Invalid body." }, { status: 400 });
    body = parsed;
  } catch (err) {
    if (err instanceof Error && err.message === "body_too_large") {
      return NextResponse.json({ error: "Payload too large." }, { status: 413 });
    }
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  if (body.restaurantUuid !== undefined && typeof body.restaurantUuid !== "string") {
    return NextResponse.json({ error: "Invalid restaurant UUID." }, { status: 400 });
  }
  const restaurantUuid = restaurantContext(req, body);
  if (restaurantUuid !== undefined && !UUID_RE.test(restaurantUuid)) {
    return NextResponse.json({ error: "Invalid restaurant UUID." }, { status: 400 });
  }
  if (integration.restaurantUuid && restaurantUuid && restaurantUuid !== integration.restaurantUuid) {
    return NextResponse.json({ error: "Restaurant mismatch." }, { status: 403 });
  }
  await markTheForkWebhookReceived(tenantId);

  if (
    body.entityType === "reservation" &&
    typeof body.eventType === "string" &&
    RESERVATION_EVENTS.has(body.eventType) &&
    typeof body.uuid === "string"
  ) {
    if (!UUID_RE.test(body.uuid)) return NextResponse.json({ error: "Invalid reservation UUID." }, { status: 400 });
    try {
      await importTheForkReservation(integration, body.uuid);
    } catch (err) {
      console.error("[thefork] webhook import failed:", err);
      return NextResponse.json({ error: "Could not import reservation." }, { status: 502 });
    }
  }

  return NextResponse.json({ data: {} });
}
