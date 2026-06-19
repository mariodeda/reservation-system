import { NextResponse, type NextRequest } from "next/server";
import { getStore, referenceOf } from "@/lib/reservations/store";
import { getOfferings, offeringOf } from "@/lib/reservations/offerings";
import { clientIp, rateLimit } from "@/lib/reservations/rate-limit";
import { requireTenant, resolvePublicTenant } from "@/lib/reservations/tenant-context";
import { allowedOrigin, preflight, withCors } from "@/lib/reservations/cors";

export const runtime = "nodejs";

/** CORS preflight for cross-origin marketing sites. */
export async function OPTIONS(req: NextRequest) {
  return preflight(req, await resolvePublicTenant(req));
}

export async function POST(req: NextRequest) {
  const tenant = await resolvePublicTenant(req);
  return withCors(await handle(req), tenant ? allowedOrigin(req, tenant) : null);
}

async function handle(req: NextRequest) {
  const resolved = await requireTenant(req);
  if (!resolved.ok) return resolved.res;
  const { tenant } = resolved;

  // Stricter rate limit than booking: 5 lookups per 10 minutes per IP.
  // Prevents brute-forcing email+phone combinations.
  if (!(await rateLimit(`lookup:${tenant.id}:${clientIp(req)}`, 5, 600_000))) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }

  let body: { email?: unknown; phone?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().slice(0, 200);
  const phone = String(body.phone ?? "").trim().slice(0, 40);

  if (!email || !phone) {
    return NextResponse.json(
      { error: "Email and phone number are required." },
      { status: 400 },
    );
  }

  try {
    const store = getStore().forTenant(tenant.id);
    const [reservations, config] = await Promise.all([
      store.findByContact(email, phone),
      store.getConfig(),
    ]);

    // Only surface the offering for multi-offering venues, so a guest with
    // bookings in different offerings can tell them apart.
    const offerings = getOfferings(config, tenant.name);
    const offeringLabelById =
      offerings.length > 1
        ? Object.fromEntries(offerings.map((o) => [o.id, o.label]))
        : null;

    // Slim public view: no internal/admin fields exposed
    const results = reservations.map((r) => ({
      reference: referenceOf(r.id),
      date: r.date,
      time: r.time,
      service: r.service,
      offering: offeringLabelById ? offeringLabelById[offeringOf(r.offering)] ?? undefined : undefined,
      partySize: r.partySize,
      name: r.name,
      status: r.status,
      occasion: r.occasion,
    }));

    return NextResponse.json({ reservations: results });
  } catch (err) {
    console.error("[lookup] failed:", err);
    return NextResponse.json(
      { error: "Could not retrieve reservations. Please try again." },
      { status: 500 },
    );
  }
}
