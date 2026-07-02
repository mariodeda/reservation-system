import { NextResponse, type NextRequest } from "next/server";
import { getStore } from "@/lib/reservations/store";
import { getDayAvailability, getMonthAvailability } from "@/lib/reservations/availability";
import { getTableStore } from "@/lib/reservations/table-store";
import { offeringSummaries } from "@/lib/reservations/offerings";
import { requireTenant, resolvePublicTenant } from "@/lib/reservations/tenant-context";
import { allowedOrigin, preflight, withCors } from "@/lib/reservations/cors";
import { clientIp, rateLimit } from "@/lib/reservations/rate-limit";
import { observePublicRoute } from "@/lib/observability/route-events";
import {
  publicReservationPolicy,
  type PublicDayAvailabilityResponse,
  type PublicOfferingsResponse,
} from "@/lib/reservations/public-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** CORS preflight (cross-origin marketing sites). */
export async function OPTIONS(req: NextRequest) {
  return observePublicRoute(req, "/api/availability", availabilityOptions, req);
}

async function availabilityOptions(req: NextRequest) {
  return preflight(req, await resolvePublicTenant(req));
}

/**
 * GET /api/availability?month=YYYY-MM  -> [{ date, status }]  (drives calendar)
 * GET /api/availability?date=YYYY-MM-DD -> { date, closed, past, full, services } (drives time slots)
 */
export async function GET(req: NextRequest) {
  return observePublicRoute(req, "/api/availability", getAvailability, req);
}

async function getAvailability(req: NextRequest) {
  const tenant = await resolvePublicTenant(req);
  return withCors(await handle(req), tenant ? allowedOrigin(req, tenant) : null);
}

async function handle(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    const resolved = await requireTenant(req);
    if (!resolved.ok) return resolved.res;

    if (resolved.tenant.status !== "active") {
      return NextResponse.json(
        { error: "This restaurant is not currently accepting online reservations." },
        { status: 503 },
      );
    }

    if (!(await rateLimit(`avail:${resolved.tenant.id}:${clientIp(req)}`, 60, 60_000))) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const store = getStore().forTenant(resolved.tenant.id);
    const date = sp.get("date");
    const month = sp.get("month");
    const offering = sp.get("offering") || undefined;
    const wantOfferings = sp.get("offerings") === "1";

    const cacheHeaders = { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" };

    // Lightweight offerings list for the public/admin picker (no reservations needed).
    if (wantOfferings && !date && !month) {
      const config = await store.getConfig();
      const body: PublicOfferingsResponse = {
        offerings: offeringSummaries(config, resolved.tenant.name),
        reservationPolicy: publicReservationPolicy(config),
      };
      return NextResponse.json(
        body,
        { headers: cacheHeaders },
      );
    }

    // Scope the reservation fetch to the relevant date window to reduce DB load.
    const m = month ? /^(\d{4})-(\d{2})$/.exec(month) : null;
    const from = date ?? (m ? `${m[1]}-${m[2]}-01` : undefined);
    const to = date ?? (m ? `${m[1]}-${m[2]}-31` : undefined);
    const [config, reservations, tables] = await Promise.all([
      store.getConfig(),
      store.listReservations({ from, to }),
      getTableStore(resolved.tenant.id).listTables({ activeOnly: true }),
    ]);
    const offerings = offeringSummaries(config, resolved.tenant.name);

    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        return NextResponse.json({ error: "Invalid date" }, { status: 400 });
      const body: PublicDayAvailabilityResponse = {
        ...getDayAvailability(config, reservations, date, offering, tables),
        offerings,
        reservationPolicy: publicReservationPolicy(config),
      };
      return NextResponse.json(
        body,
        { headers: cacheHeaders },
      );
    }

    if (month) {
      if (!m || Number(m[2]) < 1 || Number(m[2]) > 12)
        return NextResponse.json({ error: "Invalid month" }, { status: 400 });
      const days = getMonthAvailability(config, reservations, Number(m[1]), Number(m[2]), offering, tables);
      return NextResponse.json(
        {
          month,
          days,
          offerings,
          minPartySize: config.minPartySize,
          maxPartySize: config.maxPartySize,
          reservationPolicy: publicReservationPolicy(config),
          bookingWindowDays: config.bookingWindowDays,
        },
        { headers: cacheHeaders },
      );
    }

    return NextResponse.json(
      { error: "Provide ?month=YYYY-MM or ?date=YYYY-MM-DD" },
      { status: 400 },
    );
  } catch (err) {
    console.error("[reservations] availability failed:", err);
    return NextResponse.json({ error: "Availability is temporarily unavailable." }, { status: 500 });
  }
}
