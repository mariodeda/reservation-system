import nodemailer from "nodemailer";
import type { AvailabilityConfig, Reservation } from "./types";
import { referenceOf } from "./store";
import { defaultConfirmationTemplate, type Tenant, type TenantSmtp } from "./tenant";
import { turnMinutesFor } from "./availability";
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

function icsUtcDateTime(d = new Date()): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function timeZoneOffsetMs(date: Date, timezone: string): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date).map((x) => [x.type, x.value]));
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute), Number(parts.second));
  return asUtc - date.getTime();
}

function localDateTimeToUtc(dateStr: string, time: string, timezone: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const first = new Date(localAsUtc - timeZoneOffsetMs(new Date(localAsUtc), timezone));
  const second = new Date(localAsUtc - timeZoneOffsetMs(first, timezone));
  return second;
}

function icsText(value: unknown): string {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function icsParamText(value: unknown): string {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, " ")
    .replace(/"/g, '\\"');
}

function emailAddress(value: unknown): string {
  const s = String(value ?? "").trim();
  const bracketed = s.match(/<([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>/);
  if (bracketed) return bracketed[1];
  const plain = s.match(/[^\s<>,;]+@[^\s<>,;]+\.[^\s<>,;]+/);
  return plain?.[0] ?? "";
}

function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  for (let i = 0; i < line.length; i += 75) chunks.push(`${i === 0 ? "" : " "}${line.slice(i, i + 75)}`);
  return chunks.join("\r\n");
}

function buildReservationCalendarEvent(
  reservation: Reservation,
  tenant: Tenant,
  serviceLabel?: string,
  config?: AvailabilityConfig,
  method: "REQUEST" | "CANCEL" = "REQUEST",
): string {
  const durationMins = reservation.durationMinsOverride
    ?? (config ? turnMinutesFor(config, reservation.offering, reservation.service, reservation.date) : 120);
  const timezone = tenant.settings.timezone || config?.timezone || "UTC";
  const startUtc = localDateTimeToUtc(reservation.date, reservation.time, timezone);
  const endUtc = new Date(startUtc.getTime() + durationMins * 60_000);
  const vars = buildEmailVars(reservation, tenant, serviceLabel);
  const reference = referenceOf(reservation.id);
  const service = serviceLabel ?? reservation.service;
  const summary = renderTemplate(tenant.settings.calendarEventTitle || "{{restaurantName}} reservation", vars).trim()
    || `${tenant.settings.name} reservation`;
  const organizerEmail = emailAddress(
    tenant.settings.contactEmail
      || tenant.settings.emailFrom
      || tenant.settings.smtp?.from
      || tenant.settings.smtp?.user
      || reservation.email,
  );
  const attendeeEmail = emailAddress(reservation.email);
  const now = icsUtcDateTime();
  const description = [
    `Reservation reference: ${reference}`,
    `Guest: ${reservation.name}`,
    `Party size: ${reservation.partySize}`,
    service ? `Service: ${service}` : "",
    tenant.settings.contactPhone ? `Contact phone: ${tenant.settings.contactPhone}` : "",
    tenant.settings.contactEmail ? `Contact email: ${tenant.settings.contactEmail}` : "",
    tenant.settings.url ? `Website: ${tenant.settings.url}` : "",
  ].filter(Boolean).join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Reservation System//Restaurant Booking//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${icsText(`${reservation.id}@${tenant.slug || tenant.id}`)}`,
    `DTSTAMP:${now}`,
    `CREATED:${now}`,
    `LAST-MODIFIED:${now}`,
    "SEQUENCE:0",
    `DTSTART:${icsUtcDateTime(startUtc)}`,
    `DTEND:${icsUtcDateTime(endUtc)}`,
    `SUMMARY:${icsText(summary)}`,
    `LOCATION:${icsText(tenant.settings.name)}`,
    `DESCRIPTION:${icsText(description)}`,
    ...(organizerEmail ? [`ORGANIZER;CN="${icsParamText(tenant.settings.name)}":mailto:${organizerEmail}`] : []),
    ...(attendeeEmail
      ? [`ATTENDEE;CN="${icsParamText(reservation.name)}";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${attendeeEmail}`]
      : []),
    ...(tenant.settings.url ? [`URL:${icsText(tenant.settings.url)}`] : []),
    `STATUS:${method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    "CLASS:PUBLIC",
    `X-MICROSOFT-CDO-BUSYSTATUS:${method === "CANCEL" ? "FREE" : "BUSY"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
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

function defaultReminderTemplate() {
  return {
    subject: "Reminder: your reservation at {{restaurantName}} — {{date}} at {{time}}",
    text: `Dear {{guestName}},

This is a friendly reminder of your reservation at {{restaurantName}}:

  Date:      {{date}}
  Time:      {{time}} ({{service}})
  Guests:    {{partySize}}
  Reference: {{reference}}

If you need to amend or cancel, reply to this email or call us at {{contactPhone}}.

We look forward to welcoming you.
{{restaurantName}}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2933">
  <h2 style="margin:0 0 8px;color:#a8842a">{{restaurantName}}</h2>
  <p style="margin:0 0 18px;color:#64748b">Reservation reminder</p>
  <p>Dear {{guestName}},</p>
  <p>This is a friendly reminder of your reservation:</p>
  <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:5px 18px 5px 0;color:#64748b">Date</td><td><strong>{{date}}</strong></td></tr>
    <tr><td style="padding:5px 18px 5px 0;color:#64748b">Time</td><td><strong>{{time}} ({{service}})</strong></td></tr>
    <tr><td style="padding:5px 18px 5px 0;color:#64748b">Guests</td><td><strong>{{partySize}}</strong></td></tr>
    <tr><td style="padding:5px 18px 5px 0;color:#64748b">Reference</td><td><strong>{{reference}}</strong></td></tr>
  </table>
  <p style="color:#64748b;font-size:14px">Need to amend or cancel? Reply to this email or call us at {{contactPhone}}.</p>
  <p style="margin-top:22px">We look forward to welcoming you.<br><strong>{{restaurantName}}</strong></p>
</div>`,
  };
}

function defaultCancellationTemplate() {
  return {
    subject: "Your reservation at {{restaurantName}} has been cancelled — {{reference}}",
    text: `Dear {{guestName}},

Your reservation at {{restaurantName}} has been cancelled.

  Date:      {{date}}
  Time:      {{time}} ({{service}})
  Guests:    {{partySize}}
  Reference: {{reference}}

If this was unexpected, please reply to this email or call us at {{contactPhone}}.

{{restaurantName}}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2933">
  <h2 style="margin:0 0 8px;color:#b42318">{{restaurantName}}</h2>
  <p style="margin:0 0 18px;color:#64748b">Reservation cancelled</p>
  <p>Dear {{guestName}},</p>
  <p>Your reservation has been cancelled.</p>
  <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:5px 18px 5px 0;color:#64748b">Date</td><td><strong>{{date}}</strong></td></tr>
    <tr><td style="padding:5px 18px 5px 0;color:#64748b">Time</td><td><strong>{{time}} ({{service}})</strong></td></tr>
    <tr><td style="padding:5px 18px 5px 0;color:#64748b">Guests</td><td><strong>{{partySize}}</strong></td></tr>
    <tr><td style="padding:5px 18px 5px 0;color:#64748b">Reference</td><td><strong>{{reference}}</strong></td></tr>
  </table>
  <p style="color:#64748b;font-size:14px">If this was unexpected, please reply to this email or call us at {{contactPhone}}.</p>
</div>`,
  };
}

async function runTransactionalTemplateSend(
  reservation: Reservation,
  tenant: Tenant,
  type: TenantEmailEvent,
  template: { subject: string; text: string; html: string },
  serviceLabel?: string,
  config?: AvailabilityConfig,
  calendarMethod?: "REQUEST" | "CANCEL",
): Promise<SendResult> {
  const s = tenant.settings;
  if (!isEmailEventEnabled(s, type)) return { sent: false, skipped: true, reason: "event_disabled" };
  const smtp = s.smtp;
  if (!smtp?.host || !smtp?.port) return { sent: false, skipped: true, reason: "no_smtp" };
  if (!reservation.email) return { sent: false, skipped: true, reason: "no_recipient" };
  try {
    const transport = smtpTransport(smtp);
    const vars = buildEmailVars(reservation, tenant, serviceLabel);
    const from = smtp.from || s.emailFrom || `${s.name} <${smtp.user ?? s.contactEmail}>`;
    const message: Parameters<ReturnType<typeof smtpTransport>["sendMail"]>[0] = {
      from,
      to: reservation.email,
      replyTo: s.contactEmail,
      subject: renderTemplate(template.subject, vars),
      text: renderTemplate(template.text, vars),
      html: renderTemplate(template.html, vars),
      headers: trackingHeaders(tenant, reservation, type),
    };
    if (calendarMethod) {
      message.headers = {
        ...message.headers,
        "Content-Class": "urn:content-classes:calendarmessage",
      };
      message.icalEvent = {
        method: calendarMethod,
        filename: calendarMethod === "REQUEST" ? "invitation.ics" : "cancellation.ics",
        content: buildReservationCalendarEvent(reservation, tenant, serviceLabel, config, calendarMethod),
      };
    }
    const info = await transport.sendMail(message);
    return resultFromSendInfo(info, reservation.email);
  } catch (err) {
    console.error(`[reservations] ${type} email failed:`, err);
    return { sent: false, error: err instanceof Error ? err.message : "send failed" };
  }
}

/** Send the post-visit feedback request email. Logs the attempt. Never throws. */
export async function sendFeedbackRequestEmail(
  reservation: Reservation,
  tenant: Tenant,
): Promise<SendResult> {
  const result = await runFeedbackSend(reservation, tenant);
  await logEmailAttempt("feedbackRequest", reservation, tenant, result);
  return result;
}

export async function sendReservationReminderEmail(
  reservation: Reservation,
  tenant: Tenant,
  serviceLabel?: string,
  config?: AvailabilityConfig,
): Promise<SendResult> {
  const result = await runTransactionalTemplateSend(
    reservation,
    tenant,
    "reservationReminder",
    tenant.settings.emailTemplates?.reminder ?? defaultReminderTemplate(),
    serviceLabel,
    config,
    "REQUEST",
  );
  await logEmailAttempt("reservationReminder", reservation, tenant, result);
  return result;
}

export async function sendCancellationEmail(
  reservation: Reservation,
  tenant: Tenant,
  serviceLabel?: string,
  config?: AvailabilityConfig,
): Promise<SendResult> {
  const result = await runTransactionalTemplateSend(
    reservation,
    tenant,
    "cancellationConfirmation",
    tenant.settings.emailTemplates?.cancellation ?? defaultCancellationTemplate(),
    serviceLabel,
    config,
    "CANCEL",
  );
  await logEmailAttempt("cancellationConfirmation", reservation, tenant, result);
  return result;
}

async function runFeedbackSend(
  reservation: Reservation,
  tenant: Tenant,
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
  config?: AvailabilityConfig,
): Promise<SendResult> {
  const result = await runConfirmationSend(reservation, tenant, serviceLabel, config);
  await logEmailAttempt("bookingConfirmation", reservation, tenant, result);
  return result;
}

async function runConfirmationSend(
  reservation: Reservation,
  tenant: Tenant,
  serviceLabel?: string,
  config?: AvailabilityConfig,
): Promise<SendResult> {
  return runTransactionalTemplateSend(
    reservation,
    tenant,
    "bookingConfirmation",
    tenant.settings.emailTemplates?.confirmation ?? defaultConfirmationTemplate(),
    serviceLabel,
    config,
    "REQUEST",
  );
}
