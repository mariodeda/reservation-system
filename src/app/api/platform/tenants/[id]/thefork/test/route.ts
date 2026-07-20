import { NextResponse, type NextRequest } from "next/server";
import { testTheForkCredentials } from "@/lib/reservations/thefork-client";
import { requirePlatform } from "@/lib/reservations/tenant-context";
import { getTheForkIntegration } from "@/lib/reservations/thefork-store";
import { observePlatformRoute } from "@/lib/observability/route-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return observePlatformRoute(req, "/api/platform/tenants/[id]/thefork/test", testIntegration, req, ctx);
}

async function testIntegration(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const platform = await requirePlatform(req);
  if (!platform.ok) return platform.res;
  const { id } = await ctx.params;
  const integration = await getTheForkIntegration(id);
  if (!integration) return NextResponse.json({ error: "TheFork integration is not configured." }, { status: 404 });
  try {
    await testTheForkCredentials(integration);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "TheFork credential test failed." }, { status: 502 });
  }
}
