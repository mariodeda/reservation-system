import { NextResponse, type NextRequest } from "next/server";
import { createPlatformSession, PLATFORM_COOKIE, platformCookieOptions } from "@/lib/reservations/platform-auth";
import { getPlatformStore } from "@/lib/reservations/platform-store";
import { clientIp, rateLimit } from "@/lib/reservations/rate-limit";
import { eventFromRequest, recordAppEvent } from "@/lib/observability/app-event-store";
import { hashValue } from "@/lib/observability/logger";
import { requestContext } from "@/lib/observability/request-context";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const obs = requestContext(req, { surface: "platform", actorType: "platform", route: "/api/platform/login" });
  if (!(await rateLimit(`platform-login:${clientIp(req)}`, 5, 15 * 60_000))) {
    await recordAppEvent(eventFromRequest(obs, {
      level: "warn",
      event: "platform.auth.rate_limited.ip",
      status: 429,
      reason: "ip",
    }));
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
    await recordAppEvent(eventFromRequest(obs, {
      level: "warn",
      event: "platform.auth.login_failed",
      status: 401,
      reason: "bad_credentials",
      metadata: { usernameHash: hashValue(username) },
    }));
    return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true, username });
  res.cookies.set(PLATFORM_COOKIE, await createPlatformSession(username), platformCookieOptions);
  await recordAppEvent(eventFromRequest({ ...obs, actorId: username }, {
    level: "info",
    event: "platform.auth.login_succeeded",
    status: 200,
  }));
  return res;
}
