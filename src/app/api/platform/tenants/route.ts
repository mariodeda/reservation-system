import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { getTenantStore } from "@/lib/reservations/tenant-store";
import { requirePlatform } from "@/lib/reservations/tenant-context";
import { hashPassword, type TenantSettings } from "@/lib/reservations/tenant";
import { sanitizeTenantSettings } from "@/lib/reservations/sanitize-tenant";
import { tenantView } from "@/lib/reservations/platform-view";
import { eventFromRequest, recordAppEvent } from "@/lib/observability/app-event-store";
import { log } from "@/lib/observability/logger";
import { requestContext } from "@/lib/observability/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const slugRe = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** GET /api/platform/tenants — list all restaurants (secrets redacted). */
export async function GET(req: NextRequest) {
  const ctx = await requirePlatform(req);
  if (!ctx.ok) return ctx.res;
  try {
    const store = getTenantStore();
    const tenants = await store.list();
    const views = await Promise.all(tenants.map((t) => tenantView(store, t)));
    return NextResponse.json({ tenants: views });
  } catch (err) {
    console.error("[platform] list tenants failed:", err);
    return NextResponse.json({ error: "Could not load tenants." }, { status: 500 });
  }
}

/** POST /api/platform/tenants — create a restaurant + its login + hosts. */
export async function POST(req: NextRequest) {
  const ctx = await requirePlatform(req);
  if (!ctx.ok) return ctx.res;
  const obs = requestContext(req, { surface: "platform", actorType: "platform", session: ctx.session, route: "/api/platform/tenants" });

  let body: {
    slug?: string;
    name?: string;
    username?: string;
    password?: string;
    hosts?: string[];
    settings?: Partial<TenantSettings>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const slug = String(body.slug ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim();
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  if (!slugRe.test(slug)) {
    return NextResponse.json({ error: "Slug must be lowercase letters, numbers and hyphens." }, { status: 400 });
  }
  if (!name || !username || password.length < 8) {
    return NextResponse.json(
      { error: "Name, username and a password of at least 8 characters are required." },
      { status: 400 },
    );
  }

  const settings = sanitizeTenantSettings({ ...(body.settings ?? {}), name });
  const hosts = Array.isArray(body.hosts)
    ? body.hosts.map((h) => String(h).trim().toLowerCase()).filter(Boolean).slice(0, 50)
    : [];

  try {
    const store = getTenantStore();
    const tenant = await store.create({
      id: randomUUID(),
      slug,
      name,
      settings,
      adminUsername: username,
      adminPasswordHash: hashPassword(password),
      hosts,
    });
    await recordAppEvent({
      ...eventFromRequest(obs, {
        level: "info",
        event: "platform.tenant.created",
        status: 201,
        metadata: { slug: tenant.slug, hostCount: hosts.length },
      }),
      tenantId: tenant.id,
    });
    return NextResponse.json({ ok: true, tenant: await tenantView(store, tenant) }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/duplicate|ER_DUP_ENTRY/i.test(msg)) {
      return NextResponse.json({ error: "That slug or host is already in use." }, { status: 409 });
    }
    log.error({
      event: "platform.tenant.create_failed",
      surface: "platform",
      requestId: obs.requestId,
      route: obs.route,
      method: obs.method,
      status: 500,
    }, err);
    await recordAppEvent(eventFromRequest(obs, {
      level: "error",
      event: "platform.tenant.create_failed",
      status: 500,
      reason: err instanceof Error ? err.message : "unknown",
    }));
    return NextResponse.json({ error: "Could not create tenant." }, { status: 500 });
  }
}
