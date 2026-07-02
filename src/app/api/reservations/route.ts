import { NextResponse, type NextRequest } from "next/server";
import { getStore, referenceOf } from "@/lib/reservations/store";
import { canBook, normalizeEmail, normalizePhone, nowInTz, scheduleForDate } from "@/lib/reservations/availability";
import { getTableStore } from "@/lib/reservations/table-store";
import { getOfferings } from "@/lib/reservations/offerings";
import { sendConfirmationEmail } from "@/lib/reservations/email";
import { clientIp, rateLimit } from "@/lib/reservations/rate-limit";
import { requireTenant, resolvePublicTenant } from "@/lib/reservations/tenant-context";
import { allowedOrigin, preflight, withCors } from "@/lib/reservations/cors";
import { ACTIVE_STATUSES, type NewReservationInput } from "@/lib/reservations/types";
import { emitReservation } from "@/lib/reservations/events";
import { log } from "@/lib/observability/logger";
import { eventFromRequest, recordAppEvent } from "@/lib/observability/app-event-store";
import { elapsedMs, requestContext } from "@/lib/observability/request-context";
import { observePublicRoute } from "@/lib/observability/route-events";

export const runtime = "nodejs";

const cap = (v: unknown, n: number) => String(v ?? "").slice(0, n);
const BOOKING_MIN_SUBMIT_MS = 1_500;
const BOOKING_MAX_SUBMIT_AGE_MS = 2 * 60 * 60_000;

// Silent fake-success used for honeypot/timing hits — gives bots no signal.
// A factory (not a shared instance) so per-request CORS headers don't leak across calls.
const fakeOk = () => NextResponse.json({ ok: true, reference: "000000", emailSent: false }, { status: 201 });

/** Max active future reservations allowed per contact (email or phone). */
const MAX_ACTIVE_PER_CONTACT = 2;

/** CORS preflight for cross-origin marketing sites. */
export async function OPTIONS(req: NextRequest) {
  return observePublicRoute(req, "/api/reservations", reservationsOptions, req);
}

async function reservationsOptions(req: NextRequest) {
  return preflight(req, await resolvePublicTenant(req));
}

/** POST /api/reservations — public booking. Validates, persists atomically, emails. */
export async function POST(req: NextRequest) {
  return observePublicRoute(req, "/api/reservations", createPublicReservation, req);
}

async function createPublicReservation(req: NextRequest) {
  const tenant = await resolvePublicTenant(req);
  return withCors(await handle(req), tenant ? allowedOrigin(req, tenant) : null);
}

async function handle(req: NextRequest) {
  const resolved = await requireTenant(req);
  if (!resolved.ok) return resolved.res;
  const { tenant } = resolved;
  const obs = requestContext(req, { surface: "public", actorType: "guest", tenant, route: "/api/reservations" });

  if (tenant.status !== "active") {
    await recordAppEvent(eventFromRequest(obs, {
      level: "warn",
      event: "public.booking.rejected.tenant_disabled",
      status: 503,
    }));
    return NextResponse.json(
      { error: "This restaurant is not currently accepting online reservations." },
      { status: 503 },
    );
  }

  const len = Number(req.headers.get("content-length") || 0);
  if (len > 16_384) {
    await recordAppEvent(eventFromRequest(obs, {
      level: "warn",
      event: "public.booking.rejected.request_too_large",
      status: 413,
      metadata: { contentLength: len },
    }));
    return NextResponse.json({ error: "Request too large." }, { status: 413 });
  }

  let body: Partial<NewReservationInput> & { _hp?: string; _t?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Honeypot: invisible field that only bots fill in — checked before rate limit
  // so bot traffic does not consume quota for real users on the same IP.
  if (body._hp) {
    await recordAppEvent(eventFromRequest(obs, {
      level: "warn",
      event: "public.booking.fake_success.honeypot",
      status: 201,
      reason: "honeypot",
    }));
    return fakeOk();
  }

  // Timing token: public web bookings must include the marketing page-load
  // timestamp. Missing/invalid/replayed values get the same neutral response as
  // the honeypot so direct scripts do not get a useful signal or consume quota.
  const pageLoad = Number(body._t);
  const elapsed = Date.now() - pageLoad;
  if (!Number.isFinite(pageLoad) || elapsed < BOOKING_MIN_SUBMIT_MS || elapsed > BOOKING_MAX_SUBMIT_AGE_MS) {
    const reason = !Number.isFinite(pageLoad)
      ? "timing_invalid"
      : elapsed < BOOKING_MIN_SUBMIT_MS
        ? "timing_too_fast"
        : "timing_stale";
    await recordAppEvent(eventFromRequest(obs, {
      level: "warn",
      event: `public.booking.fake_success.${reason}`,
      status: 201,
      reason,
      metadata: { elapsedMs: Number.isFinite(elapsed) ? elapsed : undefined },
    }));
    return fakeOk();
  }

  // IP rate-limit: 8 attempts per minute per tenant
  if (!(await rateLimit(`book:${tenant.id}:${clientIp(req)}`, 8, 60_000))) {
    await recordAppEvent(eventFromRequest(obs, {
      level: "warn",
      event: "public.booking.rate_limited.ip",
      status: 429,
      reason: "ip",
    }));
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const input: NewReservationInput = {
    date: cap(body.date, 10),
    time: cap(body.time, 5),
    offering: body.offering ? cap(body.offering, 40) : undefined,
    service: cap(body.service, 40),
    partySize: Math.trunc(Number(body.partySize)),
    name: cap(body.name, 120),
    email: cap(body.email, 200),
    phone: cap(body.phone, 40),
    occasion: body.occasion ? cap(body.occasion, 80) : undefined,
    notes: body.notes ? cap(body.notes, 1000) : undefined,
    source: "web",
    status: tenant.settings.autoConfirm ? "confirmed" : "pending",
  };

  const normEmail = normalizeEmail(input.email);
  const normPhone = normalizePhone(input.phone);

  try {
    const store = getStore().forTenant(tenant.id);
    const [config, tables] = await Promise.all([
      store.getConfig(),
      getTableStore(tenant.id).listTables({ activeOnly: true }),
    ]);

    // Per-contact daily rate-limit: max 3 bookings per email or phone per 24 h.
    // Only applied when the contact field is non-empty — empty values fail canBook() anyway
    // and must not be used as rate-limit keys (they'd collapse all empty-email requests into one bucket).
    if (normEmail && !(await rateLimit(`book-email:${tenant.id}:${normEmail}`, 3, 86_400_000))) {
      await recordAppEvent(eventFromRequest(obs, {
        level: "warn",
        event: "public.booking.rate_limited.email",
        status: 429,
        reason: "email",
      }));
      return NextResponse.json({ error: "Too many bookings from this email address. Please contact us directly." }, { status: 429 });
    }
    if (normPhone && !(await rateLimit(`book-phone:${tenant.id}:${normPhone}`, 3, 86_400_000))) {
      await recordAppEvent(eventFromRequest(obs, {
        level: "warn",
        event: "public.booking.rate_limited.phone",
        status: 429,
        reason: "phone",
      }));
      return NextResponse.json({ error: "Too many bookings from this phone number. Please contact us directly." }, { status: 429 });
    }

    // Max concurrent active future reservations per contact.
    // Prevents holding-pattern spam (booking every slot and cancelling).
    const today = nowInTz(config.timezone).dateStr;
    const activeByContact = await store.countActiveByContact(today, normEmail, normPhone);
    if (activeByContact >= MAX_ACTIVE_PER_CONTACT) {
      await recordAppEvent(eventFromRequest(obs, {
        level: "warn",
        event: "public.booking.rejected.max_active_contact",
        status: 409,
        reason: "max_active_contact",
        metadata: { activeCount: activeByContact },
      }));
      return NextResponse.json(
        { error: "You already have the maximum number of active reservations. Please contact us to make changes." },
        { status: 409 },
      );
    }

    const inputOffering = input.offering && input.offering.length > 0 ? input.offering : "main";

    // Validate + insert atomically so concurrent bookings can't overbook a slot.
    const result = await store.createReservationChecked(input, (existing) => {
      // Duplicate contact in the same date + same offering + service period
      // (email OR phone). Keyed by (offering, service) so a guest booking, say,
      // dinner in two different offerings on the same day isn't falsely blocked.
      const contactDup = existing.find(
        (r) =>
          ACTIVE_STATUSES.includes(r.status) &&
          (r.offering || "main") === inputOffering &&
          r.service === input.service &&
          (normalizeEmail(r.email) === normEmail || normalizePhone(r.phone) === normPhone),
      );
      if (contactDup) {
        return normalizeEmail(contactDup.email) === normEmail
          ? "You already have a booking for that date and service."
          : "A booking already exists for this phone number on that date and service.";
      }
      const check = canBook(config, existing, input, tables);
      return check.ok ? null : check.error ?? "Unavailable.";
    });

    if (result.error || !result.reservation) {
      await recordAppEvent(eventFromRequest(obs, {
        level: "info",
        event: "public.booking.rejected.unavailable",
        status: 409,
        reason: result.error ?? "unavailable",
        metadata: { date: input.date, time: input.time, service: input.service, offering: inputOffering },
      }));
      return NextResponse.json({ error: result.error ?? "Unavailable." }, { status: 409 });
    }

    const serviceLabel = scheduleForDate(config, input.date, inputOffering).services.find(
      (s) => s.id === input.service,
    )?.label;
    // For multi-offering venues, prefix the offering so the confirmation email
    // reads e.g. "Cocktails · Evening". Single-offering emails are unchanged.
    const offs = getOfferings(config, tenant.name);
    const offeringLabel = offs.find((o) => o.id === inputOffering)?.label;
    const emailLabel =
      offs.length > 1 && offeringLabel
        ? serviceLabel
          ? `${offeringLabel} · ${serviceLabel}`
          : offeringLabel
        : serviceLabel;
    const email = result.reservation.status === "confirmed"
      ? await sendConfirmationEmail(result.reservation, tenant, emailLabel, config)
      : { sent: false };

    emitReservation({
      type: "reservation.created",
      tenantId: tenant.id,
      id: result.reservation.id,
      name: result.reservation.name,
      partySize: result.reservation.partySize,
      date: result.reservation.date,
      time: result.reservation.time,
      service: result.reservation.service,
      offering: result.reservation.offering ?? "main",
      source: "web",
    });

    const reference = referenceOf(result.reservation.id);
    await recordAppEvent(eventFromRequest(obs, {
      level: "info",
      event: "public.booking.created",
      status: 201,
      reservationId: result.reservation.id,
      reference,
      metadata: {
        date: result.reservation.date,
        time: result.reservation.time,
        service: result.reservation.service,
        offering: result.reservation.offering ?? "main",
        partySize: result.reservation.partySize,
        status: result.reservation.status,
        emailSent: email.sent,
        durationMs: elapsedMs(obs),
      },
    }));
    log.info({
      event: "public.booking.created",
      surface: "public",
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      requestId: obs.requestId,
      route: obs.route,
      method: obs.method,
      status: 201,
      durationMs: elapsedMs(obs),
      reservationId: result.reservation.id,
      reference,
    });

    return NextResponse.json(
      { ok: true, reference, emailSent: email.sent },
      { status: 201 },
    );
  } catch (err) {
    log.error({
      event: "public.booking.failed",
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
      event: "public.booking.failed",
      status: 500,
      reason: err instanceof Error ? err.message : "unknown",
    }));
    return NextResponse.json(
      { error: "We couldn't process your booking right now. Please try again." },
      { status: 500 },
    );
  }
}
