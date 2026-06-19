import { NextResponse, type NextRequest } from "next/server";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/reservations/auth";
import { clientIp, rateLimit } from "@/lib/reservations/rate-limit";
import { resolveTenant } from "@/lib/reservations/tenant-context";
import { verifyTenantLogin } from "@/lib/reservations/tenant";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const tenant = await resolveTenant(req);
  if (!tenant) {
    return NextResponse.json({ error: "Unknown tenant for this host." }, { status: 404 });
  }

  // throttle credential stuffing / brute force — 5 attempts per 15 minutes per tenant+IP
  if (!(await rateLimit(`login:${tenant.id}:${clientIp(req)}`, 5, 15 * 60_000))) {
    return NextResponse.json(
      { error: "Too many login attempts. Please wait 15 minutes before trying again." },
      { status: 429 },
    );
  }

  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const username = String(body.username ?? "").slice(0, 200);
  const password = String(body.password ?? "").slice(0, 200);

  if (!verifyTenantLogin(tenant, username, password)) {
    return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, username });
  res.cookies.set(SESSION_COOKIE, await createSession(tenant.id, username), sessionCookieOptions);
  return res;
}
