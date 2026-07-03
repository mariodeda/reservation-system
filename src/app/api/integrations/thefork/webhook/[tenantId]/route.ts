import { NextResponse, type NextRequest } from "next/server";
import { importTheForkReservation } from "@/lib/reservations/thefork-sync";
import { markTheForkWebhookReceived, verifyTheForkWebhookToken } from "@/lib/reservations/thefork-store";
import { clientIp, rateLimit } from "@/lib/reservations/rate-limit";
import { recordAppEvent } from "@/lib/observability/app-event-store";
import { safeError } from "@/lib/observability/logger";

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

async function logWebhook(
  level: "info" | "warn" | "error",
  tenantId: string | undefined,
  event: string,
  reason?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await recordAppEvent({
    level,
    event,
    surface: "system",
    actorType: "system",
    tenantId,
    reason,
    metadata: {
      provider: "thefork",
      ...metadata,
    },
  });
}

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
    await logWebhook("warn", undefined, "external_sync.webhook_rejected", "invalid_tenant", { tenantId });
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!(await rateLimit(`thefork-webhook:${tenantId}:${clientIp(req)}`, 120, 60_000))) {
    await logWebhook("warn", tenantId, "external_sync.webhook_rejected", "rate_limited");
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const token = bearerToken(req);
  const integration = await verifyTheForkWebhookToken(tenantId, token);
  if (!integration) {
    await logWebhook("warn", tenantId, "external_sync.webhook_rejected", "unauthorized", { tokenPresent: Boolean(token) });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: WebhookBody;
  try {
    const parsed = await readWebhookBody(req);
    if (!parsed) {
      await logWebhook("warn", tenantId, "external_sync.webhook_rejected", "invalid_body", {
        contentType: req.headers.get("content-type") ?? undefined,
      });
      return NextResponse.json({ error: "Invalid body." }, { status: 400 });
    }
    body = parsed;
  } catch (err) {
    if (err instanceof Error && err.message === "body_too_large") {
      await logWebhook("warn", tenantId, "external_sync.webhook_rejected", "payload_too_large", {
        contentLength: req.headers.get("content-length") ?? undefined,
      });
      return NextResponse.json({ error: "Payload too large." }, { status: 413 });
    }
    await logWebhook("warn", tenantId, "external_sync.webhook_rejected", "invalid_body", {
      error: safeError(err),
    });
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  if (body.restaurantUuid !== undefined && typeof body.restaurantUuid !== "string") {
    await logWebhook("warn", tenantId, "external_sync.webhook_rejected", "invalid_restaurant_uuid");
    return NextResponse.json({ error: "Invalid restaurant UUID." }, { status: 400 });
  }
  const restaurantUuid = restaurantContext(req, body);
  if (restaurantUuid !== undefined && !UUID_RE.test(restaurantUuid)) {
    await logWebhook("warn", tenantId, "external_sync.webhook_rejected", "invalid_restaurant_uuid", { restaurantUuid });
    return NextResponse.json({ error: "Invalid restaurant UUID." }, { status: 400 });
  }
  if (integration.restaurantUuid && restaurantUuid && restaurantUuid !== integration.restaurantUuid) {
    await logWebhook("warn", tenantId, "external_sync.webhook_rejected", "restaurant_mismatch", {
      restaurantUuid,
      expectedRestaurantUuid: integration.restaurantUuid,
    });
    return NextResponse.json({ error: "Restaurant mismatch." }, { status: 403 });
  }
  await markTheForkWebhookReceived(tenantId);

  if (
    body.entityType === "reservation" &&
    typeof body.eventType === "string" &&
    RESERVATION_EVENTS.has(body.eventType) &&
    typeof body.uuid === "string"
  ) {
    if (!UUID_RE.test(body.uuid)) {
      await logWebhook("warn", tenantId, "external_sync.webhook_rejected", "invalid_reservation_uuid", {
        externalId: body.uuid,
        webhookEventType: body.eventType,
        entityType: body.entityType,
        restaurantUuid,
      });
      return NextResponse.json({ error: "Invalid reservation UUID." }, { status: 400 });
    }
    try {
      const outcome = await importTheForkReservation(integration, body.uuid);
      await logWebhook("info", tenantId, "external_sync.webhook_processed", undefined, {
        externalId: body.uuid,
        webhookEventType: body.eventType,
        entityType: body.entityType,
        restaurantUuid,
        outcome,
      });
    } catch (err) {
      console.error("[thefork] webhook import failed:", err);
      await logWebhook("error", tenantId, "external_sync.webhook_failed", err instanceof Error ? err.message : "Could not import reservation.", {
        externalId: body.uuid,
        webhookEventType: body.eventType,
        entityType: body.entityType,
        restaurantUuid,
        error: safeError(err),
      });
      return NextResponse.json({ error: "Could not import reservation." }, { status: 502 });
    }
  } else {
    await logWebhook("info", tenantId, "external_sync.webhook_ignored", undefined, {
      entityType: body.entityType,
      webhookEventType: body.eventType,
      hasUuid: typeof body.uuid === "string",
      restaurantUuid,
    });
  }

  return NextResponse.json({ data: {} });
}
