import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/reservations/tenant-context";
import { getCustomerStore } from "@/lib/reservations/customer-store";
import { referenceOf } from "@/lib/reservations/store";
import { getFeedbackStatusBatch } from "@/lib/reservations/feedback-store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/admin/customers/[id] — detail + reservation history.
 *  [id] is encodeURIComponent(email). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.res;

  const { id } = await ctx.params;
  const email = decodeURIComponent(id);

  try {
    const detail = await getCustomerStore(admin.tenant.id).getCustomerDetail(email);
    if (!detail) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    // Attach reference codes and feedback data to reservations
    const ids = detail.reservations.map((r) => r.id);
    const feedbackMap = await getFeedbackStatusBatch(ids).catch(() => new Map());
    const reservations = detail.reservations.map((r) => ({
      ...r,
      reference: referenceOf(r.id),
      feedback: feedbackMap.get(r.id) ?? null,
    }));
    return NextResponse.json({ profile: detail.profile, reservations });
  } catch (err) {
    console.error("[customers] detail failed:", err);
    return NextResponse.json({ error: "Could not load customer." }, { status: 500 });
  }
}

/** PATCH /api/admin/customers/[id] — update vip / notes. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.res;

  const { id } = await ctx.params;
  const email = decodeURIComponent(id);

  let body: { vip?: boolean; staffNotes?: string | null; dietaryNotes?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  try {
    await getCustomerStore(admin.tenant.id).upsertProfile(email, {
      vip: body.vip ?? false,
      staffNotes: body.staffNotes ?? null,
      dietaryNotes: body.dietaryNotes ?? null,
    });
    const detail = await getCustomerStore(admin.tenant.id).getCustomerDetail(email);
    return NextResponse.json({ ok: true, profile: detail?.profile });
  } catch (err) {
    console.error("[customers] upsert failed:", err);
    return NextResponse.json({ error: "Could not save profile." }, { status: 500 });
  }
}
