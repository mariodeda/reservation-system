"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { platformFetch, platformJson, toast, type TenantView } from "@/components/platform/api";
import {
  CONFIRMATION_PRESETS,
  FEEDBACK_PRESETS,
  renderPreview,
  type EmailPreset,
} from "@/lib/email-presets";

const field =
  "bg-surface-container-high border border-outline-variant/30 rounded-lg px-2 py-1.5 text-sm w-full focus:border-primary outline-none disabled:cursor-not-allowed disabled:opacity-60";
const card = "rounded-xl border border-outline-variant/30 bg-surface-container p-4 space-y-3";

type Form = {
  name: string; url: string; contactEmail: string; contactPhone: string;
  locale: string; timezone: string; autoConfirm: boolean; emailEnabled: boolean;
  emailBookingConfirmation: boolean; emailFeedbackRequest: boolean; feedbackRequestDelayHours: string;
  themePrimary: string; themeOnPrimary: string; logoUrl: string;
  allowedOrigins: string;
  smtpHost: string; smtpPort: string; smtpSecure: boolean; smtpUser: string; smtpFrom: string; smtpPass: string;
  confirmSubject: string; confirmText: string; confirmHtml: string;
  feedbackSubject: string; feedbackText: string; feedbackHtml: string;
};

function toForm(t: TenantView): Form {
  const s = t.settings;
  const ct = s.emailTemplates?.confirmation;
  const ft = s.emailTemplates?.feedbackRequest;
  const feedbackRequestEnabled = s.emailEvents?.feedbackRequest ?? s.feedbackEnabled ?? false;
  return {
    name: s.name, url: s.url, contactEmail: s.contactEmail, contactPhone: s.contactPhone,
    locale: s.locale, timezone: s.timezone, autoConfirm: s.autoConfirm, emailEnabled: s.emailEnabled,
    emailBookingConfirmation: s.emailEvents?.bookingConfirmation ?? true,
    emailFeedbackRequest: feedbackRequestEnabled,
    feedbackRequestDelayHours: String(s.feedbackRequestDelayHours ?? 0),
    themePrimary: s.theme?.primary ?? "", themeOnPrimary: s.theme?.onPrimary ?? "",
    logoUrl: s.logoUrl ?? "",
    allowedOrigins: (s.allowedOrigins ?? []).join("\n"),
    smtpHost: s.smtp?.host ?? "", smtpPort: String(s.smtp?.port ?? 587), smtpSecure: s.smtp?.secure ?? false,
    smtpUser: s.smtp?.user ?? "", smtpFrom: s.smtp?.from ?? "", smtpPass: "",
    confirmSubject: ct?.subject ?? "", confirmText: ct?.text ?? "", confirmHtml: ct?.html ?? "",
    feedbackSubject: ft?.subject ?? "", feedbackText: ft?.text ?? "", feedbackHtml: ft?.html ?? "",
  };
}

export default function TenantDetail() {
  const router = useRouter();
  const id = String(useParams().id);
  const [view, setView] = useState<TenantView | null>(null);
  const [f, setF] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [newHost, setNewHost] = useState("");
  const [newPass, setNewPass] = useState("");
  const [mockBusy, setMockBusy] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await platformJson<{ tenant: TenantView }>(`/api/platform/tenants/${id}`);
      setView(d.tenant);
      setF(toForm(d.tenant));
    } catch {
      toast("Could not load restaurant.", "error");
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!view || !f) return <p className="text-on-surface-variant">Loading…</p>;
  const set = (k: keyof Form, v: string | boolean) => setF((p) => (p ? { ...p, [k]: v } : p));

  function loadPreset(type: "confirmation" | "feedback", preset: EmailPreset) {
    if (type === "confirmation") {
      set("confirmSubject", preset.subject);
      set("confirmText", preset.text);
      set("confirmHtml", preset.html);
    } else {
      set("feedbackSubject", preset.subject);
      set("feedbackText", preset.text);
      set("feedbackHtml", preset.html);
    }
    toast(`Loaded "${preset.name}"`);
  }

  async function saveSettings() {
    if (!f) return;
    setBusy(true);
    try {
      const settings: Record<string, unknown> = {
        name: f.name, url: f.url, contactEmail: f.contactEmail, contactPhone: f.contactPhone,
        locale: f.locale, timezone: f.timezone, autoConfirm: f.autoConfirm, emailEnabled: f.emailEnabled,
        emailEvents: {
          bookingConfirmation: f.emailBookingConfirmation,
          feedbackRequest: f.emailFeedbackRequest,
        },
        feedbackRequestDelayHours: Number(f.feedbackRequestDelayHours) || 0,
        feedbackEnabled: f.emailFeedbackRequest,
        theme: { primary: f.themePrimary || undefined, onPrimary: f.themeOnPrimary || undefined },
        logoUrl: f.logoUrl || undefined,
        allowedOrigins: f.allowedOrigins.split(/[\n,]/).map((o) => o.trim()).filter(Boolean),
      };
      if (f.smtpHost.trim()) {
        settings.smtp = {
          host: f.smtpHost.trim(), port: Number(f.smtpPort) || 587, secure: f.smtpSecure,
          user: f.smtpUser || undefined, from: f.smtpFrom || undefined,
          pass: f.smtpPass || undefined,
        };
      }
      // Only include templates if at least one field was customized
      const hasConfirm = f.confirmSubject || f.confirmText || f.confirmHtml;
      const hasFeedback = f.feedbackSubject || f.feedbackText || f.feedbackHtml;
      if (hasConfirm || hasFeedback) {
        settings.emailTemplates = {
          ...(hasConfirm ? { confirmation: { subject: f.confirmSubject, text: f.confirmText, html: f.confirmHtml } } : {}),
          ...(hasFeedback ? { feedbackRequest: { subject: f.feedbackSubject, text: f.feedbackText, html: f.feedbackHtml } } : {}),
        };
      }
      const res = await platformFetch(`/api/platform/tenants/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      toast("Settings saved");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus() {
    const next = view!.status === "active" ? "disabled" : "active";
    const label = next === "disabled" ? "disable" : "enable";
    if (!confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} ${view!.name}? ${next === "disabled" ? "Guests will no longer be able to book until re-enabled." : "Bookings will resume immediately."}`)) return;
    const res = await platformFetch(`/api/platform/tenants/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }),
    });
    if (res.ok) { toast(`Restaurant ${next}`); load(); } else toast("Could not update status.", "error");
  }

  async function addHost() {
    if (!newHost.trim()) return;
    const res = await platformFetch(`/api/platform/tenants/${id}/domains`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host: newHost.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setView((v) => (v ? { ...v, hosts: data.hosts } : v)); setNewHost(""); toast("Host mapped"); }
    else toast(data.error || "Could not map host.", "error");
  }

  async function removeHost(host: string) {
    if (!confirm(`Remove ${host} from ${view!.name}? Traffic via this domain will stop routing to this restaurant.`)) return;
    const res = await platformFetch(`/api/platform/tenants/${id}/domains`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setView((v) => (v ? { ...v, hosts: data.hosts } : v));
  }

  async function setPassword() {
    if (newPass.length < 8) { toast("Password must be at least 8 characters.", "error"); return; }
    const operatorPassword = window.prompt("Confirm with your platform password");
    if (!operatorPassword) return;
    const res = await platformFetch(`/api/platform/tenants/${id}/password`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: newPass, operatorPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setNewPass(""); toast("Staff password updated"); } else toast(data.error || "Could not set password.", "error");
  }

  async function remove() {
    if (!confirm(`Delete ${view!.name}? This removes its login, hosts, config and all reservations. This cannot be undone.`)) return;
    const operatorPassword = window.prompt("Confirm deletion with your platform password");
    if (!operatorPassword) return;
    const res = await platformFetch(`/api/platform/tenants/${id}`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operatorPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { toast("Restaurant deleted"); router.push("/platform"); } else toast(data.error || "Could not delete.", "error");
  }

  async function mockRun(action: string, label: string, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setMockBusy(action);
    try {
      const res = await platformFetch(`/api/platform/tenants/${id}/mock`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error || "Operation failed.", "error"); return; }
      const summary = data.summary as Record<string, number> | undefined;
      const detail = summary
        ? Object.entries(summary).map(([k, v]) => `${v} ${k}`).join(", ")
        : "";
      toast(detail ? `${label}: ${detail}` : `${label} done`);
    } catch {
      toast("Network error.", "error");
    } finally {
      setMockBusy(null);
    }
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{view.name}</h1>
          <p className="text-xs text-on-surface-variant">/{view.slug} · {view.status}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={toggleStatus} className="text-sm border border-outline-variant/40 rounded-lg px-3 py-1.5 hover:text-primary">
            {view.status === "active" ? "Disable" : "Enable"}
          </button>
          <button onClick={remove} className="text-sm border border-rose-500/40 text-rose-300 rounded-lg px-3 py-1.5 hover:bg-rose-500/10">
            Delete
          </button>
        </div>
      </div>

      {/* Identity & branding */}
      <section className={card}>
        <h2 className="font-semibold">Identity &amp; branding</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Display name" v={f.name} on={(v) => set("name", v)} />
          <Field label="Public URL" v={f.url} on={(v) => set("url", v)} />
          <Field label="Contact email" v={f.contactEmail} on={(v) => set("contactEmail", v)} />
          <Field label="Contact phone" v={f.contactPhone} on={(v) => set("contactPhone", v)} />
          <Field label="Locale" v={f.locale} on={(v) => set("locale", v)} />
          <Field label="Timezone" v={f.timezone} on={(v) => set("timezone", v)} />
          <Field label="Theme primary (#hex)" v={f.themePrimary} on={(v) => set("themePrimary", v)} placeholder="#f2ca50" />
          <Field label="Theme on-primary (#hex)" v={f.themeOnPrimary} on={(v) => set("themeOnPrimary", v)} placeholder="#3c2f00" />
          <Field label="Logo URL (login + admin header)" v={f.logoUrl} on={(v) => set("logoUrl", v)} placeholder="https://… or /logos/acme.png" />
        </div>
        <div className="flex gap-6 flex-wrap">
          <Check label="Auto-confirm web bookings" v={f.autoConfirm} on={(v) => set("autoConfirm", v)} />
        </div>
      </section>

      {/* Booking API — public key + CORS allow-list */}
      <section className={card}>
        <h2 className="font-semibold">Booking API</h2>
        <p className="text-xs text-on-surface-variant">
          A marketing site books against the shared reservation service by setting
          its <code>NEXT_PUBLIC_RESERVATIONS_TENANT</code> to this public key, and is
          allowed to call the API only from the origins listed below.
        </p>
        <label className="block">
          <span className="text-xs text-on-surface-variant">Public tenant key</span>
          <div className="flex gap-2">
            <input className={`${field} font-mono`} readOnly value={view.publicKey} onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              onClick={() => { navigator.clipboard?.writeText(view.publicKey); toast("Key copied"); }}
              className="shrink-0 text-sm border border-outline-variant/40 rounded-lg px-3 hover:text-primary"
            >
              Copy
            </button>
          </div>
        </label>
        <TemplateArea
          label="Allowed origins (one per line — scheme://host[:port])"
          v={f.allowedOrigins}
          on={(v) => set("allowedOrigins", v)}
          placeholder={"https://www.osteria-example.com\nhttps://osteria-example.com"}
        />
      </section>

      {/* Email flow */}
      <section className={card}>
        <div>
          <h2 className="font-semibold">Email flow</h2>
          <p className="text-xs text-on-surface-variant">
            Platform-only controls for this restaurant's outbound email automation. Staff cannot edit these from the tenant admin.
          </p>
        </div>
        <div className="rounded-lg border border-outline-variant/30 bg-surface-container-high/70 p-3 space-y-3">
          <Check
            label="Enable all outbound email for this tenant"
            v={f.emailEnabled}
            on={(v) => set("emailEnabled", v)}
          />
          <p className="text-xs text-on-surface-variant">
            When off, every event below is suppressed even if SMTP credentials and templates are configured.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-outline-variant/30 bg-surface-container-high/70 p-3 space-y-2">
            <Check
              label="Booking confirmation email"
              v={f.emailBookingConfirmation}
              on={(v) => set("emailBookingConfirmation", v)}
              disabled={!f.emailEnabled}
            />
            <p className="text-xs text-on-surface-variant">
              Sent after confirmed public bookings when auto-confirm is on, or after any confirmed booking path calls the confirmation event.
            </p>
          </div>
          <div className="rounded-lg border border-outline-variant/30 bg-surface-container-high/70 p-3 space-y-3">
            <Check
              label="Post-visit review request email"
              v={f.emailFeedbackRequest}
              on={(v) => set("emailFeedbackRequest", v)}
              disabled={!f.emailEnabled}
            />
            <label className="block">
              <span className="text-xs text-on-surface-variant">Review request delay, in hours after reservation time</span>
              <input
                className={field}
                type="number"
                min="0"
                max="720"
                step="1"
                disabled={!f.emailEnabled || !f.emailFeedbackRequest}
                value={f.feedbackRequestDelayHours}
                onChange={(e) => set("feedbackRequestDelayHours", e.target.value)}
                placeholder="0"
              />
            </label>
          </div>
        </div>
      </section>

      {/* SMTP */}
      <section className={card}>
        <h2 className="font-semibold">Email (SMTP)</h2>
        <p className="text-xs text-on-surface-variant">Each restaurant sends from its own mail server. Leave host blank to disable email.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="SMTP host" v={f.smtpHost} on={(v) => set("smtpHost", v)} placeholder="smtp.mailgun.org" />
          <Field label="Port" v={f.smtpPort} on={(v) => set("smtpPort", v)} placeholder="587" />
          <Field label="Username" v={f.smtpUser} on={(v) => set("smtpUser", v)} />
          <Field label="From (optional)" v={f.smtpFrom} on={(v) => set("smtpFrom", v)} placeholder="Acme <book@acme.com>" />
          <label className="block">
            <span className="text-xs text-on-surface-variant">Password {view.settings.smtpPassSet ? "(set — leave blank to keep)" : ""}</span>
            <input className={field} type="password" value={f.smtpPass} onChange={(e) => set("smtpPass", e.target.value)} placeholder={view.settings.smtpPassSet ? "••••••••" : ""} />
          </label>
          <Check label="Use TLS (secure)" v={f.smtpSecure} on={(v) => set("smtpSecure", v)} />
        </div>
      </section>

      {/* Email templates */}
      <section className={card}>
        <div>
          <h2 className="font-semibold">Email templates</h2>
          <p className="text-xs text-on-surface-variant mt-1">
            Leave blank to use the platform default. Variables:&nbsp;
            {["guestName","restaurantName","date","time","service","partySize","reference","contactPhone","contactEmail","siteUrl"].map((v) => (
              <code key={v} className="mx-0.5 px-1 py-0.5 rounded bg-surface-container-high text-[10px]">{`{{${v}}}`}</code>
            ))}.
            Feedback template also accepts <code className="mx-0.5 px-1 py-0.5 rounded bg-surface-container-high text-[10px]">{"{{feedbackUrl}}"}</code>.
          </p>
        </div>

        {/* Booking confirmation */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">Booking confirmation</h3>
          </div>
          {/* Preset picker */}
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[11px] text-on-surface-variant/60 self-center mr-1">Presets:</span>
            {CONFIRMATION_PRESETS.map((p) => (
              <PresetButton key={p.id} preset={p} onLoad={() => loadPreset("confirmation", p)} />
            ))}
          </div>
          <div className="space-y-2">
            <Field label="Subject" v={f.confirmSubject} on={(v) => set("confirmSubject", v)} placeholder="Your reservation at {{restaurantName}} is confirmed" />
            <TemplateArea label="Plain text body" v={f.confirmText} on={(v) => set("confirmText", v)} rows={5} placeholder="Hi {{guestName}}, your table for {{partySize}} on {{date}}…" />
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-on-surface-variant">HTML body</span>
                {f.confirmHtml && (
                  <button
                    type="button"
                    onClick={() => setPreviewHtml(renderPreview(f.confirmHtml))}
                    className="text-[11px] text-primary hover:text-primary/70 flex items-center gap-1 transition"
                  >
                    <EyeIcon /> Preview
                  </button>
                )}
              </div>
              <textarea
                className={`${field} resize-y font-mono text-xs`}
                rows={6}
                value={f.confirmHtml}
                onChange={(e) => set("confirmHtml", e.target.value)}
                placeholder="<!DOCTYPE html>…"
              />
            </div>
          </div>
        </div>

        {/* Feedback request */}
        <div className="space-y-3 pt-2 border-t border-outline-variant/20">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant pt-1">Feedback request</h3>
          {/* Preset picker */}
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[11px] text-on-surface-variant/60 self-center mr-1">Presets:</span>
            {FEEDBACK_PRESETS.map((p) => (
              <PresetButton key={p.id} preset={p} onLoad={() => loadPreset("feedback", p)} />
            ))}
          </div>
          <div className="space-y-2">
            <Field label="Subject" v={f.feedbackSubject} on={(v) => set("feedbackSubject", v)} placeholder="How was your visit to {{restaurantName}}?" />
            <TemplateArea label="Plain text body" v={f.feedbackText} on={(v) => set("feedbackText", v)} rows={5} placeholder="Hi {{guestName}}, thanks for dining with us on {{date}}. Leave feedback: {{feedbackUrl}}" />
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-on-surface-variant">HTML body</span>
                {f.feedbackHtml && (
                  <button
                    type="button"
                    onClick={() => setPreviewHtml(renderPreview(f.feedbackHtml))}
                    className="text-[11px] text-primary hover:text-primary/70 flex items-center gap-1 transition"
                  >
                    <EyeIcon /> Preview
                  </button>
                )}
              </div>
              <textarea
                className={`${field} resize-y font-mono text-xs`}
                rows={6}
                value={f.feedbackHtml}
                onChange={(e) => set("feedbackHtml", e.target.value)}
                placeholder="<!DOCTYPE html>…"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Email preview modal */}
      {previewHtml !== null && (
        <EmailPreviewModal html={previewHtml} onClose={() => setPreviewHtml(null)} />
      )}

      <button onClick={saveSettings} disabled={busy} className="bg-primary text-on-primary px-5 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-60">
        {busy ? "Saving…" : "Save settings"}
      </button>

      {/* Hosts */}
      <section className={card}>
        <h2 className="font-semibold">Hosts</h2>
        <p className="text-xs text-on-surface-variant">DNS-alias these hostnames to this deployment. Requests on them resolve to this restaurant.</p>
        <div className="flex flex-wrap gap-2">
          {view.hosts.length === 0 && <span className="text-on-surface-variant text-sm">None mapped.</span>}
          {view.hosts.map((h) => (
            <span key={h} className="flex items-center gap-2 bg-surface-container-high border border-outline-variant/30 rounded-full pl-3 pr-1 py-1 text-sm">
              {h}
              <button onClick={() => removeHost(h)} className="w-5 h-5 rounded-full hover:bg-rose-500/20 text-rose-400 inline-flex items-center justify-center" aria-label={`Remove ${h}`}>
                <XIcon className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className={field} value={newHost} onChange={(e) => setNewHost(e.target.value)} placeholder="acme.example.com" />
          <button onClick={addHost} className="bg-surface-container-high border border-outline-variant/30 rounded-lg px-3 text-sm hover:border-primary whitespace-nowrap">Add host</button>
        </div>
      </section>

      {/* Staff password */}
      <section className={card}>
        <h2 className="font-semibold">Staff login</h2>
        <p className="text-xs text-on-surface-variant">Reset the password staff use at this restaurant's <code>/admin/{view.slug}/login</code>.</p>
        <div className="flex gap-2">
          <input className={field} type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="New password (8+ chars)" />
          <button onClick={setPassword} className="bg-surface-container-high border border-outline-variant/30 rounded-lg px-3 text-sm hover:border-primary whitespace-nowrap">Set password</button>
        </div>
      </section>

      {/* Debug — mock data */}
      <section className={`${card} border-amber-500/30`}>
        <div>
          <h2 className="font-semibold">Debug — mock data</h2>
          <p className="text-xs text-on-surface-variant">
            Generate realistic test data for <strong>{view.name}</strong> to exercise every admin screen.
            Generators are additive; use "Clear all data" to reset. For test tenants only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <MockBtn busy={mockBusy} action="all" label="Generate everything"
            onClick={() => mockRun("all", "Full dataset")} primary />
          <MockBtn busy={mockBusy} action="tables" label="Tables (floor plan)"
            onClick={() => mockRun("tables", "Tables")} />
          <MockBtn busy={mockBusy} action="reservations-today" label="Reservations · today"
            onClick={() => mockRun("reservations-today", "Today")} />
          <MockBtn busy={mockBusy} action="reservations-upcoming" label="Reservations · upcoming"
            onClick={() => mockRun("reservations-upcoming", "Upcoming")} />
          <MockBtn busy={mockBusy} action="reservations-history" label="Reservations · history"
            onClick={() => mockRun("reservations-history", "History")} />
          <MockBtn busy={mockBusy} action="waitlist" label="Waitlist"
            onClick={() => mockRun("waitlist", "Waitlist")} />
          <MockBtn busy={mockBusy} action="customers" label="Customers (VIP/dietary)"
            onClick={() => mockRun("customers", "Customers")} />
          <MockBtn busy={mockBusy} action="feedback" label="Feedback (ratings)"
            onClick={() => mockRun("feedback", "Feedback")} />
        </div>
        <div className="pt-1">
          <button
            disabled={!!mockBusy}
            onClick={() => mockRun("clear", "Cleared",
              `Delete ALL reservations, tables, waitlist, customers and feedback for ${view.name}? This cannot be undone.`)}
            className="text-sm border border-rose-500/40 text-rose-300 rounded-lg px-3 py-1.5 hover:bg-rose-500/10 disabled:opacity-50"
          >
            {mockBusy === "clear" ? "Clearing…" : "Clear all data"}
          </button>
        </div>
      </section>
    </div>
  );
}

function XIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function MockBtn({
  busy, action, label, onClick, primary,
}: {
  busy: string | null; action: string; label: string; onClick: () => void; primary?: boolean;
}) {
  const running = busy === action;
  return (
    <button
      disabled={!!busy}
      onClick={onClick}
      className={`text-sm rounded-lg px-3 py-1.5 disabled:opacity-50 ${
        primary
          ? "bg-primary text-on-primary font-semibold hover:brightness-110"
          : "bg-surface-container-high border border-outline-variant/30 hover:border-primary"
      }`}
    >
      {running ? "Working…" : label}
    </button>
  );
}

function Field({ label, v, on, placeholder }: { label: string; v: string; on: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-xs text-on-surface-variant">{label}</span>
      <input className={field} value={v} onChange={(e) => on(e.target.value)} placeholder={placeholder} />
    </label>
  );
}
function TemplateArea({ label, v, on, placeholder, rows = 3 }: { label: string; v: string; on: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <label className="block">
      <span className="text-xs text-on-surface-variant">{label}</span>
      <textarea
        className={`${field} resize-y`}
        rows={rows}
        value={v}
        onChange={(e) => on(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function PresetButton({ preset, onLoad }: { preset: EmailPreset; onLoad: () => void }) {
  const [tip, setTip] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onLoad}
        onMouseEnter={() => setTip(true)}
        onMouseLeave={() => setTip(false)}
        className="text-[11px] px-2.5 py-1 rounded-full border border-outline-variant/40 text-on-surface-variant hover:border-primary hover:text-primary hover:bg-primary/5 transition"
      >
        {preset.name}
      </button>
      {tip && (
        <div className="absolute bottom-full left-0 mb-1.5 z-10 w-52 rounded-lg bg-surface-container border border-outline-variant/40 shadow-xl px-3 py-2 pointer-events-none">
          <p className="text-xs font-semibold text-on-surface">{preset.name}</p>
          <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">{preset.description}</p>
        </div>
      )}
    </div>
  );
}

function EmailPreviewModal({ html, onClose }: { html: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (!ref.current?.contains(e.target as Node)) onClose(); }}
    >
      <div ref={ref} className="relative w-full max-w-2xl mx-4 rounded-xl overflow-hidden shadow-2xl" style={{ background: "#1a1916" }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 12, fontWeight: 600, color: "#c9a44a", letterSpacing: "1px", textTransform: "uppercase" }}>
              Email Preview
            </span>
            <span style={{ fontSize: 11, color: "#666", marginLeft: 4 }}>— sample data</span>
          </div>
          <button
            onClick={onClose}
            style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.06)", color: "#aaa", border: "none", cursor: "pointer" }}
            aria-label="Close preview"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        <div style={{ background: "#f4f4f4", maxHeight: "72vh", overflow: "auto" }}>
          <iframe
            srcDoc={html}
            title="Email preview"
            style={{ width: "100%", minHeight: 480, border: "none", display: "block" }}
            sandbox="allow-same-origin"
          />
        </div>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5Z"/>
      <circle cx="8" cy="8" r="2"/>
    </svg>
  );
}
function Check({ label, v, on, disabled = false }: { label: string; v: boolean; on: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-2 text-sm ${disabled ? "cursor-not-allowed text-on-surface-variant" : "cursor-pointer"}`}>
      <input type="checkbox" checked={v} disabled={disabled} onChange={(e) => on(e.target.checked)} />
      {label}
    </label>
  );
}
