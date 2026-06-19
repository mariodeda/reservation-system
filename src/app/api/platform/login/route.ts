import { NextResponse, type NextRequest } from "next/server";
import { createPlatformSession, PLATFORM_COOKIE, platformCookieOptions } from "@/lib/reservations/platform-auth";
import { getPlatformStore } from "@/lib/reservations/platform-store";
import { clientIp, rateLimit } from "@/lib/reservations/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!(await rateLimit(`platform-login:${clientIp(req)}`, 5, 15 * 60_000))) {
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
  const password = String(body.password ?? "").slice(0, 400);

  if (!(await getPlatformStore().verifyLogin(username, password))) {
    return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true, username });
  res.cookies.set(PLATFORM_COOKIE, await createPlatformSession(username), platformCookieOptions);
  return res;
}
