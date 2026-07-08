export interface EmailPreset {
  id: string;
  name: string;
  description: string;
  subject: string;
  text: string;
  html: string;
}

// Sample data used for live preview rendering
export const PREVIEW_VARS: Record<string, string> = {
  guestName: "Marco Bianchi",
  restaurantName: "Osteria del Gambero",
  date: "Saturday, 21 June 2025",
  time: "20:00",
  service: "Dinner",
  partySize: "2",
  occasion: "Anniversary",
  notes: "Window table if possible",
  reference: "RES-7F3K9P",
  contactPhone: "+39 02 8736 4521",
  contactEmail: "info@osteriadelgambero.it",
  siteUrl: "https://osteriadelgambero.it",
  reviewUrl: "https://g.page/r/example/review",
};

export function renderPreview(template: string, overrides: Record<string, string> = {}): string {
  return template.replace(/\{\{(\w+)(?::([^}]*))?\}\}/g, (_, k, fallback) => {
    const value = overrides[k] || PREVIEW_VARS[k];
    return value || fallback || `{{${k}}}`;
  });
}

// ─── Confirmation presets ────────────────────────────────────────────────────

export const CONFIRMATION_PRESETS: EmailPreset[] = [
  {
    id: "classic-warm",
    name: "Classic Warm",
    description: "Dark header, ivory details card, serif typography. Best for traditional restaurants.",
    subject: "Your reservation at {{restaurantName}} is confirmed",
    text: `{{restaurantName}} — Reservation Confirmed

Dear {{guestName}},

We're delighted to confirm your table.

─────────────────────────────
  Date       {{date}}
  Time       {{time}} · {{service}}
  Guests     {{partySize}}
  Reference  {{reference}}
─────────────────────────────

Should you need to modify or cancel your reservation, please contact us at least 24 hours in advance.

{{contactPhone}}
{{contactEmail}}
{{siteUrl}}

We look forward to welcoming you.

{{restaurantName}}`,
    html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Reservation Confirmed</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f3ee;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f3ee;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
      <!-- Header -->
      <tr><td style="background:{{themePrimary:#1c1b18}};padding:28px 40px;" align="center">
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:4px;color:{{themeOnPrimary:#8a7a5a}};text-transform:uppercase;">YOUR TABLE AT</p>
        <p style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:400;color:{{themeOnPrimary:#e8d9b4}};letter-spacing:0.5px;">{{restaurantName}}</p>
      </td></tr>
      <!-- Confirmation badge -->
      <tr><td style="padding:28px 40px 0;" align="center">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="background:#e8f5e9;border:1px solid #81c784;border-radius:20px;padding:5px 16px;">
            <span style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;color:#2e7d32;letter-spacing:1px;text-transform:uppercase;">&#10003; Confirmed</span>
          </td>
        </tr></table>
        <p style="margin:14px 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:21px;color:#1c1b18;">Dear {{guestName}},</p>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#666666;line-height:1.6;">Your reservation is confirmed. We look forward to welcoming you.</p>
      </td></tr>
      <!-- Details card -->
      <tr><td style="padding:20px 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9f6;border:1px solid #e6e0d4;border-radius:6px;">
          <tr><td style="padding:20px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #ede8df;" width="38%"><span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#999999;">Date</span></td>
                <td style="padding:8px 0;border-bottom:1px solid #ede8df;"><span style="font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#1c1b18;">{{date}}</span></td>
              </tr>
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #ede8df;" width="38%"><span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#999999;">Time</span></td>
                <td style="padding:8px 0;border-bottom:1px solid #ede8df;"><span style="font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#1c1b18;">{{time}}&nbsp;&middot;&nbsp;{{service}}</span></td>
              </tr>
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #ede8df;" width="38%"><span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#999999;">Guests</span></td>
                <td style="padding:8px 0;border-bottom:1px solid #ede8df;"><span style="font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#1c1b18;">{{partySize}}</span></td>
              </tr>
              <tr>
                <td style="padding:8px 0;" width="38%"><span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#999999;">Reference</span></td>
                <td style="padding:8px 0;"><span style="font-family:'Courier New',Courier,monospace;font-size:13px;color:#a07800;letter-spacing:1px;">{{reference}}</span></td>
              </tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:0 40px 28px;">
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#555555;line-height:1.7;">Should you need to modify or cancel your reservation, please reach out to us at least 24 hours beforehand and we will do our best to accommodate.</p>
      </td></tr>
      <!-- Footer -->
      <tr><td style="background:{{themePrimary:#1c1b18}};padding:20px 40px;" align="center">
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:2px;color:{{themeOnPrimary:#8a7a5a}};text-transform:uppercase;">{{restaurantName}}</p>
        <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:{{themeOnPrimary:#5a5450}};">
          <a href="tel:{{contactPhone}}" style="color:{{themeOnPrimary:#5a5450}};text-decoration:none;">{{contactPhone}}</a>
          &nbsp;&middot;&nbsp;
          <a href="mailto:{{contactEmail}}" style="color:{{themeOnPrimary:#5a5450}};text-decoration:none;">{{contactEmail}}</a>
        </p>
        <p style="margin:4px 0 0;"><a href="{{siteUrl}}" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:{{themeOnPrimary:#5a5450}};text-decoration:none;">{{siteUrl}}</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`,
  },

  {
    id: "modern-minimal",
    name: "Modern Minimal",
    description: "Clean white layout, green accent, sans-serif throughout. Suits contemporary venues.",
    subject: "You're booked — {{restaurantName}}, {{date}}",
    text: `{{restaurantName}}

You're all set, {{guestName}}!

  Date:         {{date}}
  Time:         {{time}} ({{service}})
  Party size:   {{partySize}} guests
  Booking ref:  {{reference}}

Need to change something? Reach us at {{contactEmail}} or {{contactPhone}} at least 24 hours before your reservation.

{{siteUrl}}`,
    html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Reservation Confirmed</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:6px;border-top:4px solid {{themePrimary:#2d9b6e}};">
      <!-- Logo / name -->
      <tr><td style="padding:28px 36px 0;">
        <p style="margin:0;font-size:18px;font-weight:700;color:#111111;letter-spacing:-0.3px;">{{restaurantName}}</p>
      </td></tr>
      <!-- Hero -->
      <tr><td style="padding:20px 36px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="width:44px;vertical-align:top;padding-top:2px;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="width:36px;height:36px;background:#e8f5ee;border-radius:50%;text-align:center;vertical-align:middle;">
                <span style="font-size:18px;color:{{themePrimary:#2d9b6e}};line-height:36px;">&#10003;</span>
              </td>
            </tr></table>
          </td>
          <td style="vertical-align:top;">
            <p style="margin:0;font-size:20px;font-weight:700;color:#111111;">You're all set, {{guestName}}!</p>
            <p style="margin:5px 0 0;font-size:14px;color:#666666;line-height:1.6;">Your reservation has been confirmed. See you soon.</p>
          </td>
        </tr></table>
      </td></tr>
      <!-- Details table -->
      <tr><td style="padding:20px 36px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e5e5;border-radius:6px;overflow:hidden;">
          <tr style="background:#f9f9f9;">
            <td style="padding:12px 20px;border-bottom:1px solid #e5e5e5;" width="36%"><span style="font-size:11px;font-weight:700;color:#999999;letter-spacing:1px;text-transform:uppercase;">Date</span></td>
            <td style="padding:12px 20px;border-bottom:1px solid #e5e5e5;"><span style="font-size:14px;font-weight:600;color:#111111;">{{date}}</span></td>
          </tr>
          <tr>
            <td style="padding:12px 20px;border-bottom:1px solid #e5e5e5;" width="36%"><span style="font-size:11px;font-weight:700;color:#999999;letter-spacing:1px;text-transform:uppercase;">Time</span></td>
            <td style="padding:12px 20px;border-bottom:1px solid #e5e5e5;"><span style="font-size:14px;font-weight:600;color:#111111;">{{time}}</span><span style="font-size:13px;color:#666666;">&nbsp;&mdash;&nbsp;{{service}}</span></td>
          </tr>
          <tr style="background:#f9f9f9;">
            <td style="padding:12px 20px;border-bottom:1px solid #e5e5e5;" width="36%"><span style="font-size:11px;font-weight:700;color:#999999;letter-spacing:1px;text-transform:uppercase;">Guests</span></td>
            <td style="padding:12px 20px;border-bottom:1px solid #e5e5e5;"><span style="font-size:14px;font-weight:600;color:#111111;">{{partySize}}</span></td>
          </tr>
          <tr>
            <td style="padding:12px 20px;" width="36%"><span style="font-size:11px;font-weight:700;color:#999999;letter-spacing:1px;text-transform:uppercase;">Booking ref</span></td>
            <td style="padding:12px 20px;"><span style="font-family:'Courier New',Courier,monospace;font-size:13px;font-weight:700;color:{{themePrimary:#2d9b6e}};letter-spacing:0.5px;">{{reference}}</span></td>
          </tr>
        </table>
      </td></tr>
      <!-- Note -->
      <tr><td style="padding:0 36px 28px;">
        <p style="margin:0;font-size:13px;color:#888888;line-height:1.65;">Need to change something? Contact us at <a href="mailto:{{contactEmail}}" style="color:{{themePrimary:#2d9b6e}};text-decoration:none;">{{contactEmail}}</a> or <a href="tel:{{contactPhone}}" style="color:{{themePrimary:#2d9b6e}};text-decoration:none;">{{contactPhone}}</a> at least 24 hours before your reservation.</p>
      </td></tr>
      <!-- Footer -->
      <tr><td style="padding:16px 36px;border-top:1px solid #eeeeee;" align="center">
        <p style="margin:0;font-size:11px;color:#cccccc;">{{restaurantName}}&nbsp;&middot;&nbsp;<a href="{{siteUrl}}" style="color:#cccccc;text-decoration:none;">{{siteUrl}}</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`,
  },

  {
    id: "luxury-formal",
    name: "Luxury Formal",
    description: "Dark full-bleed email with champagne gold accents. Ideal for fine dining.",
    subject: "Your reservation has been secured — {{restaurantName}}",
    text: `{{restaurantName}}

TABLE CONFIRMED

Dear {{guestName}},

We are pleased to confirm your reservation and look forward to receiving you.

  Date:       {{date}}
  Time:       {{time}} · {{service}}
  Guests:     {{partySize}}
  Reference:  {{reference}}

Should any changes be required, we invite you to contact us at least 24 hours in advance.

With warm regards,
{{restaurantName}}

{{contactPhone}} · {{contactEmail}}
{{siteUrl}}`,
    html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Table Confirmed</title>
</head>
<body style="margin:0;padding:0;background-color:#0e0d0b;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0e0d0b;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#141210;border:1px solid #2a2620;">
      <!-- Gold top line -->
      <tr><td style="background:{{themePrimary:#c9a44a}};height:2px;font-size:2px;line-height:2px;">&nbsp;</td></tr>
      <!-- Name -->
      <tr><td style="padding:36px 40px 24px;" align="center">
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;letter-spacing:5px;color:#6a5e42;text-transform:uppercase;">DINING RESERVATION</p>
        <p style="margin:12px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:25px;font-weight:400;color:#e8d5a3;letter-spacing:0.5px;">{{restaurantName}}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px auto 0;"><tr>
          <td style="background:{{themePrimary:#c9a44a}};height:1px;width:36px;font-size:1px;line-height:1px;">&nbsp;</td>
          <td style="width:10px;"></td>
          <td style="background:{{themePrimary:#c9a44a}};height:1px;width:36px;font-size:1px;line-height:1px;">&nbsp;</td>
        </tr></table>
      </td></tr>
      <!-- Status + greeting -->
      <tr><td style="padding:0 40px 22px;" align="center">
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;letter-spacing:3px;color:{{themePrimary:#c9a44a}};text-transform:uppercase;">Table Confirmed</p>
        <p style="margin:14px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:16px;color:#c4b89a;line-height:1.6;">Dear {{guestName}}, we are pleased to confirm your reservation and look forward to receiving you.</p>
      </td></tr>
      <!-- Details card -->
      <tr><td style="padding:0 40px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1b1915;border:1px solid #2a2620;">
          <tr><td style="padding:20px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:9px 0;border-bottom:1px solid #2a2620;" width="36%"><span style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#5a5040;">Date</span></td>
                <td style="padding:9px 0;border-bottom:1px solid #2a2620;"><span style="font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#e8d5a3;">{{date}}</span></td>
              </tr>
              <tr>
                <td style="padding:9px 0;border-bottom:1px solid #2a2620;" width="36%"><span style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#5a5040;">Time</span></td>
                <td style="padding:9px 0;border-bottom:1px solid #2a2620;"><span style="font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#e8d5a3;">{{time}}</span><span style="font-size:13px;color:#5a5040;">&nbsp;&middot;&nbsp;{{service}}</span></td>
              </tr>
              <tr>
                <td style="padding:9px 0;border-bottom:1px solid #2a2620;" width="36%"><span style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#5a5040;">Guests</span></td>
                <td style="padding:9px 0;border-bottom:1px solid #2a2620;"><span style="font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#e8d5a3;">{{partySize}}</span></td>
              </tr>
              <tr>
                <td style="padding:9px 0;" width="36%"><span style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#5a5040;">Reference</span></td>
                <td style="padding:9px 0;"><span style="font-family:'Courier New',Courier,monospace;font-size:13px;color:{{themePrimary:#c9a44a}};letter-spacing:1px;">{{reference}}</span></td>
              </tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
      <!-- Closing note -->
      <tr><td style="padding:0 40px 32px;" align="center">
        <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:13px;color:#6a5e42;line-height:1.75;font-style:italic;">Should any changes be required, we invite you to contact us at least 24 hours in advance — we will do everything possible to accommodate your wishes.</p>
      </td></tr>
      <!-- Footer -->
      <tr><td style="border-top:1px solid #2a2620;padding:20px 40px;" align="center">
        <p style="margin:0;font-size:10px;letter-spacing:3px;color:#4a4030;text-transform:uppercase;">{{restaurantName}}</p>
        <p style="margin:8px 0 0;font-size:11px;color:#4a4030;">
          <a href="tel:{{contactPhone}}" style="color:#4a4030;text-decoration:none;">{{contactPhone}}</a>
          &nbsp;&middot;&nbsp;
          <a href="mailto:{{contactEmail}}" style="color:#4a4030;text-decoration:none;">{{contactEmail}}</a>
        </p>
      </td></tr>
      <!-- Gold bottom line -->
      <tr><td style="background:{{themePrimary:#c9a44a}};height:1px;font-size:1px;line-height:1px;">&nbsp;</td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`,
  },
];

// ─── Feedback request presets ────────────────────────────────────────────────

export const FEEDBACK_PRESETS: EmailPreset[] = [
  {
    id: "simple-ask",
    name: "Simple Ask",
    description: "Clean white layout, star motif, bold CTA. Gets out of the way and converts.",
    subject: "How was your visit, {{guestName}}?",
    text: `{{restaurantName}} — How was your visit?

Dear {{guestName}},

Thank you for dining with us on {{date}}. We'd love to hear your thoughts.

Share your experience here:
{{reviewUrl}}

It takes less than a minute. Your feedback means a great deal to our team.

{{restaurantName}}
{{siteUrl}}`,
    html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>How was your visit?</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
      <tr><td style="padding:36px 40px 28px;" align="center">
        <!-- Stars -->
        <p style="margin:0;font-size:30px;letter-spacing:5px;color:{{themePrimary:#f2ca50}};">&#9733;&#9733;&#9733;&#9733;&#9733;</p>
        <p style="margin:16px 0 0;font-size:22px;font-weight:700;color:#111111;line-height:1.3;">How was your experience?</p>
        <p style="margin:10px 0 0;font-size:15px;color:#555555;line-height:1.65;">
          Dear {{guestName}}, thank you for dining at <strong style="color:#111111;">{{restaurantName}}</strong> on {{date}}.
        </p>
        <p style="margin:8px 0 0;font-size:14px;color:#888888;line-height:1.6;">Your feedback helps us improve and means a great deal to our entire team.</p>
        <!-- CTA button -->
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 0;"><tr>
          <td style="background:{{themePrimary:#f2ca50}};border-radius:6px;">
            <a href="{{reviewUrl}}" style="display:inline-block;padding:14px 36px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:{{themeOnPrimary:#3c2f00}};text-decoration:none;letter-spacing:0.2px;">Share my experience &rarr;</a>
          </td>
        </tr></table>
        <p style="margin:14px 0 0;font-size:12px;color:#bbbbbb;">Takes less than a minute &middot; Booking {{reference}}</p>
      </td></tr>
      <tr><td style="padding:16px 40px;border-top:1px solid #f0f0f0;" align="center">
        <p style="margin:0;font-size:11px;color:#cccccc;">{{restaurantName}}&nbsp;&middot;&nbsp;<a href="{{siteUrl}}" style="color:#cccccc;text-decoration:none;">{{siteUrl}}</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`,
  },

  {
    id: "warm-gratitude",
    name: "Warm Gratitude",
    description: "Personal letter tone, dark header, warm copy. Builds loyalty and genuine connection.",
    subject: "Thank you for dining at {{restaurantName}}",
    text: `Dear {{guestName}},

It was a genuine pleasure having you at {{restaurantName}} on {{date}}.

We hope the evening was everything you'd wished for, and that you left with a full heart — and a full stomach.

If you have a moment, we'd be grateful to hear how your experience was. Your words — kind or honest — help us serve every guest better.

Leave a review:
{{reviewUrl}}

Thank you again for your visit. We hope to see you soon.

Warmly,
The team at {{restaurantName}}

{{contactEmail}} · {{siteUrl}}`,
    html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Thank you for your visit</title>
</head>
<body style="margin:0;padding:0;background-color:#fdf9f3;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fdf9f3;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:8px;border:1px solid #ede8de;overflow:hidden;">
      <!-- Header -->
      <tr><td style="background:{{themePrimary:#2c2417}};padding:24px 40px;" align="center">
        <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:400;color:{{themeOnPrimary:#e8d5a3}};letter-spacing:0.5px;">{{restaurantName}}</p>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:32px 40px 24px;">
        <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:18px;color:#2c2417;line-height:1.4;">Dear {{guestName}},</p>
        <p style="margin:16px 0 0;font-size:14px;color:#555555;line-height:1.8;">It was a genuine pleasure having you at our table on <strong style="color:#333333;">{{date}}</strong>. Moments shared at the table are what we live for, and we hope your experience with us was one you'll remember warmly.</p>
        <p style="margin:14px 0 0;font-size:14px;color:#555555;line-height:1.8;">We'd love to hear how your evening went. Your thoughts &mdash; whether a kind word or an honest suggestion &mdash; help us serve every guest better.</p>
        <!-- CTA -->
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 0;"><tr>
          <td style="background:{{themePrimary:#c9a44a}};border-radius:5px;">
            <a href="{{reviewUrl}}" style="display:inline-block;padding:13px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:{{themeOnPrimary:#ffffff}};text-decoration:none;">Leave a review &rarr;</a>
          </td>
        </tr></table>
        <p style="margin:22px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:14px;color:#888888;font-style:italic;line-height:1.7;">Thank you again for your visit. We hope to see you soon.</p>
        <p style="margin:12px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:14px;color:#555555;line-height:1.7;">Warmly,<br/>The team at {{restaurantName}}</p>
      </td></tr>
      <!-- Footer -->
      <tr><td style="padding:16px 40px;border-top:1px solid #ede8de;" align="center">
        <p style="margin:0;font-size:11px;color:#cccccc;"><a href="mailto:{{contactEmail}}" style="color:#cccccc;text-decoration:none;">{{contactEmail}}</a>&nbsp;&middot;&nbsp;<a href="{{siteUrl}}" style="color:#cccccc;text-decoration:none;">{{siteUrl}}</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`,
  },
];

// ─── Reservation reminder presets ───────────────────────────────────────────

export const REMINDER_PRESETS: EmailPreset[] = [
  {
    id: "friendly-reminder",
    name: "Friendly Reminder",
    description: "Warm upcoming-visit reminder with the reservation details clearly repeated.",
    subject: "Reminder: your reservation at {{restaurantName}}",
    text: `{{restaurantName}} — Reservation Reminder

Dear {{guestName}},

We're looking forward to welcoming you soon. This is a reminder of your upcoming reservation.

  Date:       {{date}}
  Time:       {{time}} · {{service}}
  Guests:     {{partySize}}
  Reference:  {{reference}}

If your plans change, please contact us as soon as possible.

{{contactPhone}}
{{contactEmail}}
{{siteUrl}}`,
    html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Reservation Reminder</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f3ee;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f3ee;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
      <tr><td style="background:{{themePrimary:#1c1b18}};padding:28px 40px;" align="center">
        <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:4px;color:{{themeOnPrimary:#8a7a5a}};text-transform:uppercase;">SEE YOU SOON AT</p>
        <p style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:400;color:{{themeOnPrimary:#e8d9b4}};letter-spacing:0.5px;">{{restaurantName}}</p>
      </td></tr>
      <tr><td style="padding:30px 40px 0;" align="center">
        <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:21px;color:#1c1b18;">Dear {{guestName}},</p>
        <p style="margin:10px 0 0;font-size:14px;color:#666666;line-height:1.6;">This is a reminder of your upcoming reservation. We look forward to welcoming you.</p>
      </td></tr>
      <tr><td style="padding:22px 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9f6;border:1px solid #e6e0d4;border-radius:6px;">
          <tr><td style="padding:20px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:8px 0;border-bottom:1px solid #ede8df;" width="38%"><span style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#999999;">Date</span></td><td style="padding:8px 0;border-bottom:1px solid #ede8df;"><span style="font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#1c1b18;">{{date}}</span></td></tr>
              <tr><td style="padding:8px 0;border-bottom:1px solid #ede8df;" width="38%"><span style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#999999;">Time</span></td><td style="padding:8px 0;border-bottom:1px solid #ede8df;"><span style="font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#1c1b18;">{{time}}&nbsp;&middot;&nbsp;{{service}}</span></td></tr>
              <tr><td style="padding:8px 0;border-bottom:1px solid #ede8df;" width="38%"><span style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#999999;">Guests</span></td><td style="padding:8px 0;border-bottom:1px solid #ede8df;"><span style="font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#1c1b18;">{{partySize}}</span></td></tr>
              <tr><td style="padding:8px 0;" width="38%"><span style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#999999;">Reference</span></td><td style="padding:8px 0;"><span style="font-family:'Courier New',Courier,monospace;font-size:13px;color:#a07800;letter-spacing:1px;">{{reference}}</span></td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 40px 28px;">
        <p style="margin:0;font-size:14px;color:#555555;line-height:1.7;">If your plans change, please contact us as soon as possible at <a href="mailto:{{contactEmail}}" style="color:#8a6a20;text-decoration:none;">{{contactEmail}}</a> or <a href="tel:{{contactPhone}}" style="color:#8a6a20;text-decoration:none;">{{contactPhone}}</a>.</p>
      </td></tr>
      <tr><td style="background:{{themePrimary:#1c1b18}};padding:20px 40px;" align="center">
        <p style="margin:0;font-size:11px;letter-spacing:2px;color:{{themeOnPrimary:#8a7a5a}};text-transform:uppercase;">{{restaurantName}}</p>
        <p style="margin:6px 0 0;font-size:11px;color:{{themeOnPrimary:#5a5450}};"><a href="{{siteUrl}}" style="color:{{themeOnPrimary:#5a5450}};text-decoration:none;">{{siteUrl}}</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`,
  },
  {
    id: "modern-reminder",
    name: "Modern Reminder",
    description: "Minimal white layout with a clear time-first treatment for contemporary venues.",
    subject: "See you at {{time}} — {{restaurantName}}",
    text: `Hi {{guestName}},

Quick reminder that your reservation at {{restaurantName}} is coming up.

Date: {{date}}
Time: {{time}}
Service: {{service}}
Guests: {{partySize}}
Reference: {{reference}}

Need help? Contact {{contactEmail}} or {{contactPhone}}.

{{siteUrl}}`,
    html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Reservation Reminder</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:6px;border-top:4px solid {{themePrimary:#2d6cdf}};">
      <tr><td style="padding:28px 36px 0;"><p style="margin:0;font-size:18px;font-weight:700;color:#111111;">{{restaurantName}}</p></td></tr>
      <tr><td style="padding:22px 36px 0;">
        <p style="margin:0;font-size:13px;font-weight:700;color:{{themePrimary:#2d6cdf}};letter-spacing:1px;text-transform:uppercase;">Reservation reminder</p>
        <p style="margin:8px 0 0;font-size:22px;font-weight:700;color:#111111;">See you at {{time}}, {{guestName}}</p>
        <p style="margin:7px 0 0;font-size:14px;color:#666666;line-height:1.6;">Your table is reserved for {{date}}.</p>
      </td></tr>
      <tr><td style="padding:22px 36px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e5e5;border-radius:6px;overflow:hidden;">
          <tr style="background:#f9f9f9;"><td style="padding:12px 20px;border-bottom:1px solid #e5e5e5;" width="36%"><span style="font-size:11px;font-weight:700;color:#999999;letter-spacing:1px;text-transform:uppercase;">Date</span></td><td style="padding:12px 20px;border-bottom:1px solid #e5e5e5;"><span style="font-size:14px;font-weight:600;color:#111111;">{{date}}</span></td></tr>
          <tr><td style="padding:12px 20px;border-bottom:1px solid #e5e5e5;" width="36%"><span style="font-size:11px;font-weight:700;color:#999999;letter-spacing:1px;text-transform:uppercase;">Time</span></td><td style="padding:12px 20px;border-bottom:1px solid #e5e5e5;"><span style="font-size:14px;font-weight:600;color:#111111;">{{time}}</span><span style="font-size:13px;color:#666666;">&nbsp;&mdash;&nbsp;{{service}}</span></td></tr>
          <tr style="background:#f9f9f9;"><td style="padding:12px 20px;border-bottom:1px solid #e5e5e5;" width="36%"><span style="font-size:11px;font-weight:700;color:#999999;letter-spacing:1px;text-transform:uppercase;">Guests</span></td><td style="padding:12px 20px;border-bottom:1px solid #e5e5e5;"><span style="font-size:14px;font-weight:600;color:#111111;">{{partySize}}</span></td></tr>
          <tr><td style="padding:12px 20px;" width="36%"><span style="font-size:11px;font-weight:700;color:#999999;letter-spacing:1px;text-transform:uppercase;">Reference</span></td><td style="padding:12px 20px;"><span style="font-family:'Courier New',Courier,monospace;font-size:13px;font-weight:700;color:{{themePrimary:#2d6cdf}};letter-spacing:0.5px;">{{reference}}</span></td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 36px 28px;"><p style="margin:0;font-size:13px;color:#888888;line-height:1.65;">Need to change something? Contact us at <a href="mailto:{{contactEmail}}" style="color:{{themePrimary:#2d6cdf}};text-decoration:none;">{{contactEmail}}</a> or <a href="tel:{{contactPhone}}" style="color:{{themePrimary:#2d6cdf}};text-decoration:none;">{{contactPhone}}</a>.</p></td></tr>
      <tr><td style="padding:16px 36px;border-top:1px solid #eeeeee;" align="center"><p style="margin:0;font-size:11px;color:#cccccc;">{{restaurantName}}&nbsp;&middot;&nbsp;<a href="{{siteUrl}}" style="color:#cccccc;text-decoration:none;">{{siteUrl}}</a></p></td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`,
  },
];

// ─── Cancellation confirmation presets ──────────────────────────────────────

export const CANCELLATION_PRESETS: EmailPreset[] = [
  {
    id: "clear-cancellation",
    name: "Clear Cancellation",
    description: "Direct cancellation confirmation with the original booking details retained.",
    subject: "Your reservation at {{restaurantName}} has been cancelled",
    text: `{{restaurantName}} — Reservation Cancelled

Dear {{guestName}},

Your reservation has been cancelled.

  Date:       {{date}}
  Time:       {{time}} · {{service}}
  Guests:     {{partySize}}
  Reference:  {{reference}}

If this was unexpected, please contact us and our team will help.

{{contactPhone}}
{{contactEmail}}
{{siteUrl}}`,
    html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Reservation Cancelled</title></head>
<body style="margin:0;padding:0;background-color:#f7f3f2;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7f3f2;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
      <tr><td style="background:{{themePrimary:#2a1717}};padding:28px 40px;" align="center">
        <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:4px;color:{{themeOnPrimary:#c77c7c}};text-transform:uppercase;">RESERVATION CANCELLED</p>
        <p style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:400;color:{{themeOnPrimary:#f1d8d8}};letter-spacing:0.5px;">{{restaurantName}}</p>
      </td></tr>
      <tr><td style="padding:28px 40px 0;" align="center">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#fdecec;border:1px solid #ef9a9a;border-radius:20px;padding:5px 16px;"><span style="font-size:12px;font-weight:700;color:#b71c1c;letter-spacing:1px;text-transform:uppercase;">Cancelled</span></td></tr></table>
        <p style="margin:14px 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:21px;color:#1c1b18;">Dear {{guestName}},</p>
        <p style="margin:0;font-size:14px;color:#666666;line-height:1.6;">Your reservation has been cancelled. We have kept the details below for your records.</p>
      </td></tr>
      <tr><td style="padding:20px 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fcf8f8;border:1px solid #eedada;border-radius:6px;">
          <tr><td style="padding:20px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:8px 0;border-bottom:1px solid #f0e2e2;" width="38%"><span style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#999999;">Date</span></td><td style="padding:8px 0;border-bottom:1px solid #f0e2e2;"><span style="font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#1c1b18;">{{date}}</span></td></tr>
              <tr><td style="padding:8px 0;border-bottom:1px solid #f0e2e2;" width="38%"><span style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#999999;">Time</span></td><td style="padding:8px 0;border-bottom:1px solid #f0e2e2;"><span style="font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#1c1b18;">{{time}}&nbsp;&middot;&nbsp;{{service}}</span></td></tr>
              <tr><td style="padding:8px 0;border-bottom:1px solid #f0e2e2;" width="38%"><span style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#999999;">Guests</span></td><td style="padding:8px 0;border-bottom:1px solid #f0e2e2;"><span style="font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#1c1b18;">{{partySize}}</span></td></tr>
              <tr><td style="padding:8px 0;" width="38%"><span style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#999999;">Reference</span></td><td style="padding:8px 0;"><span style="font-family:'Courier New',Courier,monospace;font-size:13px;color:#b71c1c;letter-spacing:1px;">{{reference}}</span></td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 40px 28px;"><p style="margin:0;font-size:14px;color:#555555;line-height:1.7;">If this was unexpected, please contact us at <a href="mailto:{{contactEmail}}" style="color:#b71c1c;text-decoration:none;">{{contactEmail}}</a> or <a href="tel:{{contactPhone}}" style="color:#b71c1c;text-decoration:none;">{{contactPhone}}</a>.</p></td></tr>
      <tr><td style="background:{{themePrimary:#2a1717}};padding:20px 40px;" align="center"><p style="margin:0;font-size:11px;letter-spacing:2px;color:{{themeOnPrimary:#c77c7c}};text-transform:uppercase;">{{restaurantName}}</p><p style="margin:6px 0 0;font-size:11px;color:{{themeOnPrimary:#8d6969}};"><a href="{{siteUrl}}" style="color:{{themeOnPrimary:#8d6969}};text-decoration:none;">{{siteUrl}}</a></p></td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`,
  },
  {
    id: "soft-cancellation",
    name: "Soft Cancellation",
    description: "Gentler cancellation notice with rebooking-friendly language.",
    subject: "Reservation cancelled — {{restaurantName}}",
    text: `Dear {{guestName}},

Your reservation at {{restaurantName}} has been cancelled.

Date: {{date}}
Time: {{time}} ({{service}})
Party size: {{partySize}}
Reference: {{reference}}

We hope to welcome you another time. If you would like to book again, visit {{siteUrl}} or contact us at {{contactEmail}}.

{{restaurantName}}`,
    html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Reservation Cancelled</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:6px;border-top:4px solid {{themePrimary:#c45656}};">
      <tr><td style="padding:28px 36px 0;"><p style="margin:0;font-size:18px;font-weight:700;color:#111111;">{{restaurantName}}</p></td></tr>
      <tr><td style="padding:22px 36px 0;">
        <p style="margin:0;font-size:13px;font-weight:700;color:{{themePrimary:#c45656}};letter-spacing:1px;text-transform:uppercase;">Reservation cancelled</p>
        <p style="margin:8px 0 0;font-size:21px;font-weight:700;color:#111111;">Your booking has been cancelled</p>
        <p style="margin:7px 0 0;font-size:14px;color:#666666;line-height:1.6;">Dear {{guestName}}, we have cancelled the reservation below.</p>
      </td></tr>
      <tr><td style="padding:22px 36px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e5e5;border-radius:6px;overflow:hidden;">
          <tr style="background:#f9f9f9;"><td style="padding:12px 20px;border-bottom:1px solid #e5e5e5;" width="36%"><span style="font-size:11px;font-weight:700;color:#999999;letter-spacing:1px;text-transform:uppercase;">Date</span></td><td style="padding:12px 20px;border-bottom:1px solid #e5e5e5;"><span style="font-size:14px;font-weight:600;color:#111111;">{{date}}</span></td></tr>
          <tr><td style="padding:12px 20px;border-bottom:1px solid #e5e5e5;" width="36%"><span style="font-size:11px;font-weight:700;color:#999999;letter-spacing:1px;text-transform:uppercase;">Time</span></td><td style="padding:12px 20px;border-bottom:1px solid #e5e5e5;"><span style="font-size:14px;font-weight:600;color:#111111;">{{time}}</span><span style="font-size:13px;color:#666666;">&nbsp;&mdash;&nbsp;{{service}}</span></td></tr>
          <tr style="background:#f9f9f9;"><td style="padding:12px 20px;border-bottom:1px solid #e5e5e5;" width="36%"><span style="font-size:11px;font-weight:700;color:#999999;letter-spacing:1px;text-transform:uppercase;">Guests</span></td><td style="padding:12px 20px;border-bottom:1px solid #e5e5e5;"><span style="font-size:14px;font-weight:600;color:#111111;">{{partySize}}</span></td></tr>
          <tr><td style="padding:12px 20px;" width="36%"><span style="font-size:11px;font-weight:700;color:#999999;letter-spacing:1px;text-transform:uppercase;">Reference</span></td><td style="padding:12px 20px;"><span style="font-family:'Courier New',Courier,monospace;font-size:13px;font-weight:700;color:{{themePrimary:#c45656}};letter-spacing:0.5px;">{{reference}}</span></td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 36px 28px;"><p style="margin:0;font-size:13px;color:#888888;line-height:1.65;">We hope to welcome you another time. To book again, visit <a href="{{siteUrl}}" style="color:{{themePrimary:#c45656}};text-decoration:none;">{{siteUrl}}</a> or contact <a href="mailto:{{contactEmail}}" style="color:{{themePrimary:#c45656}};text-decoration:none;">{{contactEmail}}</a>.</p></td></tr>
      <tr><td style="padding:16px 36px;border-top:1px solid #eeeeee;" align="center"><p style="margin:0;font-size:11px;color:#cccccc;">{{restaurantName}}&nbsp;&middot;&nbsp;<a href="{{siteUrl}}" style="color:#cccccc;text-decoration:none;">{{siteUrl}}</a></p></td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`,
  },
];
