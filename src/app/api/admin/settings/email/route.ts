import { NextResponse, type NextRequest } from "next/server";
import { isEmailEventEnabled } from "@/lib/reservations/email-policy";
import { getTenantStore } from "@/lib/reservations/tenant-store";
import { clearTenantCache, requireAdmin } from "@/lib/reservations/tenant-context";
import { observeAdminRoute } from "@/lib/observability/route-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return observeAdminRoute(req, "/api/admin/settings/email", getEmailSettings, req);
}

export async function PATCH(req: NextRequest) {
  return observeAdminRoute(req, "/api/admin/settings/email", patchEmailSettings, req);
}

async function getEmailSettings(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;
  return NextResponse.json(responseBody(ctx.tenant.settings));
}

async function patchEmailSettings(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;
  if (!isEmailEventEnabled(ctx.tenant.settings, "feedbackRequest")) {
    return NextResponse.json({ error: "Feedback request emails are disabled for this restaurant." }, { status: 403 });
  }

  let body: { feedbackAutoSendEnabled?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  if (typeof body.feedbackAutoSendEnabled !== "boolean") {
    return NextResponse.json({ error: "feedbackAutoSendEnabled must be boolean." }, { status: 400 });
  }

  const next = { ...ctx.tenant.settings, feedbackAutoSendEnabled: body.feedbackAutoSendEnabled };
  await getTenantStore().updateSettings(ctx.tenant.id, next);
  clearTenantCache();
  return NextResponse.json(responseBody(next));
}

function responseBody(settings: Parameters<typeof isEmailEventEnabled>[0]) {
  const feedbackRequestsEnabled = isEmailEventEnabled(settings, "feedbackRequest");
  return {
    feedbackRequestsEnabled,
    feedbackAutoSendEnabled: settings.feedbackAutoSendEnabled !== false,
  };
}
