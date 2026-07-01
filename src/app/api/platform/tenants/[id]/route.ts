import { NextResponse, type NextRequest } from "next/server";
import { getTenantStore } from "@/lib/reservations/tenant-store";
import { requirePlatform } from "@/lib/reservations/tenant-context";
import { sanitizeTenantSettings } from "@/lib/reservations/sanitize-tenant";
import { tenantView } from "@/lib/reservations/platform-view";
import type { Tenant, TenantSettings } from "@/lib/reservations/tenant";
import { getPlatformStore } from "@/lib/reservations/platform-store";
import { eventFromRequest, recordAppEvent } from "@/lib/observability/app-event-store";
import { observePlatformRoute } from "@/lib/observability/route-events";
import { requestContext } from "@/lib/observability/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mergeTenantSettings(
  existing: TenantSettings,
  patch: Partial<TenantSettings>,
  fallbackName: string,
): TenantSettings {
  const sanitized = sanitizeTenantSettings({
    ...existing,
    ...patch,
    emailTemplates: patch.emailTemplates
      ? { ...existing.emailTemplates, ...patch.emailTemplates }
      : existing.emailTemplates,
    name: patch.name ?? existing.name ?? fallbackName,
  });
  if (patch.smtp === undefined && existing.smtp) {
    sanitized.smtp = existing.smtp;
  } else if (sanitized.smtp && !sanitized.smtp.pass && existing.smtp?.pass) {
    // Preserve the stored SMTP password when the client sends a blank one
    // (the UI never echoes the secret back).
    sanitized.smtp.pass = existing.smtp.pass;
  }
  if (patch.emailTemplates === undefined && existing.emailTemplates) {
    sanitized.emailTemplates = existing.emailTemplates;
  }
  return sanitized;
}

/** GET /api/platform/tenants/[id] — full (redacted) detail. */
export async function GET(req: NextRequest, ctxArg: { params: Promise<{ id: string }> }) {
  return observePlatformRoute(req, "/api/platform/tenants/[id]", getTenantDetail, req, ctxArg);
}

async function getTenantDetail(req: NextRequest, ctxArg: { params: Promise<{ id: string }> }) {
  const ctx = await requirePlatform(req);
  if (!ctx.ok) return ctx.res;
  const { id } = await ctxArg.params;
  const store = getTenantStore();
  const tenant = await store.getById(id);
  if (!tenant) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ tenant: await tenantView(store, tenant) });
}

/** PATCH /api/platform/tenants/[id] — update settings and/or status. */
export async function PATCH(req: NextRequest, ctxArg: { params: Promise<{ id: string }> }) {
  return observePlatformRoute(req, "/api/platform/tenants/[id]", patchTenant, req, ctxArg);
}

async function patchTenant(req: NextRequest, ctxArg: { params: Promise<{ id: string }> }) {
  const ctx = await requirePlatform(req);
  if (!ctx.ok) return ctx.res;
  const { id } = await ctxArg.params;
  const obs = requestContext(req, { surface: "platform", actorType: "platform", session: ctx.session, route: "/api/platform/tenants/[id]" });

  let body: { settings?: Partial<TenantSettings>; status?: Tenant["status"] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const store = getTenantStore();
  const existing = await store.getById(id);
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (body.status !== undefined) {
    if (body.status !== "active" && body.status !== "disabled") {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    await store.setStatus(id, body.status);
    await recordAppEvent({
      ...eventFromRequest(obs, {
        level: "info",
        event: "platform.tenant.status_updated",
        status: 200,
        reason: body.status,
        metadata: { slug: existing.slug },
      }),
      tenantId: id,
    });
  }

  if (body.settings !== undefined) {
    const next = mergeTenantSettings(existing.settings, body.settings, existing.name);
    await store.updateSettings(id, next);
    const policyChanged = ["emailEnabled", "emailEvents", "feedbackRequestDelayHours", "feedbackEnabled"].some((k) =>
      Object.prototype.hasOwnProperty.call(body.settings, k),
    );
    await recordAppEvent({
      ...eventFromRequest(obs, {
        level: "info",
        event: policyChanged ? "platform.tenant.email_policy_updated" : "platform.tenant.settings_updated",
        status: 200,
        metadata: {
          slug: existing.slug,
          keys: Object.keys(body.settings),
        },
      }),
      tenantId: id,
    });
  }

  const updated = await store.getById(id);
  return NextResponse.json({ ok: true, tenant: updated ? await tenantView(store, updated) : null });
}

/** DELETE /api/platform/tenants/[id] — remove the tenant and all its data. */
export async function DELETE(req: NextRequest, ctxArg: { params: Promise<{ id: string }> }) {
  return observePlatformRoute(req, "/api/platform/tenants/[id]", deleteTenant, req, ctxArg);
}

async function deleteTenant(req: NextRequest, ctxArg: { params: Promise<{ id: string }> }) {
  const ctx = await requirePlatform(req);
  if (!ctx.ok) return ctx.res;
  const { id } = await ctxArg.params;
  const obs = requestContext(req, { surface: "platform", actorType: "platform", session: ctx.session, route: "/api/platform/tenants/[id]" });
  let body: { operatorPassword?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  const operatorPassword = String(body.operatorPassword ?? "");
  if (!operatorPassword || !(await getPlatformStore().verifyLogin(ctx.session.u, operatorPassword))) {
    await recordAppEvent({
      ...eventFromRequest(obs, {
        level: "warn",
        event: "platform.tenant.delete_reauth_failed",
        status: 401,
        reason: "operator_password",
      }),
      tenantId: id,
    });
    return NextResponse.json({ error: "Operator password is required." }, { status: 401 });
  }
  await getTenantStore().remove(id);
  await recordAppEvent({
    ...eventFromRequest(obs, {
      level: "warn",
      event: "platform.tenant.deleted",
      status: 200,
      metadata: { tenantId: id },
    }),
    tenantId: id,
  });
  return NextResponse.json({ ok: true });
}
