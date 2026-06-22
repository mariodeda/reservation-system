"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { platformFetch, platformJson, toast, type TenantView } from "@/components/platform/api";

const field =
  "bg-surface-container-high border border-outline-variant/30 rounded-lg px-2 py-1.5 text-sm w-full focus:border-primary outline-none";
const card = "rounded-xl border border-outline-variant/30 bg-surface-container p-4 space-y-3";

type Form = {
  name: string; url: string; contactEmail: string; contactPhone: string;
  locale: string; timezone: string; autoConfirm: boolean; emailEnabled: boolean; feedbackEnabled: boolean;
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
  return {
    name: s.name, url: s.url, contactEmail: s.contactEmail, contactPhone: s.contactPhone,
    locale: s.locale, timezone: s.timezone, autoConfirm: s.autoConfirm, emailEnabled: s.emailEnabled,
    feedbackEnabled: s.feedbackEnabled ?? false,
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

  async function saveSettings() {
    if (!f) return;
    setBusy(true);
    try {
      const settings: Record<string, unknown> = {
        name: f.name, url: f.url, contactEmail: f.contactEmail, contactPhone: f.contactPhone,
        locale: f.locale, timezone: f.timezone, autoConfirm: f.autoConfirm, emailEnabled: f.emailEnabled,
        feedbackEnabled: f.feedbackEnabled,
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
          <Check label="Send confirmation emails" v={f.emailEnabled} on={(v) => set("emailEnabled", v)} />
          <Check label="Post-visit feedback emails" v={f.feedbackEnabled} on={(v) => set("feedbackEnabled", v)} />
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
        <h2 className="font-semibold">Email templates</h2>
        <p className="text-xs text-on-surface-variant">
          Leave blank to use the platform default. Variables: <code>{"{{guestName}}"}</code> <code>{"{{restaurantName}}"}</code> <code>{"{{date}}"}</code> <code>{"{{time}}"}</code> <code>{"{{reference}}"}</code> <code>{"{{siteUrl}}"}</code>. Feedback template also has <code>{"{{feedbackUrl}}"}</code>.
        </p>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">Booking confirmation</h3>
        <div className="space-y-2">
          <Field label="Subject" v={f.confirmSubject} on={(v) => set("confirmSubject", v)} placeholder="Your reservation at {{restaurantName}} is confirmed" />
          <TemplateArea label="Plain text body" v={f.confirmText} on={(v) => set("confirmText", v)} placeholder="Hi {{guestName}}, your table for {{partySize}} on {{date}}…" />
          <TemplateArea label="HTML body" v={f.confirmHtml} on={(v) => set("confirmHtml", v)} placeholder="<p>Hi {{guestName}},…</p>" />
        </div>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant mt-2">Feedback request</h3>
        <div className="space-y-2">
          <Field label="Subject" v={f.feedbackSubject} on={(v) => set("feedbackSubject", v)} placeholder="How was your visit to {{restaurantName}}?" />
          <TemplateArea label="Plain text body" v={f.feedbackText} on={(v) => set("feedbackText", v)} placeholder="Hi {{guestName}}, thanks for dining with us on {{date}}. Leave feedback: {{feedbackUrl}}" />
          <TemplateArea label="HTML body" v={f.feedbackHtml} on={(v) => set("feedbackHtml", v)} placeholder="<p>Hi {{guestName}},…<a href='{{feedbackUrl}}'>Leave feedback</a></p>" />
        </div>
      </section>

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
function TemplateArea({ label, v, on, placeholder }: { label: string; v: string; on: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-xs text-on-surface-variant">{label}</span>
      <textarea
        className={`${field} resize-y`}
        rows={3}
        value={v}
        onChange={(e) => on(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
function Check({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input type="checkbox" checked={v} onChange={(e) => on(e.target.checked)} />
      {label}
    </label>
  );
}
