import { NextResponse, type NextRequest } from "next/server";
import { listEmailLogs, type EmailLogFilter, type EmailLogStatus, type EmailLogType } from "@/lib/reservations/email-log-store";
import { getTenantStore } from "@/lib/reservations/tenant-store";
import { requirePlatform } from "@/lib/reservations/tenant-context";
import { observePlatformRoute } from "@/lib/observability/route-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const types = new Set<EmailLogType>(["bookingConfirmation", "feedbackRequest"]);
const statuses = new Set<EmailLogStatus>(["sent", "failed", "skipped"]);

function text(params: URLSearchParams, key: string, max = 120): string | undefined {
  const value = String(params.get(key) ?? "").trim();
  return value ? value.slice(0, max) : undefined;
}

function oneOf<T extends string>(params: URLSearchParams, key: string, allowed: Set<T>): T | undefined {
  const value = text(params, key, 32);
  return value && allowed.has(value as T) ? value as T : undefined;
}

function numberParam(params: URLSearchParams, key: string): number | undefined {
  const value = Number(text(params, key, 16));
  return Number.isInteger(value) ? value : undefined;
}

function filters(req: NextRequest): EmailLogFilter {
  const params = req.nextUrl.searchParams;
  return {
    tenantId: text(params, "tenantId", 64),
    reservationId: text(params, "reservationId", 64),
    type: oneOf(params, "type", types),
    status: oneOf(params, "status", statuses),
    q: text(params, "q", 120),
    from: text(params, "from", 32),
    to: text(params, "to", 32),
    limit: numberParam(params, "limit"),
  };
}

export async function GET(req: NextRequest) {
  return observePlatformRoute(req, "/api/platform/email-logs", listPlatformEmailLogs, req);
}

async function listPlatformEmailLogs(req: NextRequest) {
  const ctx = await requirePlatform(req);
  if (!ctx.ok) return ctx.res;
  try {
    const store = getTenantStore();
    const [emails, tenants] = await Promise.all([
      listEmailLogs(filters(req)),
      store.list(),
    ]);
    return NextResponse.json({
      emails,
      tenants: tenants.map((tenant) => ({
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        status: tenant.status,
      })),
    });
  } catch (err) {
    console.error("[platform/email-logs] failed:", err);
    return NextResponse.json({ error: "Could not load email logs." }, { status: 500 });
  }
}
