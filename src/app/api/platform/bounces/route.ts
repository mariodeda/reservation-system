import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { observeSystemRoute } from "@/lib/observability/route-events";
import { recordEmailAttempt, type EmailLogType } from "@/lib/reservations/email-log-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasBounceAuth(req: NextRequest): boolean {
  const secret = process.env.BOUNCE_WEBHOOK_SECRET || process.env.CRON_SECRET || "";
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!secret || !token) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

function str(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function emailType(input: unknown): EmailLogType | null {
  const value = str(input);
  return value === "bookingConfirmation" || value === "feedbackRequest" ? value : null;
}

function pickString(body: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const direct = str(body[key]);
    if (direct) return direct;
    const metadata = body.metadata;
    if (metadata && typeof metadata === "object") {
      const nested = str((metadata as Record<string, unknown>)[key]);
      if (nested) return nested;
    }
  }
  return "";
}

export async function POST(req: NextRequest) {
  return observeSystemRoute(req, "/api/platform/bounces", ingestBounce, req);
}

async function ingestBounce(req: NextRequest) {
  if (!hasBounceAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const tenantId = pickString(body, ["tenantId", "tenant_id", "X-RSV-Tenant-ID"]);
  const reservationId = pickString(body, ["reservationId", "reservation_id", "X-RSV-Reservation-ID"]);
  const type = emailType(
    pickString(body, ["type", "emailType", "email_type", "X-RSV-Email-Type"]) || "bookingConfirmation",
  );
  if (!tenantId || !reservationId || !type) {
    return NextResponse.json({ error: "tenantId, reservationId and valid type are required." }, { status: 400 });
  }

  const recipient = pickString(body, ["recipient", "email", "to", "toEmail"]);
  const reason = pickString(body, ["reason", "diagnostic", "description", "error"]) || "Email bounced";
  await recordEmailAttempt({
    tenantId,
    reservationId,
    type,
    status: "failed",
    reason: "bounced",
    error: reason,
    toEmail: recipient || undefined,
  });
  return NextResponse.json({ ok: true });
}
