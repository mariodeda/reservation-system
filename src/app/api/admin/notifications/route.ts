import { NextResponse, type NextRequest } from "next/server";
import { observeAdminRoute } from "@/lib/observability/route-events";
import {
  countUnreadTenantNotifications,
  listTenantNotifications,
  markAllTenantNotificationsRead,
} from "@/lib/reservations/notification-store";
import { requireAdmin } from "@/lib/reservations/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return observeAdminRoute(req, "/api/admin/notifications", listNotifications, req);
}

export async function POST(req: NextRequest) {
  return observeAdminRoute(req, "/api/admin/notifications", markAllRead, req);
}

async function listNotifications(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;
  const unreadOnly = req.nextUrl.searchParams.get("unread") === "1";
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  const before = req.nextUrl.searchParams.get("before") ?? undefined;
  const [notifications, unreadCount] = await Promise.all([
    listTenantNotifications(ctx.tenant.id, { unreadOnly, limit, before }),
    countUnreadTenantNotifications(ctx.tenant.id),
  ]);
  return NextResponse.json({ notifications, unreadCount });
}

async function markAllRead(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;
  const updated = await markAllTenantNotificationsRead(ctx.tenant.id);
  return NextResponse.json({ ok: true, updated, unreadCount: 0 });
}
