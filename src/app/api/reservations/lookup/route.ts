import { NextResponse, type NextRequest } from "next/server";
import { getStore, referenceOf } from "@/lib/reservations/store";
import { getOfferings, offeringOf } from "@/lib/reservations/offerings";
import { clientIp, rateLimit } from "@/lib/reservations/rate-limit";
import { requireTenant, resolvePublicTenant } from "@/lib/reservations/tenant-context";
import { allowedOrigin, preflight, withCors } from "@/lib/reservations/cors";
import { type NewReservationInput, type Reservation } from "@/lib/reservations/types";
import { canBook as canBookReservation } from "@/lib/reservations/availability";

export const runtime = "nodejs";

/** CORS preflight for cross-origin marketing sites. */
export async function OPTIONS(req: NextRequest) {
  return preflight(req, await resolvePublicTenant(req));
}

export async function POST(req: NextRequest) {
  const tenant = await resolvePublicTenant(req);
  return withCors(await handle(req), tenant ? allowedOrigin(req, tenant) : null);
}

export async function PATCH(req: NextRequest) {
  const tenant = await resolvePublicTenant(req);
  return withCors(await mutate(req, "modify"), tenant ? allowedOrigin(req, tenant) : null);
}

export async function DELETE(req: NextRequest) {
  const tenant = await resolvePublicTenant(req);
  return withCors(await mutate(req, "cancel"), tenant ? allowedOrigin(req, tenant) : null);
}

function publicView(r: Reservation, offeringLabelById: Record<string, string> | null) {
  return {
    reference: referenceOf(r.id),
    date: r.date,
    time: r.time,
    service: r.service,
    offering: offeringLabelById ? offeringLabelById[offeringOf(r.offering)] ?? undefined : undefined,
    partySize: r.partySize,
    name: r.name,
    status: r.status,
    occasion: r.occasion,
  };
}

function contactBody(body: Record<string, unknown>) {
  return {
    email: String(body.email ?? "").trim().slice(0, 200),
    phone: String(body.phone ?? "").trim().slice(0, 40),
    reference: String(body.reference ?? "").trim().toUpperCase().slice(0, 20),
  };
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
    const results = reservations.map((r) => publicView(r, offeringLabelById));

    return NextResponse.json({ reservations: results });
  } catch (err) {
    console.error("[lookup] failed:", err);
    return NextResponse.json(
      { error: "Could not retrieve reservations. Please try again." },
      { status: 500 },
    );
  }
}

async function mutate(req: NextRequest, action: "modify" | "cancel") {
  const resolved = await requireTenant(req);
  if (!resolved.ok) return resolved.res;
  const { tenant } = resolved;

  if (tenant.status !== "active") {
    return NextResponse.json(
      { error: "This restaurant is not currently accepting online reservation changes." },
      { status: 503 },
    );
  }

  if (!(await rateLimit(`lookup-${action}:${tenant.id}:${clientIp(req)}`, 5, 600_000))) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { email, phone, reference } = contactBody(body);
  if (!email || !phone || !reference) {
    return NextResponse.json(
      { error: "Email, phone number and booking reference are required." },
      { status: 400 },
    );
  }

  try {
    const store = getStore().forTenant(tenant.id);
    const [reservations, config] = await Promise.all([
      store.findByContact(email, phone),
      store.getConfig(),
    ]);
    const reservation = reservations.find((r) => referenceOf(r.id) === reference);
    if (!reservation) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    if (reservation.status !== "pending" && reservation.status !== "confirmed") {
      return NextResponse.json({ error: "This reservation can no longer be changed online." }, { status: 409 });
    }

    const offerings = getOfferings(config, tenant.name);
    const offeringLabelById =
      offerings.length > 1
        ? Object.fromEntries(offerings.map((o) => [o.id, o.label]))
        : null;

    if (action === "cancel") {
      const updated = await store.updateReservation(reservation.id, { status: "cancelled" });
      return NextResponse.json({ ok: true, reservation: updated ? publicView(updated, offeringLabelById) : null });
    }

    const next: NewReservationInput = {
      date: String(body.date ?? reservation.date).slice(0, 10),
      time: String(body.time ?? reservation.time).slice(0, 5),
      offering: body.offering ? String(body.offering).slice(0, 40) : reservation.offering,
      service: String(body.service ?? reservation.service).slice(0, 40),
      partySize: Math.trunc(Number(body.partySize ?? reservation.partySize)),
      name: String(body.name ?? reservation.name).slice(0, 120),
      email: reservation.email,
      phone: reservation.phone,
      occasion: body.occasion !== undefined ? String(body.occasion).slice(0, 80) : reservation.occasion,
      notes: body.notes !== undefined ? String(body.notes).slice(0, 1000) : reservation.notes,
      source: reservation.source,
      status: reservation.status,
    };
    const existingForDate = (await store.listReservations({ date: next.date })).filter((r) => r.id !== reservation.id);
    const check = canBookReservation(config, existingForDate, next);
    if (!check.ok) {
      return NextResponse.json({ error: check.error ?? "Unavailable." }, { status: 409 });
    }

    const patch: Partial<Reservation> = {
      date: next.date,
      time: next.time,
      offering: next.offering,
      service: next.service,
      partySize: next.partySize,
      name: next.name,
      occasion: next.occasion,
      notes: next.notes,
    };
    const changesTableFit =
      next.date !== reservation.date ||
      next.time !== reservation.time ||
      next.offering !== reservation.offering ||
      next.service !== reservation.service;
    if (changesTableFit) {
      Object.assign(patch, { tableId: null, tableIds: null, tableLabel: null });
    }
    const updated = await store.updateReservation(reservation.id, patch);
    return NextResponse.json({ ok: true, reservation: updated ? publicView(updated, offeringLabelById) : null });
  } catch (err) {
    console.error(`[lookup] ${action} failed:`, err);
    return NextResponse.json(
      { error: "Could not update reservation. Please try again." },
      { status: 500 },
    );
  }
}
