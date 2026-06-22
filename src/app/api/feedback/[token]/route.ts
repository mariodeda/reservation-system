import { NextResponse, type NextRequest } from "next/server";
import { getFeedbackByToken, submitFeedback } from "@/lib/reservations/feedback-store";
import { getTenantStore } from "@/lib/reservations/tenant-store";
import { getStore } from "@/lib/reservations/store";
import { clientIp, rateLimit } from "@/lib/reservations/rate-limit";
import { allowedOrigin, preflight, withCors } from "@/lib/reservations/cors";
import type { Tenant } from "@/lib/reservations/tenant";
import type { FeedbackRecord } from "@/lib/reservations/feedback-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function feedbackContext(token: string): Promise<{ record: FeedbackRecord; tenant: Tenant | null } | null> {
  const record = await getFeedbackByToken(token);
  if (!record) return null;
  const tenant = await getTenantStore().getById(record.tenantId);
  return { record, tenant };
}

export async function OPTIONS(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ctx = await feedbackContext(token);
  return preflight(
    req,
    ctx?.tenant?.status === "active" && ctx.tenant.settings.feedbackEnabled !== false ? ctx.tenant : null,
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    const ctx = await feedbackContext(token);
    if (!ctx) return NextResponse.json({ error: "Invalid or expired link." }, { status: 404 });
    const origin = ctx.tenant ? allowedOrigin(req, ctx.tenant) : null;

    if (ctx.tenant?.status !== "active" || ctx.tenant.settings.feedbackEnabled === false) {
      return withCors(
        NextResponse.json({ error: "This restaurant is not currently accepting feedback." }, { status: 503 }),
        origin,
      );
    }

    if (!(await rateLimit(`feedback-get:${ctx.record.tenantId}:${clientIp(req)}`, 30, 60_000))) {
      return withCors(NextResponse.json({ error: "Too many requests." }, { status: 429 }), origin);
    }

    const store = getStore().forTenant(ctx.record.tenantId);
    const reservation = await store.getReservation(ctx.record.reservationId);

    return withCors(NextResponse.json({
      token: ctx.record.token,
      filled: !!ctx.record.filledAt,
      rating: ctx.record.rating,
      comment: ctx.record.comment,
      restaurantName: ctx.tenant?.settings.name ?? "",
      date: reservation?.date ?? "",
      guestName: reservation?.name ?? "",
    }), origin);
  } catch (err) {
    console.error("[feedback] get token failed:", err);
    return NextResponse.json({ error: "Could not load feedback." }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ctx = await feedbackContext(token);
  if (!ctx) return NextResponse.json({ error: "Invalid or expired link." }, { status: 404 });
  const origin = ctx.tenant ? allowedOrigin(req, ctx.tenant) : null;

  if (ctx.tenant?.status !== "active" || ctx.tenant.settings.feedbackEnabled === false) {
    return withCors(
      NextResponse.json({ error: "This restaurant is not currently accepting feedback." }, { status: 503 }),
      origin,
    );
  }

  if (!(await rateLimit(`feedback-post:${ctx.record.tenantId}:${clientIp(req)}`, 10, 60_000))) {
    return withCors(NextResponse.json({ error: "Too many requests." }, { status: 429 }), origin);
  }
  let body: { rating?: number; comment?: string };
  try {
    body = await req.json();
  } catch {
    return withCors(NextResponse.json({ error: "Invalid body." }, { status: 400 }), origin);
  }
  const rating = Number(body.rating);
  if (!rating || rating < 1 || rating > 5)
    return withCors(NextResponse.json({ error: "Rating must be 1–5." }, { status: 422 }), origin);

  try {
    if (ctx.record.filledAt)
      return withCors(NextResponse.json({ error: "Feedback already submitted." }, { status: 409 }), origin);

    const ok = await submitFeedback(token, rating, String(body.comment ?? ""));
    if (!ok) return withCors(NextResponse.json({ error: "Could not save feedback." }, { status: 500 }), origin);
    return withCors(NextResponse.json({ ok: true }), origin);
  } catch (err) {
    console.error("[feedback] submit failed:", err);
    return NextResponse.json({ error: "Could not save feedback." }, { status: 500 });
  }
}
