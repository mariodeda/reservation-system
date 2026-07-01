import nodemailer from "nodemailer";
import type { Reservation } from "./types";
import { referenceOf } from "./store";
import { defaultConfirmationTemplate, type Tenant, type TenantSmtp } from "./tenant";
import { hasGuestAttended, isEmailEventEnabled, type TenantEmailEvent } from "./email-policy";
import { recordEmailAttempt, type EmailLogStatus } from "./email-log-store";

export function smtpTransport(smtp: TenantSmtp) {
  const port = Number(smtp.port);
  // 465 = implicit TLS (connect already encrypted).
  // 587 / 25 = STARTTLS (plain connect, then upgrade).
  // Wrong version number error happens when secure:true is used on a STARTTLS port.
  const secure = port === 465 ? true : port === 587 || port === 25 ? false : Boolean(smtp.secure);
  return nodemailer.createTransport({
    host: smtp.host,
    port,
    secure,
    requireTLS: !secure && port !== 25, // enforce STARTTLS on submission ports
    auth: smtp.user && smtp.pass ? { user: smtp.user, pass: smtp.pass } : undefined,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });
}

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
  reviewUrl: string;
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

/** Why a send was skipped — distinguishes deliberate config from misconfig. */
export type EmailSkipReason = "not_attended" | "event_disabled" | "no_smtp" | "no_recipient" | "no_review_url";
export type EmailFailureReason = "recipient_rejected" | "bounced";

export interface SendResult {
  sent: boolean;
  skipped?: boolean;
  reason?: EmailSkipReason | EmailFailureReason;
  error?: string;
}

function rejectedRecipients(info: unknown): string[] {
  const rejected = (info as { rejected?: unknown })?.rejected;
  return Array.isArray(rejected) ? rejected.map(String).filter(Boolean) : [];
}

function resultFromSendInfo(info: unknown, recipient: string): SendResult {
  const rejected = rejectedRecipients(info);
  if (rejected.some((email) => email.toLowerCase() === recipient.toLowerCase()) || rejected.length > 0) {
    return {
      sent: false,
      reason: "recipient_rejected",
      error: `SMTP rejected recipient${rejected.length ? `: ${rejected.join(", ")}` : ""}`,
    };
  }
  return { sent: true };
}

function trackingHeaders(tenant: Tenant, reservation: Reservation, type: TenantEmailEvent) {
  return {
    "X-RSV-Tenant-ID": tenant.id,
    "X-RSV-Reservation-ID": reservation.id,
    "X-RSV-Email-Type": type,
    "X-RSV-Reference": referenceOf(reservation.id),
  };
}

function statusOf(r: SendResult): EmailLogStatus {
  if (r.sent) return "sent";
  if (r.skipped) return "skipped";
  return "failed";
}

/**
 * Persist a send attempt to the email log. Keeps the log high-signal: always
 * records sends and failures, but among skips records only a likely misconfig
 * (event enabled yet no SMTP). Deliberate `event_disabled` skips and walk-in
 * `no_recipient` skips are expected, not bugs, so they're not logged. Never throws.
 */
async function logEmailAttempt(
  type: TenantEmailEvent,
  reservation: Reservation,
  tenant: Tenant,
  result: SendResult,
): Promise<void> {
  const isFailure = !result.sent && !result.skipped;
  const loggableSkip = result.skipped === true && result.reason === "no_smtp";
  if (!(result.sent || isFailure || loggableSkip)) return;
  await recordEmailAttempt({
    tenantId: tenant.id,
    reservationId: reservation.id,
    type,
    status: statusOf(result),
    reason: result.reason,
    error: result.error,
    toEmail: reservation.email || undefined,
  });
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
  return `Hi {{guestName}},\n\nThank you for dining with us on {{date}}.\nWe'd love to hear about your experience:\n\n{{reviewUrl}}\n\nWarm regards,\n{{restaurantName}}`;
}
function defaultFeedbackHtml(): string {
  return `<p>Hi {{guestName}},</p><p>Thank you for dining with us on <strong>{{date}}</strong>.</p><p>We'd love to hear about your experience:</p><p><a href="{{reviewUrl}}" style="background:#f2ca50;color:#3c2f00;padding:10px 22px;text-decoration:none;border-radius:6px;font-weight:600;display:inline-block">Leave a review →</a></p><p>Warm regards,<br/>{{restaurantName}}</p>`;
}

/** Send the post-visit feedback request email. Logs the attempt. Never throws. */
export async function sendFeedbackRequestEmail(
  reservation: Reservation,
  tenant: Tenant,
  feedbackUrl: string,
): Promise<SendResult> {
  const result = await runFeedbackSend(reservation, tenant, feedbackUrl);
  await logEmailAttempt("feedbackRequest", reservation, tenant, result);
  return result;
}

async function runFeedbackSend(
  reservation: Reservation,
  tenant: Tenant,
  feedbackUrl: string,
): Promise<SendResult> {
  const s = tenant.settings;
  // Authoritative guard: a rating request may ONLY go to guests who showed up.
  // This is the chokepoint every send path funnels through, so no caller can
  // ever email a no-show/cancelled guest regardless of upstream checks.
  if (!hasGuestAttended(reservation)) return { sent: false, skipped: true, reason: "not_attended" };
  if (!isEmailEventEnabled(s, "feedbackRequest")) return { sent: false, skipped: true, reason: "event_disabled" };
  const smtp = s.smtp;
  if (!smtp?.host || !smtp?.port) return { sent: false, skipped: true, reason: "no_smtp" };
  if (!reservation.email) return { sent: false, skipped: true, reason: "no_recipient" };
  if (!s.reviewUrl) return { sent: false, skipped: true, reason: "no_review_url" };
  try {
    const transport = smtpTransport(smtp);
    const vars: FeedbackEmailVars = {
      guestName: reservation.name,
      restaurantName: s.name,
      date: formatDate(reservation.date, s.locale),
      reference: referenceOf(reservation.id),
      feedbackUrl,
      reviewUrl: s.reviewUrl ?? "",
      contactEmail: s.contactEmail,
    };
    const tpl = s.emailTemplates?.feedbackRequest;
    const subject = renderFeedbackTemplate(tpl?.subject ?? defaultFeedbackSubject(), vars);
    const text = renderFeedbackTemplate(tpl?.text ?? defaultFeedbackText(), vars);
    const html = renderFeedbackTemplate(tpl?.html ?? defaultFeedbackHtml(), vars);
    const from = smtp.from || s.emailFrom || `${s.name} <${smtp.user ?? s.contactEmail}>`;
    const info = await transport.sendMail({
      from,
      to: reservation.email,
      replyTo: s.contactEmail,
      subject,
      text,
      html,
      headers: trackingHeaders(tenant, reservation, "feedbackRequest"),
    });
    return resultFromSendInfo(info, reservation.email);
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
  const result = await runConfirmationSend(reservation, tenant, serviceLabel);
  await logEmailAttempt("bookingConfirmation", reservation, tenant, result);
  return result;
}

async function runConfirmationSend(
  reservation: Reservation,
  tenant: Tenant,
  serviceLabel?: string,
): Promise<SendResult> {
  const s = tenant.settings;
  if (!isEmailEventEnabled(s, "bookingConfirmation")) return { sent: false, skipped: true, reason: "event_disabled" };
  const smtp = s.smtp;
  if (!smtp?.host || !smtp?.port) {
    console.warn(`[reservations] tenant ${tenant.id} has no SMTP — skipping confirmation email.`);
    return { sent: false, skipped: true, reason: "no_smtp" };
  }
  try {
    const transport = smtpTransport(smtp);
    const vars = buildEmailVars(reservation, tenant, serviceLabel);
    const tpl = s.emailTemplates?.confirmation ?? defaultConfirmationTemplate();
    const from = smtp.from || s.emailFrom || `${s.name} <${smtp.user ?? s.contactEmail}>`;
    const info = await transport.sendMail({
      from,
      to: reservation.email,
      replyTo: s.contactEmail,
      subject: renderTemplate(tpl.subject, vars),
      text: renderTemplate(tpl.text, vars),
      html: renderTemplate(tpl.html, vars),
      headers: trackingHeaders(tenant, reservation, "bookingConfirmation"),
    });
    return resultFromSendInfo(info, reservation.email);
  } catch (err) {
    console.error("[reservations] confirmation email failed:", err);
    return { sent: false, error: err instanceof Error ? err.message : "send failed" };
  }
}
