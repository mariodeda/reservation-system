import { NextResponse, type NextRequest } from "next/server";
import { getStore } from "@/lib/reservations/store";
import { getDayAvailability, getMonthAvailability } from "@/lib/reservations/availability";
import { getTableStore } from "@/lib/reservations/table-store";
import { offeringSummaries } from "@/lib/reservations/offerings";
import { requireAdmin } from "@/lib/reservations/tenant-context";
import { observeAdminRoute } from "@/lib/observability/route-events";
import { publicReservationPolicy } from "@/lib/reservations/public-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return observeAdminRoute(req, "/api/admin/availability", getAvailability, req);
}

async function getAvailability(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;

  const sp = req.nextUrl.searchParams;
  const date = sp.get("date");
  const month = sp.get("month");
  const offering = sp.get("offering") || undefined;

  try {
    const store = getStore().forTenant(ctx.tenant.id);

    const m = month ? /^(\d{4})-(\d{2})$/.exec(month) : null;
    const from = date ?? (m ? `${m[1]}-${m[2]}-01` : undefined);
    const to = date ?? (m ? `${m[1]}-${m[2]}-31` : undefined);
    const [config, reservations, tables] = await Promise.all([
      store.getConfig(),
      store.listReservations({ from, to }),
      getTableStore(ctx.tenant.id).listTables({ activeOnly: true }),
    ]);
    const offerings = offeringSummaries(config, ctx.tenant.name);

    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        return NextResponse.json({ error: "Invalid date" }, { status: 400 });
      return NextResponse.json({ ...getDayAvailability(config, reservations, date, offering, tables, { includePastSlots: true }), offerings });
    }

    if (month) {
      if (!m || Number(m[2]) < 1 || Number(m[2]) > 12)
        return NextResponse.json({ error: "Invalid month" }, { status: 400 });
      return NextResponse.json({
        month,
        days: getMonthAvailability(config, reservations, Number(m[1]), Number(m[2]), offering, tables),
        offerings,
        minPartySize: config.minPartySize,
        maxPartySize: config.maxPartySize,
        reservationPolicy: publicReservationPolicy(config),
        bookingWindowDays: config.bookingWindowDays,
      });
    }

    return NextResponse.json({ error: "Provide ?month=YYYY-MM or ?date=YYYY-MM-DD" }, { status: 400 });
  } catch (err) {
    console.error("[reservations] admin availability failed:", err);
    return NextResponse.json({ error: "Availability is temporarily unavailable." }, { status: 500 });
  }
}
