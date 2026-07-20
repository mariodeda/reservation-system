import { NextResponse, type NextRequest } from "next/server";
import { observeAdminRoute } from "@/lib/observability/route-events";
import {
  countUnreadTenantNotifications,
  listTenantNotifications,
  markAllTenantNotificationsRead,
  type TenantNotification,
} from "@/lib/reservations/notification-store";
import { getStore } from "@/lib/reservations/store";
import { requireAdmin } from "@/lib/reservations/tenant-context";
import { reservationServiceDisplayLabel } from "@/lib/reservations/reservation-service-label";
import type { AvailabilityConfig } from "@/lib/reservations/types";

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
  const [notifications, unreadCount, config] = await Promise.all([
    listTenantNotifications(ctx.tenant.id, { unreadOnly, limit, before }),
    countUnreadTenantNotifications(ctx.tenant.id),
    getStore().forTenant(ctx.tenant.id).getConfig().catch(() => null),
  ]);
  return NextResponse.json({
    notifications: config
      ? notifications.map((notification) => enrichReservationServiceLabel(notification, config, ctx.tenant.name))
      : notifications,
    unreadCount,
  });
}

function enrichReservationServiceLabel(
  notification: TenantNotification,
  config: AvailabilityConfig,
  tenantName: string,
): TenantNotification {
  const reservation = notification.metadata?.reservation;
  if (!reservation || typeof reservation !== "object" || Array.isArray(reservation)) return notification;
  const record = reservation as Record<string, unknown>;
  if (typeof record.serviceLabel === "string" && record.serviceLabel.trim()) return notification;
  const date = typeof record.date === "string" ? record.date : "";
  const service = typeof record.service === "string" ? record.service : "";
  if (!date || !service) return notification;
  const offering = typeof record.offering === "string" && record.offering ? record.offering : "main";
  const serviceLabel = reservationServiceDisplayLabel({ date, service, offering }, config, tenantName);
  if (!serviceLabel || serviceLabel === service) return notification;
  return {
    ...notification,
    metadata: {
      ...notification.metadata,
      reservation: {
        ...record,
        serviceLabel,
      },
    },
  };
}

async function markAllRead(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;
  const updated = await markAllTenantNotificationsRead(ctx.tenant.id);
  return NextResponse.json({ ok: true, updated, unreadCount: 0 });
}
