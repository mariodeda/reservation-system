import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/reservations/tenant-context";
import { getCustomerStore } from "@/lib/reservations/customer-store";
import { clientIp, rateLimit } from "@/lib/reservations/rate-limit";
import { observeAdminRoute } from "@/lib/observability/route-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/customers?q=&page=&limit=&sortBy= */
export async function GET(req: NextRequest) {
  return observeAdminRoute(req, "/api/admin/customers", listCustomers, req);
}

async function listCustomers(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;

  if (!(await rateLimit(`admin-customers:${ctx.tenant.id}:${clientIp(req)}`, 30, 60_000))) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? undefined;
  const page = Math.max(1, Number(sp.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit") ?? "50")));
  const sortBy = (sp.get("sortBy") ?? "lastVisit") as "lastVisit" | "name" | "visits";

  try {
    const result = await getCustomerStore(ctx.tenant.id).listCustomers({ q, page, limit, sortBy });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[customers] list failed:", err);
    return NextResponse.json({ error: "Could not load customers." }, { status: 500 });
  }
}
