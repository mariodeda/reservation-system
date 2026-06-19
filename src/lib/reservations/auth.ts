/**
 * Stateless session auth for the admin area. A signed (HMAC-SHA256) token is
 * stored in an httpOnly cookie. Uses Web Crypto only, so the same code runs in
 * Node route handlers and the Edge middleware. Credentials are fixed via env
 * vars — there is no registration.
 */

export const SESSION_COOKIE = "rsv_session";
const TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const enc = new TextEncoder();

function secret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  throw new Error("[reservations] SESSION_SECRET is required. Set it in .env.local.");
}

function bytesToB64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlToBytes(str: string): Uint8Array {
  const norm = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(norm);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const strToB64url = (s: string) => bytesToB64url(enc.encode(s));
const b64urlToStr = (s: string) => new TextDecoder().decode(b64urlToBytes(s));

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return bytesToB64url(new Uint8Array(sig));
}

/**
 * Generic signed-token core (HMAC-SHA256 over a base64url JSON body, with an
 * embedded expiry). Both the tenant session and the platform session are built
 * on this. Web Crypto only, so it verifies in the Edge proxy too.
 */
export async function signToken(payload: Record<string, unknown>): Promise<string> {
  const body = strToB64url(JSON.stringify({ ...payload, exp: Date.now() + TTL_MS }));
  return `${body}.${await hmac(body)}`;
}

export async function verifyToken(
  token: string | undefined,
): Promise<Record<string, unknown> | null> {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!timingSafeEqual(sig, await hmac(body))) return null;
  try {
    const data = JSON.parse(b64urlToStr(body)) as Record<string, unknown>;
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export interface SessionPayload {
  /** Tenant id the session is scoped to. */
  tid: string;
  u: string;
  exp: number;
}

export async function createSession(tenantId: string, username: string): Promise<string> {
  return signToken({ tid: tenantId, u: username });
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  const data = await verifyToken(token);
  if (!data || typeof data.tid !== "string" || typeof data.u !== "string") return null;
  return data as unknown as SessionPayload;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: TTL_MS / 1000,
};
