/**
 * PER-SITE CONFIG — the single file to customize when dropping this
 * reservation system into a new project. Everything project-specific lives
 * here: branding, default operating hours, party limits, and email templates.
 *
 * Operational availability (hours, closures, blocked slots) is *seeded* from
 * `defaultAvailability` on first run and is then editable by staff in /admin
 * (persisted in the data store). Email templates use {{variable}} placeholders;
 * the variable contract is stable across sites (see EmailVars in lib/email).
 */
import type { AvailabilityConfig, ServiceWindow } from "@/lib/reservations/types";

export const brand = {
  /** Restaurant / venue display name (used in admin + emails). */
  name: "Osteria Cancello dei Macci",
  /** Public site URL (used in emails). */
  url: "https://osteria-cancello-dei-macci.example",
  /** Reply-to / contact shown to guests. */
  contactEmail: "reservations@osteria-cancello-dei-macci.example",
  contactPhone: "+39 055 248 0626",
  locale: "en-US",
};

const lunch: ServiceWindow = {
  id: "lunch",
  label: "Lunch",
  start: "12:00",
  end: "16:00",
  interval: 30,
  capacity: 20,
};
const dinner: ServiceWindow = {
  id: "dinner",
  label: "Dinner",
  start: "18:00",
  end: "22:00",
  interval: 30,
  capacity: 30,
};

/** Seed availability — staff can change all of this from the admin panel. */
export const defaultAvailability: AvailabilityConfig = {
  timezone: "Europe/Rome",
  bookingWindowDays: 60,
  minPartySize: 1,
  maxPartySize: 12,
  leadMinutes: 120,
  weekly: {
    0: { closed: true, services: [] }, // Sunday
    1: { closed: false, services: [lunch, dinner] },
    2: { closed: false, services: [lunch, dinner] },
    3: { closed: false, services: [lunch, dinner] },
    4: { closed: false, services: [lunch, dinner] },
    5: { closed: false, services: [lunch, dinner] },
    6: { closed: false, services: [dinner] }, // Saturday dinner only
  },
  closures: [],
  dateOverrides: {},
  blockedSlots: {},
};

/**
 * Auto-confirm web bookings. When true, a public booking is created as
 * "confirmed" and the confirmation email is sent immediately. Set false if
 * staff must manually approve each request (bookings are created "pending").
 */
export const autoConfirm = true;

/** Whether to attempt sending confirmation emails (also needs SMTP env vars). */
export const emailEnabled = true;

/**
 * Email templates. Placeholders: {{guestName}} {{restaurantName}} {{date}}
 * {{time}} {{service}} {{partySize}} {{occasion}} {{notes}} {{reference}}
 * {{contactPhone}} {{contactEmail}} {{siteUrl}} {{themePrimary}}
 * {{themeOnPrimary}}. Placeholders may include an inline fallback, e.g.
 * {{themePrimary:#a8842a}}.
 */
export const emailTemplates = {
  confirmation: {
    subject: "Your reservation at {{restaurantName}} — {{date}} at {{time}}",
    text: `Dear {{guestName}},

Thank you for booking with {{restaurantName}}. Your table is confirmed:

  Date:     {{date}}
  Time:     {{time}} ({{service}})
  Guests:   {{partySize}}
  Reference: {{reference}}

If you need to amend or cancel, reply to this email or call us at {{contactPhone}}.

We look forward to welcoming you.
{{restaurantName}}
{{siteUrl}}`,
    html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Your reservation at {{restaurantName}}</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff">
<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:24px 16px;color:#1a1a1a">
  <h2 style="color:{{themePrimary:#a8842a}};margin:0 0 4px">{{restaurantName}}</h2>
  <p style="margin:0 0 16px;color:#666">Reservation confirmed</p>
  <p>Dear {{guestName}},</p>
  <p>Thank you for booking with us. Your table is confirmed:</p>
  <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:4px 16px 4px 0;color:#888">Date</td><td style="padding:4px 0"><strong>{{date}}</strong></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#888">Time</td><td style="padding:4px 0"><strong>{{time}} ({{service}})</strong></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#888">Guests</td><td style="padding:4px 0"><strong>{{partySize}}</strong></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#888">Reference</td><td style="padding:4px 0"><strong>{{reference}}</strong></td></tr>
  </table>
  <p style="color:#666;font-size:14px">Need to amend or cancel? Reply to this email or call us at {{contactPhone}}.</p>
  <p style="margin-top:24px">We look forward to welcoming you.<br /><strong>{{restaurantName}}</strong></p>
</div>
</body>
</html>`,
  },
};
