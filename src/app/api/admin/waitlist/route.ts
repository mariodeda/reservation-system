import { NextResponse, type NextRequest } from "next/server";
import { getStore } from "@/lib/reservations/store";
import { getWaitlistStore } from "@/lib/reservations/waitlist-store";
import { requireAdmin } from "@/lib/reservations/tenant-context";
import type { NewWaitlistInput } from "@/lib/reservations/types";
import { observeAdminRoute } from "@/lib/observability/route-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/waitlist?date=YYYY-MM-DD[&active=1] — list the day's queue. */
export async function GET(req: NextRequest) {
  return observeAdminRoute(req, "/api/admin/waitlist", listWaitlist, req);
}

async function listWaitlist(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.res;
  const sp = req.nextUrl.searchParams;
  const date = sp.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "A valid date is required." }, { status: 400 });
  }
  try {
    const entries = await getWaitlistStore(admin.tenant.id).listWaitlist(date, {
      activeOnly: sp.get("active") === "1",
    });
    return NextResponse.json({ waitlist: entries });
  } catch (err) {
    console.error("[waitlist] list failed:", err);
    return NextResponse.json({ error: "Could not load the waitlist." }, { status: 500 });
  }
}

/** POST /api/admin/waitlist — add a party to the queue. */
export async function POST(req: NextRequest) {
  return observeAdminRoute(req, "/api/admin/waitlist", addWaitlistEntry, req);
}

async function addWaitlistEntry(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.res;
  let body: Partial<NewWaitlistInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(body.date))) {
    return NextResponse.json({ error: "A valid date is required." }, { status: 400 });
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "A guest name is required." }, { status: 400 });
  }
  const config = await getStore().forTenant(admin.tenant.id).getConfig();
  const entry = await getWaitlistStore(admin.tenant.id).addEntry(
    {
      date: String(body.date),
      offering: body.offering ? String(body.offering).slice(0, 40) : undefined,
      name: String(body.name),
      phone: body.phone ? String(body.phone) : undefined,
      email: body.email ? String(body.email) : undefined,
      partySize: Math.max(1, Math.trunc(Number(body.partySize)) || 1),
      quotedWaitMin: body.quotedWaitMin != null ? Number(body.quotedWaitMin) : undefined,
      pagerLabel: body.pagerLabel ? String(body.pagerLabel) : undefined,
      notes: body.notes ? String(body.notes) : undefined,
    },
    config,
  );
  return NextResponse.json({ ok: true, entry }, { status: 201 });
}
