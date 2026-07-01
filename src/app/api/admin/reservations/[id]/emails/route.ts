import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/reservations/tenant-context";
import { getStore } from "@/lib/reservations/store";
import { getEmailLogByReservation } from "@/lib/reservations/email-log-store";
import { observeAdminRoute } from "@/lib/observability/route-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/reservations/[id]/emails — full email send history (debug). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return observeAdminRoute(req, "/api/admin/reservations/[id]/emails", getReservationEmails, req, { params });
}

async function getReservationEmails(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;
  const { id } = await params;

  try {
    // Tenant-scoped lookup first so logs can't be read cross-tenant.
    const reservation = await getStore().forTenant(ctx.tenant.id).getReservation(id);
    if (!reservation) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const emails = await getEmailLogByReservation(id);
    return NextResponse.json({ emails });
  } catch (err) {
    console.error("[email-log] get failed:", err);
    return NextResponse.json({ error: "Could not load email log." }, { status: 500 });
  }
}
