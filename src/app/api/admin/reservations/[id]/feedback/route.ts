import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/reservations/tenant-context";
import { getStore } from "@/lib/reservations/store";
import { createFeedbackToken, getFeedbackByReservation } from "@/lib/reservations/feedback-store";
import { sendFeedbackRequestEmail } from "@/lib/reservations/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;
  const { id } = await params;

  try {
    const store = getStore().forTenant(ctx.tenant.id);
    const reservation = await store.getReservation(id);
    if (!reservation) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (reservation.status !== "completed")
      return NextResponse.json({ error: "Feedback can only be requested for completed reservations." }, { status: 422 });
    if (!reservation.email)
      return NextResponse.json({ error: "Reservation has no email address." }, { status: 422 });

    const existing = await getFeedbackByReservation(id);
    if (existing?.filledAt)
      return NextResponse.json({ error: "Feedback already submitted." }, { status: 409 });

    const record = await createFeedbackToken(id, ctx.tenant.id);
    const siteUrl = ctx.tenant.settings.url?.replace(/\/$/, "") || "";
    const feedbackUrl = `${siteUrl}/feedback/${record.token}`;

    const result = await sendFeedbackRequestEmail(reservation, ctx.tenant, feedbackUrl);
    return NextResponse.json({ ok: true, token: record.token, emailSent: result.sent, feedbackUrl });
  } catch (err) {
    console.error("[feedback] send failed:", err);
    return NextResponse.json({ error: "Could not send feedback request." }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;
  const { id } = await params;

  try {
    const record = await getFeedbackByReservation(id);
    return NextResponse.json({ feedback: record ?? null });
  } catch (err) {
    console.error("[feedback] get failed:", err);
    return NextResponse.json({ error: "Could not load feedback." }, { status: 500 });
  }
}
