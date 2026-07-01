import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/reservations/tenant-context";
import { listEmailLogs, type EmailLogFilter, type EmailLogStatus, type EmailLogType } from "@/lib/reservations/email-log-store";
import { observeAdminRoute } from "@/lib/observability/route-events";

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

function filters(req: NextRequest, tenantId: string): EmailLogFilter {
  const params = req.nextUrl.searchParams;
  return {
    tenantId,
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
  return observeAdminRoute(req, "/api/admin/email-logs", listAdminEmailLogs, req);
}

async function listAdminEmailLogs(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;
  try {
    return NextResponse.json({ emails: await listEmailLogs(filters(req, ctx.tenant.id)) });
  } catch (err) {
    console.error("[admin/email-logs] failed:", err);
    return NextResponse.json({ error: "Could not load email logs." }, { status: 500 });
  }
}
