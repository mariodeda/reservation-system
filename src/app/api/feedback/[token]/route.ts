import { NextResponse, type NextRequest } from "next/server";
import { getFeedbackByToken, submitFeedback } from "@/lib/reservations/feedback-store";
import { getTenantStore } from "@/lib/reservations/tenant-store";
import { getStore } from "@/lib/reservations/store";
import { clientIp, rateLimit } from "@/lib/reservations/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!(await rateLimit(`feedback-get:${clientIp(req)}`, 30, 60_000))) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  try {
    const record = await getFeedbackByToken(token);
    if (!record) return NextResponse.json({ error: "Invalid or expired link." }, { status: 404 });

    const tenant = await getTenantStore().getById(record.tenantId);
    const store = getStore().forTenant(record.tenantId);
    const reservation = await store.getReservation(record.reservationId);

    return NextResponse.json({
      token: record.token,
      filled: !!record.filledAt,
      rating: record.rating,
      comment: record.comment,
      restaurantName: tenant?.settings.name ?? "",
      date: reservation?.date ?? "",
      guestName: reservation?.name ?? "",
    });
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
  if (!(await rateLimit(`feedback-post:${clientIp(req)}`, 10, 60_000))) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  let body: { rating?: number; comment?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  const rating = Number(body.rating);
  if (!rating || rating < 1 || rating > 5)
    return NextResponse.json({ error: "Rating must be 1–5." }, { status: 422 });

  try {
    const record = await getFeedbackByToken(token);
    if (!record) return NextResponse.json({ error: "Invalid or expired link." }, { status: 404 });
    if (record.filledAt) return NextResponse.json({ error: "Feedback already submitted." }, { status: 409 });

    const ok = await submitFeedback(token, rating, String(body.comment ?? ""));
    if (!ok) return NextResponse.json({ error: "Could not save feedback." }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[feedback] submit failed:", err);
    return NextResponse.json({ error: "Could not save feedback." }, { status: 500 });
  }
}
