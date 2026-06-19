import { NextResponse, type NextRequest } from "next/server";
import { getTenantStore } from "@/lib/reservations/tenant-store";
import { requirePlatform } from "@/lib/reservations/tenant-context";

export const runtime = "nodejs";

const hostRe = /^[a-z0-9.-]+$/;

/** POST /api/platform/tenants/[id]/domains  { host } — map a host to the tenant. */
export async function POST(req: NextRequest, ctxArg: { params: Promise<{ id: string }> }) {
  const ctx = await requirePlatform(req);
  if (!ctx.ok) return ctx.res;
  const { id } = await ctxArg.params;
  let body: { host?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  const host = String(body.host ?? "").trim().toLowerCase();
  if (!host || !hostRe.test(host)) {
    return NextResponse.json({ error: "Invalid host." }, { status: 400 });
  }
  const store = getTenantStore();
  if (!(await store.getById(id))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    await store.addDomain(id, host);
    return NextResponse.json({ ok: true, hosts: await store.listDomains(id) });
  } catch (err) {
    console.error("[platform] add domain failed:", err);
    return NextResponse.json({ error: "Could not map host." }, { status: 500 });
  }
}

/** DELETE /api/platform/tenants/[id]/domains  { host } — unmap a host. */
export async function DELETE(req: NextRequest, ctxArg: { params: Promise<{ id: string }> }) {
  const ctx = await requirePlatform(req);
  if (!ctx.ok) return ctx.res;
  const { id } = await ctxArg.params;
  let body: { host?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  const host = String(body.host ?? "").trim().toLowerCase();
  const store = getTenantStore();
  await store.removeDomain(host);
  return NextResponse.json({ ok: true, hosts: await store.listDomains(id) });
}
