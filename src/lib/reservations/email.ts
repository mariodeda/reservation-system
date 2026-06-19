import nodemailer from "nodemailer";
import type { Reservation } from "./types";
import { referenceOf } from "./store";
import { defaultConfirmationTemplate, type Tenant } from "./tenant";

/**
 * Stable variable contract shared by every site's templates. Templates differ
 * per tenant (see Tenant.settings.emailTemplates) but always receive these keys.
 */
export interface EmailVars {
  guestName: string;
  restaurantName: string;
  date: string;
  time: string;
  service: string;
  partySize: string;
  occasion: string;
  notes: string;
  reference: string;
  contactPhone: string;
  contactEmail: string;
  siteUrl: string;
}

export interface FeedbackEmailVars {
  guestName: string;
  restaurantName: string;
  date: string;
  reference: string;
  feedbackUrl: string;
  contactEmail: string;
}

export function renderTemplate(tpl: string, vars: EmailVars): string {
  return tpl.replace(
    /\{\{(\w+)\}\}/g,
    (_, k: string) => (vars as unknown as Record<string, string>)[k] ?? "",
  );
}

function formatDate(dateStr: string, locale: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export function buildEmailVars(r: Reservation, tenant: Tenant, serviceLabel?: string): EmailVars {
  const s = tenant.settings;
  return {
    guestName: r.name,
    restaurantName: s.name,
    date: formatDate(r.date, s.locale),
    time: r.time,
    service: serviceLabel ?? r.service,
    partySize: String(r.partySize),
    occasion: r.occasion ?? "",
    notes: r.notes ?? "",
    reference: referenceOf(r.id),
    contactPhone: s.contactPhone,
    contactEmail: s.contactEmail,
    siteUrl: s.url,
  };
}

export interface SendResult {
  sent: boolean;
  skipped?: boolean;
  error?: string;
}

function renderFeedbackTemplate(tpl: string, vars: FeedbackEmailVars): string {
  return tpl.replace(
    /\{\{(\w+)\}\}/g,
    (_, k: string) => (vars as unknown as Record<string, string>)[k] ?? "",
  );
}

function defaultFeedbackSubject(): string {
  return "How was your visit to {{restaurantName}}?";
}
function defaultFeedbackText(): string {
  return `Hi {{guestName}},\n\nThank you for dining with us on {{date}}.\nWe'd love to hear about your experience — it only takes 30 seconds:\n\n{{feedbackUrl}}\n\nWarm regards,\n{{restaurantName}}`;
}
function defaultFeedbackHtml(): string {
  return `<p>Hi {{guestName}},</p><p>Thank you for dining with us on <strong>{{date}}</strong>.</p><p>We'd love to hear about your experience — it only takes 30 seconds:</p><p><a href="{{feedbackUrl}}" style="background:#f2ca50;color:#3c2f00;padding:10px 22px;text-decoration:none;border-radius:6px;font-weight:600;display:inline-block">Leave feedback →</a></p><p>Warm regards,<br/>{{restaurantName}}</p>`;
}

/** Send the post-visit feedback request email. Never throws. */
export async function sendFeedbackRequestEmail(
  reservation: Reservation,
  tenant: Tenant,
  feedbackUrl: string,
): Promise<SendResult> {
  const s = tenant.settings;
  if (!s.emailEnabled) return { sent: false, skipped: true };
  const smtp = s.smtp;
  if (!smtp?.host || !smtp?.port) return { sent: false, skipped: true };
  if (!reservation.email) return { sent: false, skipped: true };
  try {
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: Number(smtp.port),
      secure: Boolean(smtp.secure),
      auth: smtp.user && smtp.pass ? { user: smtp.user, pass: smtp.pass } : undefined,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });
    const vars: FeedbackEmailVars = {
      guestName: reservation.name,
      restaurantName: s.name,
      date: formatDate(reservation.date, s.locale),
      reference: referenceOf(reservation.id),
      feedbackUrl,
      contactEmail: s.contactEmail,
    };
    const tpl = s.emailTemplates?.feedbackRequest;
    const subject = renderFeedbackTemplate(tpl?.subject ?? defaultFeedbackSubject(), vars);
    const text = renderFeedbackTemplate(tpl?.text ?? defaultFeedbackText(), vars);
    const html = renderFeedbackTemplate(tpl?.html ?? defaultFeedbackHtml(), vars);
    const from = smtp.from || s.emailFrom || `${s.name} <${smtp.user ?? s.contactEmail}>`;
    await transport.sendMail({ from, to: reservation.email, replyTo: s.contactEmail, subject, text, html });
    return { sent: true };
  } catch (err) {
    console.error("[reservations] feedback email failed:", err);
    return { sent: false, error: err instanceof Error ? err.message : "send failed" };
  }
}

/**
 * Send the booking-confirmation email using the TENANT'S OWN SMTP transport.
 * If the tenant has email disabled or no SMTP configured, the email is skipped
 * (the booking still succeeds). Never throws.
 */
export async function sendConfirmationEmail(
  reservation: Reservation,
  tenant: Tenant,
  serviceLabel?: string,
): Promise<SendResult> {
  const s = tenant.settings;
  if (!s.emailEnabled) return { sent: false, skipped: true };
  const smtp = s.smtp;
  if (!smtp?.host || !smtp?.port) {
    console.warn(`[reservations] tenant ${tenant.id} has no SMTP — skipping confirmation email.`);
    return { sent: false, skipped: true };
  }
  try {
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: Number(smtp.port),
      secure: Boolean(smtp.secure),
      auth: smtp.user && smtp.pass ? { user: smtp.user, pass: smtp.pass } : undefined,
      // don't let a slow/unreachable SMTP server hang the booking request
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });
    const vars = buildEmailVars(reservation, tenant, serviceLabel);
    const tpl = s.emailTemplates?.confirmation ?? defaultConfirmationTemplate();
    const from = smtp.from || s.emailFrom || `${s.name} <${smtp.user ?? s.contactEmail}>`;
    await transport.sendMail({
      from,
      to: reservation.email,
      replyTo: s.contactEmail,
      subject: renderTemplate(tpl.subject, vars),
      text: renderTemplate(tpl.text, vars),
      html: renderTemplate(tpl.html, vars),
    });
    return { sent: true };
  } catch (err) {
    console.error("[reservations] confirmation email failed:", err);
    return { sent: false, error: err instanceof Error ? err.message : "send failed" };
  }
}
