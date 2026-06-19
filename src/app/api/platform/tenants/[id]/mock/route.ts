import { NextResponse, type NextRequest } from "next/server";
import { getTenantStore } from "@/lib/reservations/tenant-store";
import { requirePlatform } from "@/lib/reservations/tenant-context";
import {
  clearTenantData,
  seedAll,
  seedCustomers,
  seedFeedback,
  seedReservations,
  seedTables,
  seedWaitlist,
  type MockSummary,
} from "@/lib/reservations/mock-data";

export const runtime = "nodejs";

type Action =
  | "tables"
  | "customers"
  | "reservations-today"
  | "reservations-upcoming"
  | "reservations-history"
  | "waitlist"
  | "feedback"
  | "all"
  | "clear";

const RUN: Record<Action, (tenantId: string) => Promise<MockSummary>> = {
  tables: (t) => seedTables(t),
  customers: (t) => seedCustomers(t),
  "reservations-today": (t) => seedReservations(t, "today"),
  "reservations-upcoming": (t) => seedReservations(t, "upcoming"),
  "reservations-history": (t) => seedReservations(t, "history"),
  waitlist: (t) => seedWaitlist(t),
  feedback: (t) => seedFeedback(t),
  all: (t) => seedAll(t),
  clear: (t) => clearTenantData(t),
};

/** POST /api/platform/tenants/[id]/mock  { action } — platform debug data tools. */
export async function POST(req: NextRequest, ctxArg: { params: Promise<{ id: string }> }) {
  const ctx = await requirePlatform(req);
  if (!ctx.ok) return ctx.res;

  const { id } = await ctxArg.params;
  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const action = body.action as Action | undefined;
  if (!action || !(action in RUN)) {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  if (!(await getTenantStore().getById(id))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const summary = await RUN[action](id);
    return NextResponse.json({ ok: true, action, summary });
  } catch (err) {
    console.error(`[mock] ${action} failed for tenant ${id}:`, err);
    return NextResponse.json({ error: "Mock-data operation failed." }, { status: 500 });
  }
}
