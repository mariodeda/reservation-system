import { NextResponse, type NextRequest } from "next/server";
import { observePlatformRoute } from "@/lib/observability/route-events";
import { testDishCredentials } from "@/lib/reservations/dish-client";
import { getDishIntegration } from "@/lib/reservations/dish-store";
import { requirePlatform } from "@/lib/reservations/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return observePlatformRoute(req, "/api/platform/tenants/[id]/dish/test", testIntegration, req, ctx);
}

async function testIntegration(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const platform = await requirePlatform(req);
  if (!platform.ok) return platform.res;
  const { id } = await ctx.params;
  const integration = await getDishIntegration(id);
  if (!integration) return NextResponse.json({ error: "DISH integration is not configured." }, { status: 404 });
  try {
    await testDishCredentials(integration);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "DISH credential test failed." }, { status: 502 });
  }
}
