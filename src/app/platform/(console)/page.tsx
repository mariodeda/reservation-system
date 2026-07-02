"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { platformFetch, platformJson, toast, type TenantView } from "@/components/platform/api";
import { am } from "@/i18n";
import Tooltip from "@/components/ui/Tooltip";

const field =
  "bg-surface-container-high border border-outline-variant/30 rounded-lg px-2 py-1.5 text-sm w-full focus:border-primary outline-none";

interface TenantStats {
  total: number;
  last30: number;
  totalCovers: number;
  noShows: number;
  cancellations: number;
  lastBookingDate: string | null;
}

interface PlatformAnalytics {
  totals: { reservations: number; last30: number; tenants: number };
  byTenant: Record<string, TenantStats>;
}

export default function PlatformHome() {
  const [tenants, setTenants] = useState<TenantView[] | null>(null);
  const [analytics, setAnalytics] = useState<PlatformAnalytics | null>(null);
  const [creating, setCreating] = useState(false);
  const [checkingSmtp, setCheckingSmtp] = useState(false);

  async function load() {
    try {
      const [tenantsData, analyticsData] = await Promise.all([
        platformJson<{ tenants: TenantView[] }>("/api/platform/tenants"),
        platformJson<PlatformAnalytics>("/api/platform/analytics").catch(() => null),
      ]);
      setTenants(tenantsData.tenants);
      setAnalytics(analyticsData);
    } catch {
      toast(am.platform.couldNotLoad, "error");
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function checkSmtpNow() {
    setCheckingSmtp(true);
    try {
      const res = await platformFetch("/api/platform/cron/smtp-health", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || am.platform.smtpCheckFailed);
      toast(am.platform.smtpCheckComplete(Number(data.checked) || 0));
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : am.platform.smtpCheckFailed, "error");
    } finally {
      setCheckingSmtp(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{am.platform.title}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={checkSmtpNow}
            disabled={checkingSmtp}
            className="border border-outline-variant/40 text-on-surface-variant px-4 py-2 rounded-lg text-sm font-semibold hover:text-primary hover:border-primary/50 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {checkingSmtp ? am.platform.smtpChecking : am.platform.smtpCheckNow}
          </button>
          <button
            onClick={() => setCreating((c) => !c)}
            className="bg-primary text-on-primary px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110"
          >
            {creating ? am.platform.close : am.platform.newRestaurant}
          </button>
        </div>
      </div>

      {creating && <CreateForm onCreated={() => { setCreating(false); load(); }} />}

      {/* Platform-wide stats */}
      {analytics && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: am.platform.totals.bookings, value: analytics.totals.reservations },
            { label: am.platform.totals.last30, value: analytics.totals.last30 },
            { label: am.platform.totals.active, value: analytics.totals.tenants },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-outline-variant/30 bg-surface-container p-4">
              <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
              <div className="text-xs uppercase tracking-widest text-on-surface-variant mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {tenants === null ? (
        <p className="text-on-surface-variant">{am.platform.loading}</p>
      ) : tenants.length === 0 ? (
        <p className="text-on-surface-variant">{am.platform.noRestaurants}</p>
      ) : (
        <div className="space-y-2">
          {tenants.map((t) => {
            const stats = analytics?.byTenant[t.id];
            return (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-xl border border-outline-variant/30 bg-surface-container p-4 hover:border-primary/50 transition"
              >
                <Link href={`/platform/tenants/${t.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{t.name}</span>
                    <span className="text-xs text-on-surface-variant">/{t.slug}</span>
                    {t.status === "disabled" && (
                      <span className="text-[10px] uppercase tracking-widest text-rose-300 border border-rose-500/30 rounded px-1.5 py-0.5">{am.platform.statusDisabled}</span>
                    )}
                  </div>
                  <div className="text-xs text-on-surface-variant truncate mt-0.5">
                    {t.hosts.length ? t.hosts.join(", ") : am.platform.noHostsMapped}
                  </div>
                  <EmailSummary tenant={t} />
                </Link>
                {stats && (
                  <div className="flex items-center gap-4 shrink-0 ml-4 text-xs text-on-surface-variant">
                    <Tooltip content={am.platform.totals.bookings}>
                      <span>
                        <span className="font-semibold text-on-surface">{stats.total}</span> {am.platform.totalShort}
                      </span>
                    </Tooltip>
                    <Tooltip content={am.platform.totals.last30} className="hidden sm:inline">
                      <span>
                        <span className="font-semibold text-on-surface">{stats.last30}</span> {am.platform.last30Short}
                      </span>
                    </Tooltip>
                    {stats.noShows > 0 && (
                      <Tooltip content={am.platform.noShowsTitle} className="hidden md:inline">
                        <span className="text-rose-400">{am.platform.noShows(stats.noShows)}</span>
                      </Tooltip>
                    )}
                    {stats.lastBookingDate && (
                      <Tooltip content={am.platform.lastBookingTitle} className="hidden lg:inline">
                        <span>{am.platform.lastBooking(stats.lastBookingDate)}</span>
                      </Tooltip>
                    )}
                  </div>
                )}
                <Link href={`/platform/tenants/${t.id}`} aria-label={`Open ${t.name}`} className="ml-3 shrink-0 text-on-surface-variant hover:text-primary">
                  <ChevronRightIcon className="h-4 w-4" />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmailSummary({ tenant }: { tenant: TenantView }) {
  const emailEnabled = tenant.settings.emailEnabled;
  const emailReady = emailEnabled && tenant.settings.smtpPassSet;
  const feedbackTemplate = tenant.settings.emailTemplates?.feedbackRequest;
  const feedbackTemplateReady = Boolean(
    feedbackTemplate?.subject?.trim() &&
    feedbackTemplate?.text?.trim() &&
    feedbackTemplate?.html?.trim(),
  );
  const confirmation = emailReady && (tenant.settings.emailEvents?.bookingConfirmation ?? true);
  const feedback = emailReady && feedbackTemplateReady && (tenant.settings.emailEvents?.feedbackRequest ?? tenant.settings.feedbackEnabled ?? false);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="text-on-surface-variant mr-0.5">{am.platform.emailSummary}</span>
      {!emailEnabled ? (
        <span className="rounded-full border border-outline-variant/40 bg-surface-container-high px-2 py-0.5 text-on-surface-variant">
          {am.platform.emailGloballyOff}
        </span>
      ) : (
        <>
          <EmailChip label={am.platform.emailConfirmation} on={confirmation} />
          <EmailChip label={am.platform.emailFeedback} on={feedback} />
        </>
      )}
      <SmtpHealthChip tenant={tenant} />
    </div>
  );
}

function SmtpHealthChip({ tenant }: { tenant: TenantView }) {
  const health = tenant.smtpHealth;
  const configComplete = Boolean(tenant.settings.smtp?.host && tenant.settings.smtpPassSet);
  const status = !configComplete ? "not_configured" : health.status;
  const tone = status === "ok" ? "ok" : status === "failed" ? "failed" : "idle";
  const label =
    status === "ok"
      ? am.platform.smtpOk
      : status === "failed"
        ? am.platform.smtpFailed
        : status === "not_configured"
          ? am.platform.smtpNotConfigured
          : am.platform.smtpUnknown;
  const title = [
    `${am.platform.smtpStatus}: ${label}`,
    health.checkedAt ? new Date(health.checkedAt).toLocaleString() : "",
    health.reason || "",
  ].filter(Boolean).join(" · ");
  return (
    <Tooltip content={title}>
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${
          tone === "ok"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : tone === "failed"
              ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
              : "border-outline-variant/40 bg-surface-container-high text-on-surface-variant"
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${
          tone === "ok" ? "bg-emerald-400" : tone === "failed" ? "bg-rose-400" : "bg-on-surface-variant/50"
        }`} />
        {am.platform.smtpStatus}: {label}
      </span>
    </Tooltip>
  );
}

function EmailChip({ label, on }: { label: string; on: boolean }) {
  return (
    <Tooltip content={`${label}: ${on ? am.platform.emailOn : am.platform.emailOff}`}>
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${
          on
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : "border-outline-variant/40 bg-surface-container-high text-on-surface-variant"
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-emerald-400" : "bg-on-surface-variant/50"}`} />
        {label}
      </span>
    </Tooltip>
  );
}

function ChevronRightIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function CreateForm({ onCreated }: { onCreated: () => void }) {
  const [f, setF] = useState({ name: "", slug: "", username: "", password: "", hosts: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function submit() {
    if (!f.name.trim() || !f.slug.trim() || !f.username.trim() || f.password.length < 8) {
      toast(am.platform.create.validationError, "error");
      return;
    }
    setBusy(true);
    try {
      const res = await platformFetch("/api/platform/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: f.slug.trim().toLowerCase(),
          name: f.name.trim(),
          username: f.username.trim(),
          password: f.password,
          hosts: f.hosts.split(/[\s,]+/).map((h) => h.trim()).filter(Boolean),
          settings: { name: f.name.trim(), autoConfirm: true, emailEnabled: true, timezone: "Europe/Rome", locale: "en-US" },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || am.platform.create.error);
      toast(am.platform.create.created);
      onCreated();
    } catch (e) {
      toast(e instanceof Error ? e.message : am.platform.create.error, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4 space-y-3">
      <h2 className="font-semibold">{am.platform.create.title}</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block"><span className="text-xs text-on-surface-variant">{am.platform.create.name}</span>
          <input className={field} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Acme Osteria" /></label>
        <label className="block"><span className="text-xs text-on-surface-variant">{am.platform.create.slug}</span>
          <input className={field} value={f.slug} onChange={(e) => set("slug", e.target.value)} placeholder="acme" /></label>
        <label className="block"><span className="text-xs text-on-surface-variant">{am.platform.create.username}</span>
          <input className={field} value={f.username} onChange={(e) => set("username", e.target.value)} placeholder="staff" /></label>
        <label className="block"><span className="text-xs text-on-surface-variant">{am.platform.create.password}</span>
          <input className={field} type="password" value={f.password} onChange={(e) => set("password", e.target.value)} /></label>
        <label className="block sm:col-span-2"><span className="text-xs text-on-surface-variant">{am.platform.create.hosts}</span>
          <input className={field} value={f.hosts} onChange={(e) => set("hosts", e.target.value)} placeholder="acme.example.com admin.acme.example.com" /></label>
      </div>
      <button onClick={submit} disabled={busy} className="bg-primary text-on-primary px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-60">
        {busy ? am.platform.create.creating : am.platform.create.create}
      </button>
    </div>
  );
}
