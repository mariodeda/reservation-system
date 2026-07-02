import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock nodemailer before importing the module under test. vi.mock is hoisted,
// so the mock fns must be created via vi.hoisted (also hoisted) to be in scope.
const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn();
  return { sendMail, createTransport: vi.fn((_opts?: Record<string, unknown>) => ({ sendMail })) };
});
vi.mock("nodemailer", () => ({ default: { createTransport } }));
// The send functions log every attempt; stub the log store so these stay pure
// unit tests with no DB dependency.
vi.mock("@/lib/reservations/email-log-store", () => ({ recordEmailAttempt: vi.fn() }));

import {
  buildEmailVars,
  renderTemplate,
  sendConfirmationEmail,
  sendFeedbackRequestEmail,
  type EmailVars,
} from "@/lib/reservations/email";
import { defaultAvailability } from "@/reservation.config";
import type { Reservation } from "@/lib/reservations/types";
import { hashPassword, templateSettings, type Tenant } from "@/lib/reservations/tenant";

function tenant(over: Partial<Tenant["settings"]> = {}): Tenant {
  return {
    id: "t1", slug: "t1", name: "T1", status: "active", publicKey: "pk_test",
    settings: { ...templateSettings(), locale: "en-US", emailEnabled: true, ...over },
    adminUsername: "staff", adminPasswordHash: hashPassword("x"),
    createdAt: new Date(0).toISOString(),
  };
}

function reservation(over: Partial<Reservation> = {}): Reservation {
  return {
    id: "abcdef12-3456-7890-abcd-ef1234567890",
    date: "2026-06-12",
    time: "19:30",
    offering: "main",
    service: "dinner",
    partySize: 4,
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "+39 055 000",
    status: "confirmed",
    source: "web",
    createdAt: "2026-06-11T10:00:00Z",
    updatedAt: "2026-06-11T10:00:00Z",
    ...over,
  };
}

const vars: EmailVars = {
  guestName: "Jane",
  restaurantName: "Osteria",
  date: "Friday, June 12, 2026",
  time: "19:30",
  service: "Dinner",
  partySize: "4",
  occasion: "",
  notes: "",
  reference: "ABC123",
  contactPhone: "+39",
  contactEmail: "x@y.z",
  siteUrl: "https://x",
};

describe("renderTemplate", () => {
  it("substitutes known placeholders, repeated and all", () => {
    expect(renderTemplate("Hi {{guestName}}, table for {{partySize}} ({{guestName}})", vars)).toBe(
      "Hi Jane, table for 4 (Jane)",
    );
  });
  it("renders unknown placeholders as empty string", () => {
    expect(renderTemplate("a {{nope}} b", vars)).toBe("a  b");
  });
});

describe("buildEmailVars", () => {
  it("formats the date in the tenant locale (UTC) and stringifies party size", () => {
    const v = buildEmailVars(reservation(), tenant());
    expect(v.date).toBe("Friday, June 12, 2026");
    expect(v.partySize).toBe("4");
    expect(v.guestName).toBe("Jane Doe");
    expect(v.reference).toMatch(/^[A-Z0-9]{6}$/);
  });
  it("uses the provided service label and empties optional fields", () => {
    const v = buildEmailVars(reservation({ occasion: undefined, notes: undefined }), tenant(), "Dinner Service");
    expect(v.service).toBe("Dinner Service");
    expect(v.occasion).toBe("");
    expect(v.notes).toBe("");
  });
});

describe("sendConfirmationEmail (per-tenant SMTP)", () => {
  const smtp = { host: "smtp.acme.com", port: 587, secure: false };
  beforeEach(() => {
    sendMail.mockReset();
    createTransport.mockClear();
  });

  it("skips when the tenant has no SMTP configured", async () => {
    const r = await sendConfirmationEmail(reservation(), tenant()); // no smtp
    expect(r).toEqual({ sent: false, skipped: true, reason: "no_smtp" });
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("skips when the tenant has email disabled (even with SMTP)", async () => {
    const r = await sendConfirmationEmail(reservation(), tenant({ emailEnabled: false, smtp }));
    expect(r).toEqual({ sent: false, skipped: true, reason: "event_disabled" });
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("skips when the booking confirmation event is disabled", async () => {
    const r = await sendConfirmationEmail(
      reservation(),
      tenant({ smtp, emailEvents: { bookingConfirmation: false, feedbackRequest: true } }),
    );
    expect(r).toEqual({ sent: false, skipped: true, reason: "event_disabled" });
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("sends via the tenant's own SMTP", async () => {
    sendMail.mockResolvedValueOnce({ messageId: "x" });
    const r = await sendConfirmationEmail(reservation(), tenant({ smtp }), "Dinner");
    expect(r).toEqual({ sent: true });
    expect(createTransport.mock.calls.at(-1)?.[0]).toMatchObject({ host: "smtp.acme.com", port: 587 });
    const arg = sendMail.mock.calls[0][0];
    expect(arg.to).toBe("jane@example.com");
    expect(arg.subject).toContain("Friday, June 12, 2026");
    expect(arg.text).toContain("Dinner");
    expect(arg.headers["X-RSV-Reservation-ID"]).toBe("abcdef12-3456-7890-abcd-ef1234567890");
    expect(arg.icalEvent).toMatchObject({
      method: "REQUEST",
      filename: "invitation.ics",
    });
    expect(arg.headers["Content-Class"]).toBe("urn:content-classes:calendarmessage");
    expect(arg.icalEvent.content).toContain("BEGIN:VCALENDAR");
    expect(arg.icalEvent.content).toContain("METHOD:REQUEST");
    const unfoldedIcs = arg.icalEvent.content.replace(/\r\n /g, "");
    expect(arg.icalEvent.content).toContain("SUMMARY:Osteria Cancello dei Macci reservation");
    expect(arg.icalEvent.content).toContain("DTSTART:20260612T173000Z");
    expect(arg.icalEvent.content).toContain("DTEND:20260612T193000Z");
    expect(unfoldedIcs).toContain("ORGANIZER;CN=\"Osteria Cancello dei Macci\":mailto:reservations@osteria-cancello-dei-macci.example");
    expect(unfoldedIcs).toContain("ATTENDEE;CN=\"Jane Doe\";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:jane@example.com");
    expect(arg.icalEvent.content).toContain("SEQUENCE:0");
    expect(arg.icalEvent.content).toContain("TRANSP:OPAQUE");
    expect(arg.icalEvent.content).toContain("CLASS:PUBLIC");
    expect(arg.icalEvent.content).toContain("X-MICROSOFT-CDO-BUSYSTATUS:BUSY");
    expect(arg.icalEvent.content).toContain("Reservation reference: ABCDEF");
    expect(arg.icalEvent.content).not.toMatch(/(?<!\r)\n/);
  });

  it("uses configured default turn duration for the calendar event end time", async () => {
    sendMail.mockResolvedValueOnce({ messageId: "x" });
    const config = structuredClone(defaultAvailability);
    config.turnMinutes = 90;
    await sendConfirmationEmail(reservation(), tenant({ smtp }), "Dinner", config);

    const arg = sendMail.mock.calls[0][0];
    expect(arg.icalEvent.content).toContain("DTSTART:20260612T173000Z");
    expect(arg.icalEvent.content).toContain("DTEND:20260612T190000Z");
  });

  it("uses the date-specific service duration for the calendar event end time", async () => {
    sendMail.mockResolvedValueOnce({ messageId: "x" });
    const config = structuredClone(defaultAvailability);
    config.turnMinutes = 90;
    config.dateOverrides["2026-06-12"] = {
      closed: false,
      services: [
        { id: "dinner", label: "Dinner", start: "18:00", end: "22:00", interval: 30, capacity: 30, turnMinutes: 45 },
      ],
    };
    await sendConfirmationEmail(reservation(), tenant({ smtp }), "Dinner", config);

    const arg = sendMail.mock.calls[0][0];
    expect(arg.icalEvent.content).toContain("DTSTART:20260612T173000Z");
    expect(arg.icalEvent.content).toContain("DTEND:20260612T181500Z");
  });

  it("converts winter Europe/Rome calendar event times to UTC", async () => {
    sendMail.mockResolvedValueOnce({ messageId: "x" });
    await sendConfirmationEmail(reservation({ date: "2026-01-15", time: "19:30" }), tenant({ smtp }), "Dinner");

    const arg = sendMail.mock.calls[0][0];
    expect(arg.icalEvent.content).toContain("DTSTART:20260115T183000Z");
    expect(arg.icalEvent.content).toContain("DTEND:20260115T203000Z");
  });

  it("uses the configured calendar event title template", async () => {
    sendMail.mockResolvedValueOnce({ messageId: "x" });
    await sendConfirmationEmail(
      reservation(),
      tenant({ smtp, calendarEventTitle: "{{restaurantName}} · {{guestName}} · {{reference}}" }),
      "Dinner",
    );

    const arg = sendMail.mock.calls[0][0];
    expect(arg.icalEvent.content).toContain("SUMMARY:Osteria Cancello dei Macci · Jane Doe · ABCDEF");
  });

  it("marks SMTP recipient rejection as a failed unreachable email", async () => {
    sendMail.mockResolvedValueOnce({ rejected: ["jane@example.com"] });
    const r = await sendConfirmationEmail(reservation(), tenant({ smtp }), "Dinner");
    expect(r).toEqual({
      sent: false,
      reason: "recipient_rejected",
      error: "SMTP rejected recipient: jane@example.com",
    });
  });

  it("uses the tenant SMTP auth, secure flag and custom From", async () => {
    sendMail.mockResolvedValueOnce({ messageId: "y" });
    await sendConfirmationEmail(
      reservation(),
      tenant({ smtp: { host: "smtp.acme.com", port: 465, secure: true, user: "mailer", pass: "pw", from: "Acme <from@acme.com>" } }),
    );
    const transportArg = createTransport.mock.calls.at(-1)?.[0] ?? {};
    expect(transportArg.secure).toBe(true);
    expect(transportArg.auth).toEqual({ user: "mailer", pass: "pw" });
    const mailArg = (sendMail.mock.calls.at(-1)?.[0] ?? {}) as { from?: string };
    expect(mailArg.from).toBe("Acme <from@acme.com>");
  });

  it("never throws when sending fails", async () => {
    sendMail.mockRejectedValueOnce(new Error("connection refused"));
    const r = await sendConfirmationEmail(reservation(), tenant({ smtp }));
    expect(r.sent).toBe(false);
    expect(r.error).toBe("connection refused");
  });

  it("reports a generic error when a non-Error is thrown", async () => {
    sendMail.mockRejectedValueOnce("boom");
    const r = await sendConfirmationEmail(reservation(), tenant({ smtp }));
    expect(r).toEqual({ sent: false, error: "send failed" });
  });
});

describe("sendFeedbackRequestEmail (per-tenant SMTP)", () => {
  const smtp = { host: "smtp.acme.com", port: 587, secure: false };
  // The rating request only ever goes out for guests who showed up, so every
  // config-gate test uses a completed reservation to isolate the gate under test.
  const done = (over: Partial<Reservation> = {}) => reservation({ status: "completed", ...over });
  beforeEach(() => {
    sendMail.mockReset();
    createTransport.mockClear();
  });

  // ── attendance guard: the core "only people who showed up" guarantee ──────────
  it.each(["pending", "confirmed", "seated", "cancelled", "no_show"] as const)(
    "never sends the rating email for a %s reservation (guest did not complete a visit)",
    async (status) => {
      const r = await sendFeedbackRequestEmail(reservation({ status }), tenant({ smtp }));
      expect(r).toEqual({ sent: false, skipped: true, reason: "not_attended" });
      expect(createTransport).not.toHaveBeenCalled();
    },
  );

  it("skips when emailEnabled is false", async () => {
    const r = await sendFeedbackRequestEmail(done(), tenant({ emailEnabled: false, smtp }));
    expect(r).toEqual({ sent: false, skipped: true, reason: "event_disabled" });
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("skips when tenant feedback is disabled", async () => {
    const r = await sendFeedbackRequestEmail(done(), tenant({ feedbackEnabled: false, smtp }));
    expect(r).toEqual({ sent: false, skipped: true, reason: "event_disabled" });
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("skips when the feedback request event is disabled", async () => {
    const r = await sendFeedbackRequestEmail(
      done(),
      tenant({ smtp, emailEvents: { bookingConfirmation: true, feedbackRequest: false } }),
    );
    expect(r).toEqual({ sent: false, skipped: true, reason: "event_disabled" });
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("skips when no SMTP is configured", async () => {
    const r = await sendFeedbackRequestEmail(done(), tenant());
    expect(r).toEqual({ sent: false, skipped: true, reason: "no_smtp" });
  });

  it("skips when reservation has no email address", async () => {
    const r = await sendFeedbackRequestEmail(done({ email: "" }), tenant({ smtp }));
    expect(r).toEqual({ sent: false, skipped: true, reason: "no_recipient" });
  });

  it("substitutes {{reviewUrl}} in subject, text and html via default templates", async () => {
    sendMail.mockResolvedValueOnce({ messageId: "x" });
    await sendFeedbackRequestEmail(done(), tenant({ smtp, name: "T1", reviewUrl: "https://g.page/r/t1/review" }));
    const arg = sendMail.mock.calls[0][0];
    expect(arg.subject).toContain("T1");
    expect(arg.text).toContain("https://g.page/r/t1/review");
    expect(arg.html).toContain("https://g.page/r/t1/review");
    expect(arg.to).toBe("jane@example.com");
    expect(arg.headers["X-RSV-Email-Type"]).toBe("feedbackRequest");
  });

  it("uses a custom feedbackRequest template when configured", async () => {
    sendMail.mockResolvedValueOnce({ messageId: "x" });
    await sendFeedbackRequestEmail(
      done(),
      tenant({
        smtp,
        name: "T1",
        reviewUrl: "https://g.page/r/t1/review",
        emailTemplates: {
          confirmation: { subject: "c", text: "ct", html: "ch" },
          feedbackRequest: {
            subject: "Rate {{restaurantName}}",
            text: "Public: {{reviewUrl}}",
            html: "<a href='{{reviewUrl}}'>review</a>",
          },
        },
      }),
    );
    const arg = sendMail.mock.calls[0][0];
    expect(arg.subject).toBe("Rate T1");
    expect(arg.text).toBe("Public: https://g.page/r/t1/review");
    expect(arg.html).toBe("<a href='https://g.page/r/t1/review'>review</a>");
  });

  it("never throws when SMTP send fails", async () => {
    sendMail.mockRejectedValueOnce(new Error("timeout"));
    const r = await sendFeedbackRequestEmail(done(), tenant({ smtp, reviewUrl: "https://g.page/r/t1/review" }));
    expect(r.sent).toBe(false);
    expect(r.error).toBe("timeout");
  });
});
