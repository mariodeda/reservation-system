import { NextResponse, type NextRequest } from "next/server";
import { observeAdminRoute } from "@/lib/observability/route-events";
import {
  dismissTenantNotification,
  markTenantNotificationRead,
} from "@/lib/reservations/notification-store";
import { requireAdmin } from "@/lib/reservations/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return observeAdminRoute(req, "/api/admin/notifications/[id]", updateNotification, req, ctx);
}

async function updateNotification(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.res;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({})) as { read?: unknown; dismissed?: unknown };
  const notification = body.dismissed
    ? await dismissTenantNotification(admin.tenant.id, id)
    : body.read !== false
      ? await markTenantNotificationRead(admin.tenant.id, id)
      : null;
  if (!notification) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
  return NextResponse.json({ notification });
}
