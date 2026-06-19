/**
 * Tenant model for the multi-tenant reservation system. A tenant = one
 * restaurant: its branding/identity (settings), its login credentials, and the
 * hostname(s) that route to it.
 *
 * Password hashing uses node:crypto scrypt (Node runtime only — never imported
 * from the Edge proxy, which only verifies the HMAC session cookie).
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { AvailabilityConfig } from "./types";
import {
  autoConfirm,
  brand,
  defaultAvailability,
  emailEnabled,
  emailTemplates,
} from "@/reservation.config";

export interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

/** Per-tenant SMTP transport. Each restaurant sends from its own mail server. */
export interface TenantSmtp {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  /** Explicit From header; falls back to "<name> <user|contactEmail>". */
  from?: string;
}

/** Per-tenant identity/branding. Stored as JSON on the tenant row. */
export interface TenantSettings {
  name: string;
  url: string;
  contactEmail: string;
  contactPhone: string;
  locale: string;
  timezone: string;
  autoConfirm: boolean;
  emailEnabled: boolean;
  /** Optional explicit From header. */
  emailFrom?: string;
  /** Brand accent colors injected as CSS variables on the reservation page. */
  theme?: { primary?: string; onPrimary?: string };
  /**
   * Optional brand logo shown on the staff login screen and admin header.
   * An absolute https?:// URL or a root-relative path (/…). Falls back to the
   * tenant name wordmark when unset.
   */
  logoUrl?: string;
  /** Per-tenant SMTP. If absent, confirmation emails are skipped. */
  smtp?: TenantSmtp;
  /** Optional per-tenant templates; falls back to the platform default. */
  emailTemplates?: { confirmation: EmailTemplate; feedbackRequest?: EmailTemplate };
  /** Send post-visit feedback request emails for completed reservations. */
  feedbackEnabled?: boolean;
  /**
   * Browser origins allowed to call the public booking API for this tenant
   * (CORS). Each entry is a scheme://host[:port]. Empty/absent => no cross-origin
   * browser access (same-origin still works). Used when a marketing site on a
   * different domain books against the shared reservation service.
   */
  allowedOrigins?: string[];
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: "active" | "disabled";
  /**
   * Stable, public, non-secret identifier the marketing site sends to select
   * this tenant on the shared reservation API (e.g. "pk_ab12…"). Decoupled from
   * slug/host so renames and domain changes never break booking. Rotatable.
   */
  publicKey: string;
  settings: TenantSettings;
  adminUsername: string;
  /** scrypt$salt$hash */
  adminPasswordHash: string;
  createdAt: string;
}

/** Generate a fresh, opaque public tenant key. Safe to expose in frontends. */
export function generatePublicKey(): string {
  return `pk_${randomBytes(16).toString("hex")}`;
}

/** Settings derived from the per-site template (reservation.config.ts). */
export function templateSettings(): TenantSettings {
  return {
    name: brand.name,
    url: brand.url,
    contactEmail: brand.contactEmail,
    contactPhone: brand.contactPhone,
    locale: brand.locale,
    timezone: defaultAvailability.timezone,
    autoConfirm,
    emailEnabled,
    emailTemplates: { confirmation: emailTemplates.confirmation },
  };
}

export function templateAvailability(): AvailabilityConfig {
  return structuredClone(defaultAvailability);
}

/** Platform default confirmation template (fallback when a tenant has none). */
export function defaultConfirmationTemplate(): EmailTemplate {
  return emailTemplates.confirmation;
}

/* ----------------------------- credentials ----------------------------- */

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const dk = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${dk.toString("hex")}`;
}

function timingSafeStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, saltHex, hashHex] = parts;
  let dk: Buffer;
  try {
    dk = scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  } catch {
    return false;
  }
  const want = Buffer.from(hashHex, "hex");
  return want.length === dk.length && timingSafeEqual(want, dk);
}

/** Validate a login against a tenant's stored credentials. Timing-safe. */
export function verifyTenantLogin(t: Tenant, username: string, password: string): boolean {
  if (t.status !== "active") return false;
  if (!t.adminUsername || !timingSafeStr(username, t.adminUsername)) return false;
  return verifyPassword(password, t.adminPasswordHash);
}
