import { NextResponse, type NextRequest } from "next/server";
import { IMPERSONATION_COOKIE, SESSION_COOKIE, verifyImpersonationSession, verifySession } from "@/lib/reservations/auth";
import { PLATFORM_COOKIE, verifyPlatformSession } from "@/lib/reservations/platform-auth";

// Next.js 16 renamed the `middleware` convention to `proxy`.
export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/platform/:path*", "/api/platform/:path*"],
};

function noindex<T extends Response>(res: T): T {
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

function hasCronAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  return constantTimeEqual(secret, token);
}

function hasBounceAuth(req: NextRequest): boolean {
  const secret = process.env.BOUNCE_WEBHOOK_SECRET || process.env.CRON_SECRET;
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  return constantTimeEqual(secret, token);
}

function isCronEndpoint(pathname: string): boolean {
  return pathname === "/api/platform/cron/smtp-health" ||
    pathname === "/api/platform/cron/feedback-requests" ||
    pathname === "/api/platform/cron/reminder-emails" ||
    pathname === "/api/platform/cron/dish-sync";
}

function constantTimeEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ---- Platform (operator) console: gated by the platform session ----
  if (pathname.startsWith("/platform") || pathname.startsWith("/api/platform")) {
    if (pathname === "/platform/login" || pathname === "/api/platform/login") {
      return noindex(NextResponse.next());
    }
    if (isCronEndpoint(pathname)) {
      if (hasCronAuth(req)) return noindex(NextResponse.next());
      return noindex(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    if (pathname === "/api/platform/bounces" && hasBounceAuth(req)) {
      return noindex(NextResponse.next());
    }
    const platform = await verifyPlatformSession(req.cookies.get(PLATFORM_COOKIE)?.value);
    if (platform) return noindex(NextResponse.next());
    if (pathname.startsWith("/api/")) {
      return noindex(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    const url = req.nextUrl.clone();
    url.pathname = "/platform/login";
    url.searchParams.set("next", pathname);
    return noindex(NextResponse.redirect(url));
  }

  // ---- Per-restaurant staff admin: gated by the tenant session ----
  // Public admin paths (no session needed): the slug-scoped login screen
  // (/admin/<slug>/login), the login API, and the bare /admin landing.
  const slug = pathname.match(/^\/admin\/([^/]+)(?:\/|$)/)?.[1];
  const isLoginPage = !!slug && pathname === `/admin/${slug}/login`;
  if (
    isLoginPage ||
    pathname === "/api/admin/login" ||
    pathname === "/admin" ||
    pathname === "/admin/"
  ) {
    return noindex(NextResponse.next());
  }

  // The edge can't reach the DB, so it only verifies the session cookie's HMAC.
  // The slug<->session binding is enforced server-side (resolveAdminPage).
  const session =
    await verifySession(req.cookies.get(SESSION_COOKIE)?.value) ||
    await verifyImpersonationSession(req.cookies.get(IMPERSONATION_COOKIE)?.value);
  if (session) return noindex(NextResponse.next());

  if (pathname.startsWith("/api/")) {
    return noindex(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }
  const url = req.nextUrl.clone();
  // Send unauthenticated staff to their tenant's login when we can derive it,
  // else to the landing page.
  url.pathname = slug ? `/admin/${slug}/login` : "/admin";
  url.search = "";
  if (slug) url.searchParams.set("next", pathname);
  return noindex(NextResponse.redirect(url));
}
