/**
 * Sanitises untrusted tenant-settings input (from the platform console) into a
 * safe TenantSettings. Pure (no I/O), so it's unit-testable and reused by the
 * platform API. Strings are length-capped, numbers clamped, theme colors and
 * SMTP validated.
 */
import type { EmailTemplate, TenantSettings, TenantSmtp } from "./tenant";

const str = (v: unknown, max: number, dflt = ""): string =>
  typeof v === "string" ? v.slice(0, max) : dflt;

const isHex = (v: unknown): v is string =>
  typeof v === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate a brand logo location: an absolute http(s) URL or a root-relative
 * path (/logos/acme.png). Anything else (javascript:, data:, protocol-relative,
 * bare strings) is rejected. Capped at 500 chars.
 */
function sanitizeLogoUrl(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const s = input.trim().slice(0, 500);
  if (!s) return undefined;
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  try {
    const u = new URL(s);
    if (u.protocol === "http:" || u.protocol === "https:") return s;
  } catch {
    /* not a URL */
  }
  return undefined;
}

const SMTP_PORTS = new Set([25, 465, 587, 2525]);

const clampPort = (v: unknown): number => {
  const n = Math.trunc(Number(v));
  if (Number.isFinite(n) && SMTP_PORTS.has(n)) return n;
  // fall back to the most common submission port
  return 587;
};

/** Normalize one CORS origin: scheme://host[:port], no path/trailing slash. */
function normalizeOrigin(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin.toLowerCase(); // drops path/query, normalizes default ports
  } catch {
    return null;
  }
}

/** Validate, de-dupe and cap the per-tenant CORS allow-list (max 20). */
function sanitizeAllowedOrigins(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const out: string[] = [];
  for (const v of input) {
    const o = normalizeOrigin(v);
    if (o && !out.includes(o)) out.push(o);
    if (out.length >= 20) break;
  }
  return out.length ? out : undefined;
}

function sanitizeSmtp(input: unknown): TenantSmtp | undefined {
  if (!input || typeof input !== "object") return undefined;
  const s = input as Record<string, unknown>;
  const host = str(s.host, 255).trim();
  if (!host) return undefined; // no host => no SMTP
  const smtp: TenantSmtp = {
    host,
    port: clampPort(s.port),
    secure: Boolean(s.secure),
  };
  const user = str(s.user, 200).trim();
  const pass = typeof s.pass === "string" ? s.pass.slice(0, 400) : "";
  const from = str(s.from, 200).trim();
  if (user) smtp.user = user;
  if (pass) smtp.pass = pass;
  if (from) smtp.from = from;
  return smtp;
}

function parseTemplate(c: unknown): EmailTemplate | undefined {
  if (!c || typeof c !== "object") return undefined;
  const t = c as Record<string, unknown>;
  if (typeof t.subject !== "string" || typeof t.text !== "string" || typeof t.html !== "string") return undefined;
  return { subject: t.subject.slice(0, 300), text: t.text.slice(0, 20000), html: t.html.slice(0, 50000) };
}

function sanitizeTemplate(input: unknown): TenantSettings["emailTemplates"] | undefined {
  if (!input || typeof input !== "object") return undefined;
  const obj = input as Record<string, unknown>;
  const confirmation = parseTemplate(obj.confirmation);
  const feedbackRequest = parseTemplate(obj.feedbackRequest);
  if (!confirmation && !feedbackRequest) return undefined;
  return {
    ...(confirmation ? { confirmation } : {}),
    ...(feedbackRequest ? { feedbackRequest } : {}),
  } as TenantSettings["emailTemplates"];
}

export function sanitizeTenantSettings(input: Partial<TenantSettings>): TenantSettings {
  const theme: { primary?: string; onPrimary?: string } = {};
  if (input.theme && typeof input.theme === "object") {
    if (isHex(input.theme.primary)) theme.primary = input.theme.primary;
    if (isHex(input.theme.onPrimary)) theme.onPrimary = input.theme.onPrimary;
  }

  const settings: TenantSettings = {
    name: str(input.name, 160, "Restaurant") || "Restaurant",
    url: str(input.url, 300),
    contactEmail: str(input.contactEmail, 200),
    contactPhone: str(input.contactPhone, 60),
    locale: str(input.locale, 35) || "en-US",
    timezone: (() => { const tz = str(input.timezone, 64); return tz && isValidTimezone(tz) ? tz : "Europe/Rome"; })(),
    autoConfirm: Boolean(input.autoConfirm),
    emailEnabled: Boolean(input.emailEnabled),
    feedbackEnabled: Boolean(input.feedbackEnabled),
  };
  const emailFrom = str(input.emailFrom, 200).trim();
  if (emailFrom) settings.emailFrom = emailFrom;
  if (Object.keys(theme).length) settings.theme = theme;
  const logoUrl = sanitizeLogoUrl(input.logoUrl);
  if (logoUrl) settings.logoUrl = logoUrl;
  const allowedOrigins = sanitizeAllowedOrigins(input.allowedOrigins);
  if (allowedOrigins) settings.allowedOrigins = allowedOrigins;
  const smtp = sanitizeSmtp(input.smtp);
  if (smtp) settings.smtp = smtp;
  const templates = sanitizeTemplate(input.emailTemplates);
  if (templates) settings.emailTemplates = templates;
  return settings;
}

/** Strip secrets before returning settings to the client (platform UI). */
export function redactSettings(settings: TenantSettings): TenantSettings & { smtpPassSet: boolean } {
  const smtpPassSet = Boolean(settings.smtp?.pass);
  const clone = structuredClone(settings);
  if (clone.smtp) delete clone.smtp.pass;
  return { ...clone, smtpPassSet };
}
