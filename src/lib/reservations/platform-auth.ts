/**
 * Platform-admin (operator) session — the cross-tenant superuser, separate from
 * per-restaurant staff sessions. Same signed-token mechanism as tenant sessions
 * but a distinct cookie and a `role: "platform"` marker, so a tenant session can
 * never be used as a platform session (or vice-versa).
 */
import { sessionCookieOptions, signToken, verifyToken } from "./auth";

export const PLATFORM_COOKIE = "rsv_platform";

export interface PlatformSession {
  role: "platform";
  u: string;
  exp: number;
}

export async function createPlatformSession(username: string): Promise<string> {
  return signToken({ role: "platform", u: username });
}

export async function verifyPlatformSession(
  token: string | undefined,
): Promise<PlatformSession | null> {
  const data = await verifyToken(token);
  if (!data || data.role !== "platform" || typeof data.u !== "string") return null;
  return data as unknown as PlatformSession;
}

export const platformCookieOptions = sessionCookieOptions;
