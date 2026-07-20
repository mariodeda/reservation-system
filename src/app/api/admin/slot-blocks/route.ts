import { NextResponse, type NextRequest } from "next/server";
import { generateSlots, scheduleForDate } from "@/lib/reservations/availability";
import { getOfferings } from "@/lib/reservations/offerings";
import { getStore } from "@/lib/reservations/store";
import { isDate, isTime, sanitizeConfig } from "@/lib/reservations/sanitize-config";
import { requireAdmin } from "@/lib/reservations/tenant-context";
import { DEFAULT_OFFERING_ID, type AvailabilityConfig, type OfferingId } from "@/lib/reservations/types";
import { observeAdminRoute } from "@/lib/observability/route-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SlotBlockBody {
  date?: unknown;
  offering?: unknown;
  time?: unknown;
  blocked?: unknown;
}

export async function PATCH(req: NextRequest) {
  return observeAdminRoute(req, "/api/admin/slot-blocks", patchSlotBlock, req);
}

async function patchSlotBlock(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (!ctx.ok) return ctx.res;

  let body: SlotBlockBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const rawDate = body.date;
  const rawTime = body.time;
  const offering = String(body.offering ?? DEFAULT_OFFERING_ID).slice(0, 40) as OfferingId;
  const blocked = Boolean(body.blocked);
  if (!isDate(rawDate) || !isTime(rawTime) || !offering) {
    return NextResponse.json({ error: "Date, offering, time, and blocked state are required." }, { status: 400 });
  }
  const date = rawDate as string;
  const time = rawTime as string;

  const store = getStore().forTenant(ctx.tenant.id);
  const config = await store.getConfig();
  const offerings = getOfferings(config, ctx.tenant.name);
  if (!offerings.some((o) => o.id === offering)) {
    return NextResponse.json({ error: "Offering not found." }, { status: 404 });
  }

  const schedule = scheduleForDate(config, date, offering);
  const validSlot = !schedule.closed && schedule.services.some((service) => generateSlots(service).includes(time));
  if (!validSlot) {
    return NextResponse.json({ error: "That time is not configured for this date." }, { status: 404 });
  }

  const saved = await store.saveConfig(sanitizeConfig(updateBlockedSlot(config, offering, date, time, blocked)));
  const savedOffering = getOfferings(saved, ctx.tenant.name).find((o) => o.id === offering);
  return NextResponse.json({
    ok: true,
    date,
    offering,
    time,
    blocked,
    blockedSlots: savedOffering?.blockedSlots[date] ?? [],
  });
}

function updateBlockedSlot(
  config: AvailabilityConfig,
  offeringId: OfferingId,
  date: string,
  time: string,
  blocked: boolean,
): AvailabilityConfig {
  const next = structuredClone(config);
  const apply = (slots: Record<string, string[]> | undefined): Record<string, string[]> => {
    const out = { ...(slots ?? {}) };
    const times = new Set(out[date] ?? []);
    if (blocked) times.add(time);
    else times.delete(time);
    if (times.size) out[date] = [...times].sort();
    else delete out[date];
    return out;
  };

  if (next.offerings?.length) {
    next.offerings = next.offerings.map((offering, index) =>
      offering.id === offeringId || (offeringId === DEFAULT_OFFERING_ID && index === 0)
        ? { ...offering, blockedSlots: apply(offering.blockedSlots) }
        : offering,
    );
    const primary = next.offerings[0];
    if (offeringId === DEFAULT_OFFERING_ID || primary?.id === offeringId) {
      next.blockedSlots = primary?.blockedSlots ?? {};
    }
  } else {
    next.blockedSlots = apply(next.blockedSlots);
  }

  return next;
}
