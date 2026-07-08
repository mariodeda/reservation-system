import { describe, expect, it } from "vitest";
import { redactSettings, sanitizeTenantSettings } from "@/lib/reservations/sanitize-tenant";

describe("sanitizeTenantSettings", () => {
  it("applies defaults and coerces flags", () => {
    const s = sanitizeTenantSettings({});
    expect(s.name).toBe("Restaurant");
    expect(s.locale).toBe("en-US");
    expect(s.timezone).toBe("Europe/Rome");
    expect(s.autoConfirm).toBe(false);
    expect(s.emailEnabled).toBe(false);
    expect(s.smtp).toBeUndefined();
    expect(s.theme).toBeUndefined();
  });

  it("normalizes, de-dupes and caps allowedOrigins; drops invalid", () => {
    const s = sanitizeTenantSettings({
      allowedOrigins: [
        "https://Example.com/",
        "https://example.com",
        "http://localhost:3000",
        "ftp://nope.com",
        "not a url",
        123 as never,
      ],
    });
    expect(s.allowedOrigins).toEqual(["https://example.com", "http://localhost:3000"]);
  });

  it("omits allowedOrigins when none are valid", () => {
    expect(sanitizeTenantSettings({ allowedOrigins: ["nope", "ftp://x"] }).allowedOrigins).toBeUndefined();
    expect(sanitizeTenantSettings({}).allowedOrigins).toBeUndefined();
  });

  it("caps allowedOrigins at 20", () => {
    const many = Array.from({ length: 30 }, (_, i) => `https://s${i}.example.com`);
    expect(sanitizeTenantSettings({ allowedOrigins: many }).allowedOrigins).toHaveLength(20);
  });

  it("accepts an http(s) URL or root-relative path as logoUrl; rejects others", () => {
    expect(sanitizeTenantSettings({ logoUrl: "https://cdn.example/acme.png" }).logoUrl).toBe("https://cdn.example/acme.png");
    expect(sanitizeTenantSettings({ logoUrl: "/logos/acme.png" }).logoUrl).toBe("/logos/acme.png");
    expect(sanitizeTenantSettings({ logoUrl: "  https://x/y.png  " }).logoUrl).toBe("https://x/y.png");
    // rejected: javascript:, protocol-relative, bare strings, empty
    expect(sanitizeTenantSettings({ logoUrl: "javascript:alert(1)" }).logoUrl).toBeUndefined();
    expect(sanitizeTenantSettings({ logoUrl: "//evil.com/x.png" }).logoUrl).toBeUndefined();
    expect(sanitizeTenantSettings({ logoUrl: "acme.png" }).logoUrl).toBeUndefined();
    expect(sanitizeTenantSettings({ logoUrl: "" }).logoUrl).toBeUndefined();
    expect(sanitizeTenantSettings({}).logoUrl).toBeUndefined();
  });

  it("accepts only absolute http(s) URLs as reviewUrl", () => {
    expect(sanitizeTenantSettings({ reviewUrl: " https://g.page/r/acme/review " }).reviewUrl).toBe("https://g.page/r/acme/review");
    expect(sanitizeTenantSettings({ reviewUrl: "http://reviews.example/acme" }).reviewUrl).toBe("http://reviews.example/acme");
    expect(sanitizeTenantSettings({ reviewUrl: "/reviews/acme" }).reviewUrl).toBeUndefined();
    expect(sanitizeTenantSettings({ reviewUrl: "javascript:alert(1)" }).reviewUrl).toBeUndefined();
    expect(sanitizeTenantSettings({ reviewUrl: "" }).reviewUrl).toBeUndefined();
  });

  it("keeps only valid hex theme colors", () => {
    expect(sanitizeTenantSettings({ theme: { primary: "#f2ca50", onPrimary: "nope" } }).theme).toEqual({ primary: "#f2ca50" });
    expect(sanitizeTenantSettings({ theme: { primary: "red" } }).theme).toBeUndefined();
  });

  it("validates and clamps SMTP", () => {
    // Unknown port falls back to 587
    const s = sanitizeTenantSettings({
      smtp: { host: " smtp.acme.com ", port: 999999, secure: 1 as unknown as boolean, user: "u", pass: "p", from: "F <f@x.io>" },
    });
    expect(s.smtp).toEqual({ host: "smtp.acme.com", port: 587, secure: true, user: "u", pass: "p", from: "F <f@x.io>" });
    // Whitelisted ports pass through unchanged
    expect(sanitizeTenantSettings({ smtp: { host: "h", port: 465, secure: true } }).smtp?.port).toBe(465);
    expect(sanitizeTenantSettings({ smtp: { host: "h", port: 25, secure: false } }).smtp?.port).toBe(25);
    expect(sanitizeTenantSettings({ smtp: { host: "h", port: 2525, secure: false } }).smtp?.port).toBe(2525);
  });

  it("drops SMTP entirely when host is blank (disables email transport)", () => {
    expect(sanitizeTenantSettings({ smtp: { host: "", port: 587, secure: false } }).smtp).toBeUndefined();
  });

  it("accepts a complete email template, rejects a partial one", () => {
    const ok = sanitizeTenantSettings({ emailTemplates: { confirmation: { subject: "s", text: "t", html: "h" } } });
    expect(ok.emailTemplates?.confirmation?.subject).toBe("s");
    const partial = sanitizeTenantSettings({ emailTemplates: { confirmation: { subject: "s" } } as never });
    expect(partial.emailTemplates).toBeUndefined();
  });

  it("accepts a feedbackRequest template alongside or without confirmation", () => {
    const both = sanitizeTenantSettings({
      emailTemplates: {
        confirmation: { subject: "cs", text: "ct", html: "ch" },
        feedbackRequest: { subject: "fs", text: "ft", html: "fh" },
      },
    });
    expect(both.emailTemplates?.confirmation?.subject).toBe("cs");
    expect(both.emailTemplates?.feedbackRequest?.subject).toBe("fs");

    const fbOnly = sanitizeTenantSettings({
      emailTemplates: { feedbackRequest: { subject: "fs", text: "ft", html: "fh" } } as never,
    });
    expect(fbOnly.emailTemplates?.feedbackRequest?.subject).toBe("fs");
    expect(fbOnly.emailTemplates?.confirmation).toBeUndefined();
  });

  it("rejects partial feedbackRequest template (missing html)", () => {
    const partial = sanitizeTenantSettings({
      emailTemplates: { feedbackRequest: { subject: "fs", text: "ft" } } as never,
    });
    expect(partial.emailTemplates).toBeUndefined();
  });

  it("returns undefined emailTemplates when both templates are absent or invalid", () => {
    expect(sanitizeTenantSettings({ emailTemplates: {} as never }).emailTemplates).toBeUndefined();
    expect(sanitizeTenantSettings({ emailTemplates: null as never }).emailTemplates).toBeUndefined();
  });

  it("length-caps template fields (subject → 300, text → 20000, html → 50000)", () => {
    const long = sanitizeTenantSettings({
      emailTemplates: {
        confirmation: {
          subject: "s".repeat(400),
          text: "t".repeat(25000),
          html: "h".repeat(60000),
        },
      },
    });
    expect(long.emailTemplates?.confirmation?.subject).toHaveLength(300);
    expect(long.emailTemplates?.confirmation?.text).toHaveLength(20000);
    expect(long.emailTemplates?.confirmation?.html).toHaveLength(50000);
  });

  it("sets feedbackEnabled from truthy/falsy input", () => {
    expect(sanitizeTenantSettings({ feedbackEnabled: true }).feedbackEnabled).toBe(true);
    expect(sanitizeTenantSettings({ feedbackEnabled: false }).feedbackEnabled).toBe(false);
    expect(sanitizeTenantSettings({}).feedbackEnabled).toBe(false);
    expect(sanitizeTenantSettings({ feedbackEnabled: 1 as unknown as boolean }).feedbackEnabled).toBe(true);
    expect(sanitizeTenantSettings({ feedbackEnabled: 0 as unknown as boolean }).feedbackEnabled).toBe(false);
  });

  it("sanitizes per-event email switches and keeps legacy feedbackEnabled aligned", () => {
    const s = sanitizeTenantSettings({
      emailEvents: { bookingConfirmation: false, feedbackRequest: true },
    });
    expect(s.emailEvents).toEqual({
      bookingConfirmation: false,
      feedbackRequest: true,
      reservationReminder: true,
      cancellationConfirmation: true,
    });
    expect(s.feedbackEnabled).toBe(true);

    const legacy = sanitizeTenantSettings({ feedbackEnabled: true });
    expect(legacy.emailEvents).toEqual({
      bookingConfirmation: true,
      feedbackRequest: true,
      reservationReminder: true,
      cancellationConfirmation: true,
    });
  });

  it("clamps feedback request delay hours", () => {
    expect(sanitizeTenantSettings({ feedbackRequestDelayHours: 48 }).feedbackRequestDelayHours).toBe(48);
    expect(sanitizeTenantSettings({ feedbackRequestDelayHours: -1 }).feedbackRequestDelayHours).toBe(0);
    expect(sanitizeTenantSettings({ feedbackRequestDelayHours: 9999 }).feedbackRequestDelayHours).toBe(720);
  });

  it("clamps reminder lead hours", () => {
    expect(sanitizeTenantSettings({ reminderLeadHours: 12 }).reminderLeadHours).toBe(12);
    expect(sanitizeTenantSettings({ reminderLeadHours: 0 }).reminderLeadHours).toBe(24);
    expect(sanitizeTenantSettings({ reminderLeadHours: -1 }).reminderLeadHours).toBe(24);
    expect(sanitizeTenantSettings({ reminderLeadHours: 9999 }).reminderLeadHours).toBe(720);
  });

  it("length-caps strings", () => {
    expect(sanitizeTenantSettings({ name: "x".repeat(500) }).name).toHaveLength(160);
  });
});

describe("redactSettings", () => {
  it("strips the SMTP password and flags whether one is set", () => {
    const withPass = redactSettings(sanitizeTenantSettings({ smtp: { host: "h", port: 25, secure: false, pass: "secret" } }));
    expect(withPass.smtp?.pass).toBeUndefined();
    expect(withPass.smtpPassSet).toBe(true);

    const noPass = redactSettings(sanitizeTenantSettings({ smtp: { host: "h", port: 25, secure: false } }));
    expect(noPass.smtpPassSet).toBe(false);
  });
});
