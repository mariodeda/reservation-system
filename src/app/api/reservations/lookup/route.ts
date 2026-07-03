import { NextResponse, type NextRequest } from "next/server";
import { getStore, referenceOf } from "@/lib/reservations/store";
import { getOfferings, offeringOf } from "@/lib/reservations/offerings";
import { clientIp, rateLimit } from "@/lib/reservations/rate-limit";
import { requireTenant, resolvePublicTenant } from "@/lib/reservations/tenant-context";
import { allowedOrigin, preflight, withCors } from "@/lib/reservations/cors";
import { type NewReservationInput, type Reservation } from "@/lib/reservations/types";
import { canBook as canBookReservation, normalizeEmail, normalizePhone } from "@/lib/reservations/availability";
import { getTableStore } from "@/lib/reservations/table-store";
import { log } from "@/lib/observability/logger";
import { eventFromRequest, recordAppEvent } from "@/lib/observability/app-event-store";
import { elapsedMs, requestContext } from "@/lib/observability/request-context";
import { observePublicRoute } from "@/lib/observability/route-events";

export const runtime = "nodejs";

const LOOKUP_WINDOW_MS = 600_000;
const LOOKUP_MAX_ATTEMPTS = 5;
const LOOKUP_MIN_SUBMIT_MS = 1_500;
const fakeLookupOk = () => NextResponse.json({ reservations: [] }, { status: 200 });

/** CORS preflight for cross-origin marketing sites. */
export async function OPTIONS(req: NextRequest) {
  return observePublicRoute(req, "/api/reservations/lookup", lookupOptions, req);
}

async function lookupOptions(req: NextRequest) {
  return preflight(req, await resolvePublicTenant(req));
}

export async function POST(req: NextRequest) {
  return observePublicRoute(req, "/api/reservations/lookup", lookupReservations, req);
}

async function lookupReservations(req: NextRequest) {
  const tenant = await resolvePublicTenant(req);
  return withCors(await handle(req), tenant ? allowedOrigin(req, tenant) : null);
}

export async function PATCH(req: NextRequest) {
  return observePublicRoute(req, "/api/reservations/lookup", modifyReservation, req);
}

async function modifyReservation(req: NextRequest) {
  const tenant = await resolvePublicTenant(req);
  return withCors(await mutate(req, "modify"), tenant ? allowedOrigin(req, tenant) : null);
}

export async function DELETE(req: NextRequest) {
  return observePublicRoute(req, "/api/reservations/lookup", cancelReservation, req);
}

async function cancelReservation(req: NextRequest) {
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
  const obs = requestContext(req, { surface: "public", actorType: "guest", tenant, route: "/api/reservations/lookup" });

  let body: { email?: unknown; phone?: unknown; _hp?: unknown; _t?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Honeypot and timing checks return neutral lookup-shaped success and run
  // before rate limits so obvious bots do not spend quota for real guests.
  if (String(body._hp ?? "")) {
    await recordAppEvent(eventFromRequest(obs, {
      level: "warn",
      event: "public.lookup.fake_success.honeypot",
      status: 200,
      reason: "honeypot",
    }));
    return fakeLookupOk();
  }
  const pageLoad = Number(body._t) || 0;
  if (pageLoad > 0 && Date.now() - pageLoad < LOOKUP_MIN_SUBMIT_MS) {
    await recordAppEvent(eventFromRequest(obs, {
      level: "warn",
      event: "public.lookup.fake_success.timing_too_fast",
      status: 200,
      reason: "timing_too_fast",
      metadata: { elapsedMs: Date.now() - pageLoad },
    }));
    return fakeLookupOk();
  }

  const email = String(body.email ?? "").trim().slice(0, 200);
  const phone = String(body.phone ?? "").trim().slice(0, 40);

  if (!email || !phone) {
    return NextResponse.json(
      { error: "Email and phone number are required." },
      { status: 400 },
    );
  }

  const normEmail = normalizeEmail(email);
  const normPhone = normalizePhone(phone);

  // Stricter rate limit than booking: 5 lookups per 10 minutes per IP and
  // normalized contact keys. This slows enumeration without revealing whether
  // an email or phone exists.
  const rateChecks = [
    rateLimit(`lookup:${tenant.id}:${clientIp(req)}`, LOOKUP_MAX_ATTEMPTS, LOOKUP_WINDOW_MS),
    normEmail ? rateLimit(`lookup-email:${tenant.id}:${normEmail}`, LOOKUP_MAX_ATTEMPTS, LOOKUP_WINDOW_MS) : Promise.resolve(true),
    normPhone ? rateLimit(`lookup-phone:${tenant.id}:${normPhone}`, LOOKUP_MAX_ATTEMPTS, LOOKUP_WINDOW_MS) : Promise.resolve(true),
    normEmail && normPhone
      ? rateLimit(`lookup-contact:${tenant.id}:${normEmail}:${normPhone}`, LOOKUP_MAX_ATTEMPTS, LOOKUP_WINDOW_MS)
      : Promise.resolve(true),
  ];
  const rateResults = await Promise.all(rateChecks);
  if (rateResults.some((ok) => !ok)) {
    const reason = ["ip", "email", "phone", "contact_pair"][rateResults.findIndex((ok) => !ok)] ?? "unknown";
    await recordAppEvent(eventFromRequest(obs, {
      level: "warn",
      event: `public.lookup.rate_limited.${reason}`,
      status: 429,
      reason,
    }));
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 },
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
    const results = reservations
      .filter((r) => r.source !== "thefork")
      .map((r) => publicView(r, offeringLabelById));

    await recordAppEvent(eventFromRequest(obs, {
      level: "info",
      event: "public.lookup.completed",
      status: 200,
      metadata: { resultCount: results.length, durationMs: elapsedMs(obs) },
    }));

    return NextResponse.json({ reservations: results });
  } catch (err) {
    log.error({
      event: "public.lookup.failed",
      surface: "public",
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      requestId: obs.requestId,
      route: obs.route,
      method: obs.method,
      status: 500,
      durationMs: elapsedMs(obs),
    }, err);
    await recordAppEvent(eventFromRequest(obs, {
      level: "error",
      event: "public.lookup.failed",
      status: 500,
      reason: err instanceof Error ? err.message : "unknown",
    }));
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
  const obs = requestContext(req, { surface: "public", actorType: "guest", tenant, route: "/api/reservations/lookup" });

  if (tenant.status !== "active") {
    return NextResponse.json(
      { error: "This restaurant is not currently accepting online reservation changes." },
      { status: 503 },
    );
  }

  if (!(await rateLimit(`lookup-${action}:${tenant.id}:${clientIp(req)}`, 5, 600_000))) {
    await recordAppEvent(eventFromRequest(obs, {
      level: "warn",
      event: `public.lookup.${action}.rate_limited.ip`,
      status: 429,
      reason: "ip",
    }));
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
    const [reservations, config, tables] = await Promise.all([
      store.findByContact(email, phone),
      store.getConfig(),
      getTableStore(tenant.id).listTables({ activeOnly: true }),
    ]);
    const reservation = reservations.find((r) => referenceOf(r.id) === reference);
    if (!reservation) {
      await recordAppEvent(eventFromRequest(obs, {
        level: "warn",
        event: `public.lookup.${action}.not_found`,
        status: 404,
      }));
      return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    }
    if (reservation.source === "thefork") {
      await recordAppEvent(eventFromRequest(obs, {
        level: "warn",
        event: `public.lookup.${action}.rejected.external_source`,
        status: 409,
        reservationId: reservation.id,
        reference: referenceOf(reservation.id),
        reason: reservation.source,
      }));
      return NextResponse.json({ error: "This reservation can only be managed in the booking channel where it was made." }, { status: 409 });
    }
    if (reservation.status !== "pending" && reservation.status !== "confirmed") {
      await recordAppEvent(eventFromRequest(obs, {
        level: "warn",
        event: `public.lookup.${action}.rejected.status`,
        status: 409,
        reservationId: reservation.id,
        reference: referenceOf(reservation.id),
        reason: reservation.status,
      }));
      return NextResponse.json({ error: "This reservation can no longer be changed online." }, { status: 409 });
    }

    const offerings = getOfferings(config, tenant.name);
    const offeringLabelById =
      offerings.length > 1
        ? Object.fromEntries(offerings.map((o) => [o.id, o.label]))
        : null;

    if (action === "cancel") {
      const updated = await store.updateReservation(reservation.id, { status: "cancelled" });
      await recordAppEvent(eventFromRequest(obs, {
        level: "info",
        event: "public.lookup.cancelled",
        status: 200,
        reservationId: reservation.id,
        reference: referenceOf(reservation.id),
      }));
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
    const check = canBookReservation(config, existingForDate, next, tables);
    if (!check.ok) {
      await recordAppEvent(eventFromRequest(obs, {
        level: "info",
        event: "public.lookup.modify.rejected.unavailable",
        status: 409,
        reservationId: reservation.id,
        reference: referenceOf(reservation.id),
        reason: check.error ?? "unavailable",
      }));
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
    await recordAppEvent(eventFromRequest(obs, {
      level: "info",
      event: "public.lookup.modified",
      status: 200,
      reservationId: reservation.id,
      reference: referenceOf(reservation.id),
      metadata: {
        changedTableFit: changesTableFit,
        date: next.date,
        time: next.time,
        service: next.service,
        offering: next.offering,
        partySize: next.partySize,
      },
    }));
    return NextResponse.json({ ok: true, reservation: updated ? publicView(updated, offeringLabelById) : null });
  } catch (err) {
    log.error({
      event: `public.lookup.${action}.failed`,
      surface: "public",
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      requestId: obs.requestId,
      route: obs.route,
      method: obs.method,
      status: 500,
      durationMs: elapsedMs(obs),
    }, err);
    await recordAppEvent(eventFromRequest(obs, {
      level: "error",
      event: `public.lookup.${action}.failed`,
      status: 500,
      reason: err instanceof Error ? err.message : "unknown",
    }));
    return NextResponse.json(
      { error: "Could not update reservation. Please try again." },
      { status: 500 },
    );
  }
}
