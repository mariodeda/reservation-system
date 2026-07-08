"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { platformFetch, platformJson, toast, type TenantView } from "@/components/platform/api";
import { formatPlatformDateTime } from "@/components/platform/date-format";
import {
  CANCELLATION_PRESETS,
  CONFIRMATION_PRESETS,
  FEEDBACK_PRESETS,
  REMINDER_PRESETS,
  renderPreview,
  type EmailPreset,
} from "@/lib/email-presets";
import { am } from "@/i18n";

const field =
  "bg-surface-container-high border border-outline-variant/30 rounded-lg px-2 py-1.5 text-sm w-full focus:border-primary outline-none disabled:cursor-not-allowed disabled:opacity-60";
const card = "rounded-xl border border-outline-variant/30 bg-surface-container p-4 space-y-3";

type Form = {
  name: string; url: string; contactEmail: string; contactPhone: string;
  reviewUrl: string;
  locale: string; timezone: string; autoConfirm: boolean; emailEnabled: boolean;
  emailBookingConfirmation: boolean; emailFeedbackRequest: boolean; emailReservationReminder: boolean; emailCancellationConfirmation: boolean;
  feedbackRequestDelayHours: string; reminderLeadHours: string;
  themePrimary: string; themeOnPrimary: string; logoUrl: string;
  allowedOrigins: string;
  smtpHost: string; smtpPort: string; smtpSecure: boolean; smtpUser: string; smtpFrom: string; smtpPass: string;
  calendarEventTitle: string;
  confirmSubject: string; confirmText: string; confirmHtml: string;
  feedbackSubject: string; feedbackText: string; feedbackHtml: string;
  reminderSubject: string; reminderText: string; reminderHtml: string;
  cancellationSubject: string; cancellationText: string; cancellationHtml: string;
};

type TheForkView = {
  enabled: boolean;
  clientId?: string;
  clientSecretSet: boolean;
  restaurantUuid?: string;
  groupUuid?: string;
  webhookTokenSet: boolean;
  webhookUrl?: string;
  lastSyncAt?: string;
  lastWebhookAt?: string;
  lastError?: string;
};

type TheForkForm = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  restaurantUuid: string;
  groupUuid: string;
};

type DishView = {
  enabled: boolean;
  email?: string;
  establishmentId?: string;
  passwordSet: boolean;
  lastSyncAt?: string;
  lastError?: string;
};

type DishForm = {
  enabled: boolean;
  email: string;
  password: string;
  establishmentId: string;
};

const EXTERNAL_SYNC_CLIENT_TIMEOUT_MS = 115_000;
const DISH_HISTORY_BATCH_DAYS = 7;

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

async function platformJsonWithTimeout<T>(input: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await platformJson<T>(input, { ...init, signal: init.signal ?? controller.signal });
  } catch (err) {
    if (controller.signal.aborted) throw new Error("External sync timed out in the browser. Re-run it to continue; already imported reservations will be skipped.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function SyncStatusBanner({
  name,
  active,
  enabled,
  lastSyncAt,
  lastError,
}: {
  name: string;
  active: boolean;
  enabled: boolean;
  lastSyncAt?: string;
  lastError?: string;
}) {
  const tone = active ? "active" : enabled ? "warning" : "off";
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${
        tone === "active"
          ? "border-emerald-500/40 bg-emerald-500/10 text-on-surface"
          : tone === "warning"
            ? "border-amber-500/40 bg-amber-500/10 text-on-surface"
            : "border-outline-variant/40 bg-surface-container-high text-on-surface-variant"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${
            tone === "active" ? "bg-emerald-400" : tone === "warning" ? "bg-amber-300" : "bg-on-surface-variant/50"
          }`}
        />
        <span className={tone === "off" ? "font-semibold text-on-surface-variant" : "font-semibold text-on-surface"}>
          {active
            ? `${name} sync is active for this restaurant.`
            : enabled
              ? `${name} sync is enabled but not fully configured.`
              : `${name} sync is not active for this restaurant.`}
        </span>
      </div>
      <div className="mt-1 text-xs text-on-surface-variant">
        {active ? "Enabled restaurants are included in internal background sync jobs where that provider supports imports." : "Save valid credentials and enable sync before relying on automated imports."}
        {" "}
        Last sync: {formatPlatformDateTime(lastSyncAt)}.
        {lastError ? ` Last error: ${lastError}` : ""}
      </div>
    </div>
  );
}

function toForm(t: TenantView): Form {
  const s = t.settings;
  const ct = s.emailTemplates?.confirmation;
  const ft = s.emailTemplates?.feedbackRequest;
  const rt = s.emailTemplates?.reminder;
  const xt = s.emailTemplates?.cancellation;
  const feedbackRequestEnabled = s.emailEvents?.feedbackRequest ?? s.feedbackEnabled ?? false;
  return {
    name: s.name, url: s.url, contactEmail: s.contactEmail, contactPhone: s.contactPhone,
    reviewUrl: s.reviewUrl ?? "",
    locale: s.locale, timezone: s.timezone, autoConfirm: s.autoConfirm, emailEnabled: s.emailEnabled,
    emailBookingConfirmation: s.emailEvents?.bookingConfirmation ?? true,
    emailFeedbackRequest: feedbackRequestEnabled,
    emailReservationReminder: s.emailEvents?.reservationReminder ?? true,
    emailCancellationConfirmation: s.emailEvents?.cancellationConfirmation ?? true,
    feedbackRequestDelayHours: String(s.feedbackRequestDelayHours ?? 0),
    reminderLeadHours: String(s.reminderLeadHours ?? 24),
    themePrimary: s.theme?.primary ?? "", themeOnPrimary: s.theme?.onPrimary ?? "",
    logoUrl: s.logoUrl ?? "",
    allowedOrigins: (s.allowedOrigins ?? []).join("\n"),
    smtpHost: s.smtp?.host ?? "", smtpPort: String(s.smtp?.port ?? 587), smtpSecure: s.smtp?.secure ?? false,
    smtpUser: s.smtp?.user ?? "", smtpFrom: s.smtp?.from ?? "", smtpPass: "",
    calendarEventTitle: s.calendarEventTitle ?? "",
    confirmSubject: ct?.subject ?? "", confirmText: ct?.text ?? "", confirmHtml: ct?.html ?? "",
    feedbackSubject: ft?.subject ?? "", feedbackText: ft?.text ?? "", feedbackHtml: ft?.html ?? "",
    reminderSubject: rt?.subject ?? "", reminderText: rt?.text ?? "", reminderHtml: rt?.html ?? "",
    cancellationSubject: xt?.subject ?? "", cancellationText: xt?.text ?? "", cancellationHtml: xt?.html ?? "",
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
  const [theFork, setTheFork] = useState<TheForkView | null>(null);
  const [tfForm, setTfForm] = useState<TheForkForm>({
    enabled: false,
    clientId: "",
    clientSecret: "",
    restaurantUuid: "",
    groupUuid: "",
  });
  const [tfBusy, setTfBusy] = useState<string | null>(null);
  const [webhookToken, setWebhookToken] = useState<string | null>(null);
  const [tfSyncStatus, setTfSyncStatus] = useState<string | null>(null);
  const [dish, setDish] = useState<DishView | null>(null);
  const [dishForm, setDishForm] = useState<DishForm>({
    enabled: false,
    email: "",
    password: "",
    establishmentId: "",
  });
  const [dishBusy, setDishBusy] = useState<string | null>(null);
  const [dishSyncStatus, setDishSyncStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await platformJson<{ tenant: TenantView }>(`/api/platform/tenants/${id}`);
      setView(d.tenant);
      setF(toForm(d.tenant));
    } catch {
      toast(am.platform.tenant.couldNotLoad, "error");
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const loadTheFork = useCallback(async () => {
    try {
      const d = await platformJson<{ integration: TheForkView | null }>(`/api/platform/tenants/${id}/thefork`);
      setTheFork(d.integration);
      setTfForm({
        enabled: d.integration?.enabled ?? false,
        clientId: d.integration?.clientId ?? "",
        clientSecret: "",
        restaurantUuid: d.integration?.restaurantUuid ?? "",
        groupUuid: d.integration?.groupUuid ?? "",
      });
    } catch {
      /* keep page usable if integration is not configured yet */
    }
  }, [id]);
  useEffect(() => { loadTheFork(); }, [loadTheFork]);

  const loadDish = useCallback(async () => {
    try {
      const d = await platformJson<{ integration: DishView | null }>(`/api/platform/tenants/${id}/dish`);
      setDish(d.integration);
      setDishForm({
        enabled: d.integration?.enabled ?? false,
        email: d.integration?.email ?? "",
        password: "",
        establishmentId: d.integration?.establishmentId ?? "",
      });
    } catch {
      /* keep page usable if integration is not configured yet */
    }
  }, [id]);
  useEffect(() => { loadDish(); }, [loadDish]);

  if (!view || !f) return <p className="text-on-surface-variant">{am.platform.loading}</p>;
  const set = (k: keyof Form, v: string | boolean) => setF((p) => (p ? { ...p, [k]: v } : p));

  function loadPreset(type: "confirmation" | "feedback" | "reminder" | "cancellation", preset: EmailPreset) {
    if (type === "confirmation") {
      set("confirmSubject", preset.subject);
      set("confirmText", preset.text);
      set("confirmHtml", preset.html);
    } else if (type === "feedback") {
      set("feedbackSubject", preset.subject);
      set("feedbackText", preset.text);
      set("feedbackHtml", preset.html);
    } else if (type === "reminder") {
      set("reminderSubject", preset.subject);
      set("reminderText", preset.text);
      set("reminderHtml", preset.html);
    } else {
      set("cancellationSubject", preset.subject);
      set("cancellationText", preset.text);
      set("cancellationHtml", preset.html);
    }
    toast(am.platform.tenant.presetLoaded(preset.name));
  }

  async function saveSettings() {
    if (!f) return;
    setBusy(true);
    try {
      const settings: Record<string, unknown> = {
        name: f.name, url: f.url, contactEmail: f.contactEmail, contactPhone: f.contactPhone,
        reviewUrl: f.reviewUrl || undefined,
        locale: f.locale, timezone: f.timezone, autoConfirm: f.autoConfirm, emailEnabled: f.emailEnabled,
        emailEvents: {
          bookingConfirmation: f.emailBookingConfirmation,
          feedbackRequest: f.emailFeedbackRequest,
          reservationReminder: f.emailReservationReminder,
          cancellationConfirmation: f.emailCancellationConfirmation,
        },
        feedbackRequestDelayHours: Number(f.feedbackRequestDelayHours) || 0,
        reminderLeadHours: Number(f.reminderLeadHours) || 0,
        feedbackEnabled: f.emailFeedbackRequest,
        calendarEventTitle: f.calendarEventTitle || undefined,
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
      const hasConfirm = f.confirmSubject || f.confirmText || f.confirmHtml;
      const hasFeedback = f.feedbackSubject || f.feedbackText || f.feedbackHtml;
      const hasReminder = f.reminderSubject || f.reminderText || f.reminderHtml;
      const hasCancellation = f.cancellationSubject || f.cancellationText || f.cancellationHtml;
      if (hasConfirm || hasFeedback || hasReminder || hasCancellation) {
        settings.emailTemplates = {
          ...(hasConfirm ? { confirmation: { subject: f.confirmSubject, textBase64: encodeBase64Utf8(f.confirmText), htmlBase64: encodeBase64Utf8(f.confirmHtml) } } : {}),
          ...(hasFeedback ? { feedbackRequest: { subject: f.feedbackSubject, textBase64: encodeBase64Utf8(f.feedbackText), htmlBase64: encodeBase64Utf8(f.feedbackHtml) } } : {}),
          ...(hasReminder ? { reminder: { subject: f.reminderSubject, textBase64: encodeBase64Utf8(f.reminderText), htmlBase64: encodeBase64Utf8(f.reminderHtml) } } : {}),
          ...(hasCancellation ? { cancellation: { subject: f.cancellationSubject, textBase64: encodeBase64Utf8(f.cancellationText), htmlBase64: encodeBase64Utf8(f.cancellationHtml) } } : {}),
        };
      }
      const res = await platformFetch(`/api/platform/tenants/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || am.platform.tenant.requestFailed);
      toast(am.platform.tenant.saved);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : am.platform.tenant.couldNotSave, "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus() {
    const next = view!.status === "active" ? "disabled" : "active";
    const confirmMsg = next === "disabled"
      ? am.platform.tenant.disableConfirm(view!.name)
      : am.platform.tenant.enableConfirm(view!.name);
    if (!confirm(confirmMsg)) return;
    const res = await platformFetch(`/api/platform/tenants/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }),
    });
    if (res.ok) {
      toast(am.platform.tenant.statusUpdated(next === "active" ? am.platform.statusActive : am.platform.statusDisabled));
      load();
    } else toast(am.platform.tenant.couldNotSave, "error");
  }

  async function addHost() {
    if (!newHost.trim()) return;
    const res = await platformFetch(`/api/platform/tenants/${id}/domains`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host: newHost.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setView((v) => (v ? { ...v, hosts: data.hosts } : v)); setNewHost(""); toast(am.platform.tenant.hostMapped); }
    else toast(data.error || am.platform.tenant.couldNotMapHost, "error");
  }

  async function removeHost(host: string) {
    if (!confirm(am.platform.tenant.removeHostConfirm(host, view!.name))) return;
    const res = await platformFetch(`/api/platform/tenants/${id}/domains`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setView((v) => (v ? { ...v, hosts: data.hosts } : v));
  }

  async function setPassword() {
    if (newPass.length < 8) { toast(am.platform.tenant.passwordTooShort, "error"); return; }
    const operatorPassword = window.prompt(am.platform.tenant.platformPasswordPrompt);
    if (!operatorPassword) return;
    const res = await platformFetch(`/api/platform/tenants/${id}/password`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: newPass, operatorPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setNewPass(""); toast(am.platform.tenant.passwordUpdated); } else toast(data.error || am.platform.tenant.couldNotSetPassword, "error");
  }

  async function remove() {
    if (!confirm(am.platform.tenant.deleteConfirm(view!.name))) return;
    const operatorPassword = window.prompt(am.platform.tenant.platformPasswordPrompt);
    if (!operatorPassword) return;
    const res = await platformFetch(`/api/platform/tenants/${id}`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operatorPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { toast(am.platform.tenant.deleted); router.push("/platform"); } else toast(data.error || am.platform.tenant.couldNotDelete, "error");
  }

  async function impersonateTenant() {
    const operatorPassword = window.prompt(am.platform.tenant.platformPasswordPrompt);
    if (!operatorPassword) return;
    try {
      const res = await platformFetch(`/api/platform/tenants/${id}/impersonation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || am.platform.tenant.couldNotImpersonate);
      window.open(String(data.url || `/admin/${view!.slug}`), "_blank", "noopener");
    } catch (err) {
      toast(err instanceof Error ? err.message : am.platform.tenant.couldNotImpersonate, "error");
    }
  }

  async function mockRun(action: string, label: string, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setMockBusy(action);
    try {
      const res = await platformFetch(`/api/platform/tenants/${id}/mock`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error || am.platform.tenant.operationFailed, "error"); return; }
      const summary = data.summary as Record<string, number> | undefined;
      const detail = summary
        ? Object.entries(summary).map(([k, v]) => `${v} ${k}`).join(", ")
        : "";
      toast(detail ? `${label}: ${detail}` : am.platform.tenant.operationDone(label));
    } catch {
      toast(am.platform.tenant.networkError, "error");
    } finally {
      setMockBusy(null);
    }
  }

  async function saveTheFork(rotateWebhookToken = false) {
    setTfBusy("save");
    setTfSyncStatus("Testing TheFork API connection before saving...");
    try {
      const res = await platformFetch(`/api/platform/tenants/${id}/thefork`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...tfForm, rotateWebhookToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save TheFork integration.");
      setTheFork(data.integration);
      setWebhookToken(data.webhookToken ?? null);
      setTfForm((p) => ({ ...p, clientSecret: "" }));
      setTfSyncStatus("TheFork API connection validated and credentials saved.");
      toast("TheFork integration saved.");
    } catch (err) {
      setTfSyncStatus(err instanceof Error ? err.message : "Could not save TheFork integration.");
      toast(err instanceof Error ? err.message : "Could not save TheFork integration.", "error");
    } finally {
      setTfBusy(null);
    }
  }

  async function testTheFork() {
    setTfBusy("test");
    try {
      await platformJson(`/api/platform/tenants/${id}/thefork/test`, { method: "POST" });
      toast("TheFork credentials are valid.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "TheFork credential test failed.", "error");
    } finally {
      setTfBusy(null);
    }
  }

  async function syncTheFork() {
    setTfBusy("sync");
    setTfSyncStatus("Manual sync running for today's TheFork updates...");
    try {
      const today = new Date().toISOString().slice(0, 10);
      const d = await platformJsonWithTimeout<{ result: { imported: number; updated: number; skipped: number; errors: number } }>(
        `/api/platform/tenants/${id}/thefork/sync`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate: today, endDate: today, filterBy: "updatedDate" }),
        },
        EXTERNAL_SYNC_CLIENT_TIMEOUT_MS,
      );
      const message = `TheFork sync complete: ${d.result.imported} imported, ${d.result.updated} updated, ${d.result.skipped} skipped, ${d.result.errors} errors.`;
      setTfSyncStatus(message);
      toast(message);
      await loadTheFork();
    } catch (err) {
      setTfSyncStatus(err instanceof Error ? err.message : "TheFork sync failed.");
      toast(err instanceof Error ? err.message : "TheFork sync failed.", "error");
    } finally {
      setTfBusy(null);
    }
  }

  async function firstSyncTheFork() {
    if (!confirm("Run the first TheFork sync now? This imports upcoming TheFork reservations through the tenant booking window without sending tenant popup notifications.")) return;
    setTfBusy("firstSync");
    setTfSyncStatus("First sync running. Importing upcoming TheFork reservations; existing imports will be skipped.");
    try {
      const d = await platformJsonWithTimeout<{
        result: { imported: number; updated: number; skipped: number; errors: number };
        range: { startDate: string; endDate: string };
      }>(
        `/api/platform/tenants/${id}/thefork/sync`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "first" }),
        },
        EXTERNAL_SYNC_CLIENT_TIMEOUT_MS,
      );
      const message = `First sync complete (${d.range.startDate} to ${d.range.endDate}): ${d.result.imported} imported, ${d.result.skipped} already present/skipped, ${d.result.errors} errors.`;
      setTfSyncStatus(message);
      toast(message);
      await loadTheFork();
    } catch (err) {
      setTfSyncStatus(err instanceof Error ? err.message : "TheFork first sync failed.");
      toast(err instanceof Error ? err.message : "TheFork first sync failed.", "error");
    } finally {
      setTfBusy(null);
    }
  }

  async function saveDish() {
    setDishBusy("save");
    setDishSyncStatus("Testing DISH login before saving...");
    try {
      const res = await platformFetch(`/api/platform/tenants/${id}/dish`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dishForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save DISH integration.");
      setDish(data.integration);
      setDishForm((p) => ({ ...p, password: "" }));
      setDishSyncStatus("DISH login validated and credentials saved.");
      toast("DISH integration saved.");
    } catch (err) {
      setDishSyncStatus(err instanceof Error ? err.message : "Could not save DISH integration.");
      toast(err instanceof Error ? err.message : "Could not save DISH integration.", "error");
    } finally {
      setDishBusy(null);
    }
  }

  async function testDish() {
    setDishBusy("test");
    try {
      await platformJson(`/api/platform/tenants/${id}/dish/test`, { method: "POST" });
      toast("DISH login is valid.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "DISH login test failed.", "error");
    } finally {
      setDishBusy(null);
    }
  }

  async function syncDish() {
    setDishBusy("sync");
    setDishSyncStatus("Manual DISH sync running for today...");
    try {
      const today = new Date().toISOString().slice(0, 10);
      const d = await platformJsonWithTimeout<{ result: { imported: number; updated: number; skipped: number; errors: number } }>(
        `/api/platform/tenants/${id}/dish/sync`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate: today, endDate: today }),
        },
        EXTERNAL_SYNC_CLIENT_TIMEOUT_MS,
      );
      const message = `DISH sync complete: ${d.result.imported} imported, ${d.result.updated} updated, ${d.result.skipped} skipped, ${d.result.errors} errors.`;
      setDishSyncStatus(message);
      toast(message);
      await loadDish();
    } catch (err) {
      setDishSyncStatus(err instanceof Error ? err.message : "DISH sync failed.");
      toast(err instanceof Error ? err.message : "DISH sync failed.", "error");
    } finally {
      setDishBusy(null);
    }
  }

  async function syncDishHistory() {
    if (!confirm("Sync DISH reservations from the last 60 days? Existing imports will be skipped and tenant popup notifications will not be sent.")) return;
    setDishBusy("history60");
    setDishSyncStatus("DISH 60-day sync starting in 7-day batches. Existing imports will be skipped.");
    try {
      type DishHistoryBatchResponse = {
        result: { imported: number; updated: number; skipped: number; errors: number };
        range: {
          startDate: string;
          endDate: string;
          totalStartDate?: string;
          totalEndDate?: string;
          nextStartDate?: string;
          complete?: boolean;
        };
      };
      const totals = { imported: 0, updated: 0, skipped: 0, errors: 0 };
      let batchStartDate: string | undefined;
      let complete = false;
      let totalStartDate = "";
      let totalEndDate = "";
      let batches = 0;
      while (!complete) {
        batches += 1;
        const d = await platformJsonWithTimeout<DishHistoryBatchResponse>(
          `/api/platform/tenants/${id}/dish/sync`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "history60", batchStartDate, batchDays: DISH_HISTORY_BATCH_DAYS }),
          },
          EXTERNAL_SYNC_CLIENT_TIMEOUT_MS,
        );
        totals.imported += d.result.imported;
        totals.updated += d.result.updated;
        totals.skipped += d.result.skipped;
        totals.errors += d.result.errors;
        totalStartDate = d.range.totalStartDate ?? (totalStartDate || d.range.startDate);
        totalEndDate = d.range.totalEndDate ?? (totalEndDate || d.range.endDate);
        complete = d.range.complete !== false || !d.range.nextStartDate;
        batchStartDate = d.range.nextStartDate;
        setDishSyncStatus(
          `DISH 60-day sync batch ${batches} complete (${d.range.startDate} to ${d.range.endDate}). Totals: ${totals.imported} imported, ${totals.skipped} skipped, ${totals.errors} errors.`,
        );
      }
      const message = `DISH 60-day sync complete (${totalStartDate} to ${totalEndDate}) in ${batches} batches: ${totals.imported} imported, ${totals.skipped} already present/skipped, ${totals.errors} errors.`;
      setDishSyncStatus(message);
      toast(message);
      await loadDish();
    } catch (err) {
      setDishSyncStatus(err instanceof Error ? err.message : "DISH 60-day sync failed.");
      toast(err instanceof Error ? err.message : "DISH 60-day sync failed.", "error");
    } finally {
      setDishBusy(null);
    }
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{view.name}</h1>
          <p className="text-xs text-on-surface-variant">/{view.slug} · {view.status === "active" ? am.platform.statusActive : am.platform.statusDisabled}</p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 min-[420px]:grid-cols-3 sm:w-auto sm:flex">
          <button
            type="button"
            onClick={impersonateTenant}
            disabled={view.status !== "active"}
            className="text-sm border border-outline-variant/40 rounded-lg px-3 py-1.5 text-on-surface-variant hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {am.platform.tenant.impersonate}
          </button>
          <button onClick={toggleStatus} className="text-sm border border-outline-variant/40 rounded-lg px-3 py-1.5 hover:text-primary">
            {view.status === "active" ? am.platform.tenant.disable : am.platform.tenant.enable}
          </button>
          <button onClick={remove} className="text-sm border border-rose-500/40 text-on-surface rounded-lg px-3 py-1.5 hover:bg-rose-500/10">
            {am.platform.tenant.delete}
          </button>
        </div>
      </div>

      {/* Identity & branding */}
      <section className={card}>
        <h2 className="font-semibold">{am.platform.tenant.identity}</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={am.platform.tenant.displayName} v={f.name} on={(v) => set("name", v)} />
          <Field label={am.platform.tenant.publicUrl} v={f.url} on={(v) => set("url", v)} />
          <Field label={am.platform.tenant.reviewUrl} v={f.reviewUrl} on={(v) => set("reviewUrl", v)} placeholder="https://g.page/r/..." />
          <Field label={am.platform.tenant.contactEmail} v={f.contactEmail} on={(v) => set("contactEmail", v)} />
          <Field label={am.platform.tenant.contactPhone} v={f.contactPhone} on={(v) => set("contactPhone", v)} />
          <Field label={am.platform.tenant.locale} v={f.locale} on={(v) => set("locale", v)} />
          <Field label={am.platform.tenant.timezone} v={f.timezone} on={(v) => set("timezone", v)} />
          <Field label={am.platform.tenant.themePrimary} v={f.themePrimary} on={(v) => set("themePrimary", v)} placeholder="#f2ca50" />
          <Field label={am.platform.tenant.themeOnPrimary} v={f.themeOnPrimary} on={(v) => set("themeOnPrimary", v)} placeholder="#3c2f00" />
          <Field label={am.platform.tenant.logoUrl} v={f.logoUrl} on={(v) => set("logoUrl", v)} placeholder="https://… or /logos/acme.png" />
        </div>
        <div className="flex gap-6 flex-wrap">
          <Check label={am.platform.tenant.autoConfirm} v={f.autoConfirm} on={(v) => set("autoConfirm", v)} />
        </div>
      </section>

      {/* Booking API — public key + CORS allow-list */}
      <section className={card}>
        <h2 className="font-semibold">{am.platform.tenant.bookingApi}</h2>
        <p className="text-xs text-on-surface-variant">
          {am.platform.tenant.bookingApiHint}
        </p>
        <label className="block">
          <span className="text-xs text-on-surface-variant">{am.platform.tenant.publicKey}</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input className={`${field} font-mono`} readOnly value={view.publicKey} onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              onClick={() => { navigator.clipboard?.writeText(view.publicKey); toast(am.platform.tenant.keyCopied); }}
              className="min-h-9 shrink-0 text-sm border border-outline-variant/40 rounded-lg px-3 hover:text-primary"
            >
              {am.platform.tenant.copy}
            </button>
          </div>
        </label>
        <TemplateArea
          label={am.platform.tenant.allowedOrigins}
          v={f.allowedOrigins}
          on={(v) => set("allowedOrigins", v)}
          placeholder={"https://www.osteria-example.com\nhttps://osteria-example.com"}
        />
      </section>

      {/* TheFork one-way sync */}
      <section className={card}>
        <div>
          <h2 className="font-semibold">TheFork one-way sync</h2>
          <p className="text-xs text-on-surface-variant">
            Import TheFork reservations into this tenant so staff can see them and public availability counts their covers. Imported reservations are read-only and do not send local emails.
          </p>
        </div>
        <SyncStatusBanner
          name="TheFork"
          active={Boolean(theFork?.enabled && theFork.clientId && theFork.clientSecretSet && theFork.restaurantUuid)}
          enabled={Boolean(theFork?.enabled)}
          lastSyncAt={theFork?.lastSyncAt}
          lastError={theFork?.lastError}
        />
        <div className="grid sm:grid-cols-2 gap-3">
          <Check
            label="Enable TheFork sync"
            v={tfForm.enabled}
            on={(v) => setTfForm((p) => ({ ...p, enabled: v }))}
          />
          <div className="text-xs text-on-surface-variant self-center">
            Secret saved: {theFork?.clientSecretSet ? "yes" : "no"} · Webhook token: {theFork?.webhookTokenSet ? "set" : "missing"}
          </div>
          <Field label="Client ID" v={tfForm.clientId} on={(v) => setTfForm((p) => ({ ...p, clientId: v }))} />
          <Field
            label={`Client secret${theFork?.clientSecretSet ? " (leave blank to keep current)" : ""}`}
            v={tfForm.clientSecret}
            on={(v) => setTfForm((p) => ({ ...p, clientSecret: v }))}
            placeholder={theFork?.clientSecretSet ? "••••••••" : ""}
          />
          <Field label="Restaurant UUID" v={tfForm.restaurantUuid} on={(v) => setTfForm((p) => ({ ...p, restaurantUuid: v }))} />
          <Field label="Group UUID" v={tfForm.groupUuid} on={(v) => setTfForm((p) => ({ ...p, groupUuid: v }))} />
        </div>
        <label className="block">
          <span className="text-xs text-on-surface-variant">Webhook URL</span>
          <input className={`${field} font-mono`} readOnly value={theFork?.webhookUrl ?? ""} onFocus={(e) => e.currentTarget.select()} />
        </label>
        {webhookToken && (
          <div className="rounded-lg border border-outline-variant/40 bg-surface-container-high p-3 text-xs text-on-surface-variant">
            Copy this token now. It is shown only once:
            <input className={`${field} mt-1 font-mono`} readOnly value={webhookToken} onFocus={(e) => e.currentTarget.select()} />
            Configure TheFork webhook with this URL and header:
            <div className="mt-1 font-mono text-on-surface">Authorization: Bearer {webhookToken}</div>
            <div className="mt-1 text-on-surface-variant">Query token fallback is supported only if TheFork cannot send custom headers.</div>
          </div>
        )}
        <div className="grid sm:grid-cols-3 gap-2 text-xs text-on-surface-variant">
          <div>Last webhook: {formatPlatformDateTime(theFork?.lastWebhookAt)}</div>
          <div>Last sync: {formatPlatformDateTime(theFork?.lastSyncAt)}</div>
          <div className={theFork?.lastError ? "text-error" : ""}>Last error: {theFork?.lastError ?? "none"}</div>
        </div>
        {tfSyncStatus && (
          <div className="rounded-lg border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-xs text-on-surface-variant">
            {tfSyncStatus}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => saveTheFork(false)}
            disabled={!!tfBusy}
            className="bg-primary text-on-primary px-4 py-1.5 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-60"
          >
            {tfBusy === "save" ? "Testing..." : "Save TheFork"}
          </button>
          <button
            type="button"
            onClick={() => saveTheFork(true)}
            disabled={!!tfBusy}
            className="text-sm border border-outline-variant/40 rounded-lg px-3 py-1.5 hover:text-primary disabled:opacity-60"
          >
            Rotate webhook token
          </button>
          <button
            type="button"
            onClick={testTheFork}
            disabled={!!tfBusy || !theFork?.clientSecretSet}
            className="text-sm border border-outline-variant/40 rounded-lg px-3 py-1.5 hover:text-primary disabled:opacity-60"
          >
            {tfBusy === "test" ? "Testing..." : "Test credentials"}
          </button>
          <button
            type="button"
            onClick={syncTheFork}
            disabled={!!tfBusy || !theFork?.enabled}
            className="text-sm border border-outline-variant/40 rounded-lg px-3 py-1.5 hover:text-primary disabled:opacity-60"
          >
            {tfBusy === "sync" ? "Syncing..." : "Sync now"}
          </button>
          <button
            type="button"
            onClick={firstSyncTheFork}
            disabled={!!tfBusy || !theFork?.enabled}
            className="text-sm border border-outline-variant/40 rounded-lg px-3 py-1.5 hover:text-primary disabled:opacity-60"
          >
            {tfBusy === "firstSync" ? "Importing..." : "First sync"}
          </button>
        </div>
      </section>

      {/* DISH one-way sync */}
      <section className={card}>
        <div>
          <h2 className="font-semibold">DISH one-way sync</h2>
          <p className="text-xs text-on-surface-variant">
            Read reservations from DISH using the restaurant manager login. Imported reservations are labeled as external, count against public availability, and stay read-only except local table assignment.
          </p>
        </div>
        <SyncStatusBanner
          name="DISH"
          active={Boolean(dish?.enabled && dish.email && dish.passwordSet && dish.establishmentId)}
          enabled={Boolean(dish?.enabled)}
          lastSyncAt={dish?.lastSyncAt}
          lastError={dish?.lastError}
        />
        <div className="space-y-3">
          <Check
            label="Enable DISH sync"
            v={dishForm.enabled}
            on={(v) => setDishForm((p) => ({ ...p, enabled: v }))}
          />
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="DISH email" v={dishForm.email} on={(v) => setDishForm((p) => ({ ...p, email: v }))} />
            <Field
              label={`DISH password${dish?.passwordSet ? " (leave blank to keep current)" : ""}`}
              v={dishForm.password}
              on={(v) => setDishForm((p) => ({ ...p, password: v }))}
              placeholder={dish?.passwordSet ? "********" : ""}
              type="password"
            />
          </div>
          <Field
            label="DISH establishment id"
            v={dishForm.establishmentId}
            on={(v) => setDishForm((p) => ({ ...p, establishmentId: v }))}
            placeholder="cfa9d0f8-5c36-4f0f-b5f5-481267693e49"
          />
        </div>
        <div className="rounded-lg border border-outline-variant/40 bg-surface-container-high p-3 text-xs text-on-surface-variant">
          DISH does not provide a public reservation API for this account. This integration is read-only and depends on the manager HTML pages staying compatible; saving credentials always tests the login before enabling sync. The establishment id is the `est` value from the DISH Reservation tool URL.
        </div>
        <div className="grid sm:grid-cols-2 gap-2 text-xs text-on-surface-variant">
          <div>Last sync: {formatPlatformDateTime(dish?.lastSyncAt)}</div>
          <div className={dish?.lastError ? "text-error" : ""}>Last error: {dish?.lastError ?? "none"}</div>
        </div>
        {dishSyncStatus && (
          <div className="rounded-lg border border-outline-variant/30 bg-surface-container-high px-3 py-2 text-xs text-on-surface-variant">
            {dishSyncStatus}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={saveDish}
            disabled={!!dishBusy}
            className="bg-primary text-on-primary px-4 py-1.5 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-60"
          >
            {dishBusy === "save" ? "Testing..." : "Save DISH"}
          </button>
          <button
            type="button"
            onClick={testDish}
            disabled={!!dishBusy || !dish?.passwordSet}
            className="text-sm border border-outline-variant/40 rounded-lg px-3 py-1.5 hover:text-primary disabled:opacity-60"
          >
            {dishBusy === "test" ? "Testing..." : "Test login"}
          </button>
          <button
            type="button"
            onClick={syncDish}
            disabled={!!dishBusy || !dish?.enabled}
            className="text-sm border border-outline-variant/40 rounded-lg px-3 py-1.5 hover:text-primary disabled:opacity-60"
          >
            {dishBusy === "sync" ? "Syncing..." : "Sync now"}
          </button>
          <button
            type="button"
            onClick={syncDishHistory}
            disabled={!!dishBusy || !dish?.enabled}
            className="text-sm border border-outline-variant/40 rounded-lg px-3 py-1.5 hover:text-primary disabled:opacity-60"
          >
            {dishBusy === "history60" ? "Syncing 60 days..." : "Sync last 60 days"}
          </button>
        </div>
      </section>

      {/* Email flow */}
      <section className={card}>
        <div>
          <h2 className="font-semibold">{am.platform.tenant.emailFlow}</h2>
          <p className="text-xs text-on-surface-variant">
            {am.platform.tenant.emailFlowHint}
          </p>
        </div>
        <div className="rounded-lg border border-outline-variant/30 bg-surface-container-high/70 p-3 space-y-3">
          <Check
            label={am.platform.tenant.emailEnabled}
            v={f.emailEnabled}
            on={(v) => set("emailEnabled", v)}
          />
          <p className="text-xs text-on-surface-variant">
            {am.platform.tenant.emailEnabledHint}
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-outline-variant/30 bg-surface-container-high/70 p-3 space-y-2">
            <Check
              label={am.platform.tenant.emailBookingConfirmation}
              v={f.emailBookingConfirmation}
              on={(v) => set("emailBookingConfirmation", v)}
              disabled={!f.emailEnabled}
            />
            <p className="text-xs text-on-surface-variant">
              {am.platform.tenant.confirmationHint}
            </p>
          </div>
          <div className="rounded-lg border border-outline-variant/30 bg-surface-container-high/70 p-3 space-y-3">
            <Check
              label={am.platform.tenant.emailFeedbackRequest}
              v={f.emailFeedbackRequest}
              on={(v) => set("emailFeedbackRequest", v)}
              disabled={!f.emailEnabled}
            />
            <label className="block">
              <span className="text-xs text-on-surface-variant">{am.platform.tenant.feedbackDelay}</span>
              <input
                className={field}
                type="number"
                min="1"
                max="720"
                step="1"
                disabled={!f.emailEnabled || !f.emailFeedbackRequest}
                value={f.feedbackRequestDelayHours}
                onChange={(e) => set("feedbackRequestDelayHours", e.target.value)}
                placeholder="0"
              />
            </label>
          </div>
          <div className="rounded-lg border border-outline-variant/30 bg-surface-container-high/70 p-3 space-y-3">
            <Check
              label={am.platform.tenant.emailReservationReminder}
              v={f.emailReservationReminder}
              on={(v) => set("emailReservationReminder", v)}
              disabled={!f.emailEnabled}
            />
            <label className="block">
              <span className="text-xs text-on-surface-variant">{am.platform.tenant.reminderLead}</span>
              <input
                className={field}
                type="number"
                min="1"
                max="720"
                step="1"
                disabled={!f.emailEnabled || !f.emailReservationReminder}
                value={f.reminderLeadHours}
                onChange={(e) => set("reminderLeadHours", e.target.value)}
                placeholder="24"
              />
            </label>
          </div>
          <div className="rounded-lg border border-outline-variant/30 bg-surface-container-high/70 p-3 space-y-2">
            <Check
              label={am.platform.tenant.emailCancellationConfirmation}
              v={f.emailCancellationConfirmation}
              on={(v) => set("emailCancellationConfirmation", v)}
              disabled={!f.emailEnabled}
            />
            <p className="text-xs text-on-surface-variant">
              {am.platform.tenant.cancellationHint}
            </p>
          </div>
        </div>
      </section>

      {/* SMTP */}
      <section className={card}>
        <h2 className="font-semibold">{am.platform.tenant.smtp}</h2>
        <p className="text-xs text-on-surface-variant">Each restaurant sends from its own mail server. Leave host blank to disable email.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={am.platform.tenant.smtpHost} v={f.smtpHost} on={(v) => set("smtpHost", v)} placeholder="smtp.mailgun.org" />
          <Field label={am.platform.tenant.smtpPort} v={f.smtpPort} on={(v) => set("smtpPort", v)} placeholder="587" />
          <Field label={am.platform.tenant.smtpUser} v={f.smtpUser} on={(v) => set("smtpUser", v)} />
          <Field label={am.platform.tenant.smtpFrom} v={f.smtpFrom} on={(v) => set("smtpFrom", v)} placeholder="Acme <book@acme.com>" />
          <label className="block">
            <span className="text-xs text-on-surface-variant">
              {am.platform.tenant.smtpPassword}{view.settings.smtpPassSet ? ` ${am.platform.tenant.smtpPassSet}` : ""}
            </span>
            <input className={field} type="password" value={f.smtpPass} onChange={(e) => set("smtpPass", e.target.value)} placeholder={view.settings.smtpPassSet ? "••••••••" : ""} />
          </label>
          <Check label={am.platform.tenant.smtpSecure} v={f.smtpSecure} on={(v) => set("smtpSecure", v)} />
        </div>
      </section>

      {/* Email templates */}
      <section className={card}>
        <div>
          <h2 className="font-semibold">{am.platform.tenant.emailTemplates}</h2>
          <p className="text-xs text-on-surface-variant mt-1">
            {am.platform.tenant.templatesHint}&nbsp;
            {["guestName","restaurantName","date","time","service","partySize","reference","contactPhone","contactEmail","siteUrl"].map((v) => (
              <code key={v} className="mx-0.5 px-1 py-0.5 rounded bg-surface-container-high text-[10px]">{`{{${v}}}`}</code>
            ))}.
            {am.platform.tenant.feedbackTemplateHint} <code className="mx-0.5 px-1 py-0.5 rounded bg-surface-container-high text-[10px]">{"{{reviewUrl}}"}</code>.
          </p>
          <p className="text-xs text-on-surface-variant mt-1">
            {am.platform.tenant.calendarEventTitleHint}
          </p>
        </div>

        {/* Booking confirmation */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">{am.platform.tenant.bookingConfirmationTpl}</h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[11px] text-on-surface-variant/60 self-center mr-1">{am.platform.tenant.presets}</span>
            {CONFIRMATION_PRESETS.map((p) => (
              <PresetButton key={p.id} preset={p} onLoad={() => loadPreset("confirmation", p)} />
            ))}
          </div>
          <div className="space-y-2">
            <Field label={am.platform.tenant.calendarEventTitle} v={f.calendarEventTitle} on={(v) => set("calendarEventTitle", v)} placeholder="{{restaurantName}} reservation" />
            <Field label={am.platform.tenant.subject} v={f.confirmSubject} on={(v) => set("confirmSubject", v)} placeholder="Your reservation at {{restaurantName}} is confirmed" />
            <TemplateArea label={am.platform.tenant.plainText} v={f.confirmText} on={(v) => set("confirmText", v)} rows={5} placeholder="Hi {{guestName}}, your table for {{partySize}} on {{date}}…" />
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-on-surface-variant">{am.platform.tenant.htmlBody}</span>
                {f.confirmHtml && (
                  <button
                    type="button"
                    onClick={() => setPreviewHtml(renderPreview(f.confirmHtml))}
                    className="text-[11px] text-primary hover:text-primary/70 flex items-center gap-1 transition"
                  >
                    <EyeIcon /> {am.platform.tenant.preview}
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
          <h3 className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant pt-1">{am.platform.tenant.feedbackRequestTpl}</h3>
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[11px] text-on-surface-variant/60 self-center mr-1">{am.platform.tenant.presets}</span>
            {FEEDBACK_PRESETS.map((p) => (
              <PresetButton key={p.id} preset={p} onLoad={() => loadPreset("feedback", p)} />
            ))}
          </div>
          <div className="space-y-2">
            <Field label={am.platform.tenant.subject} v={f.feedbackSubject} on={(v) => set("feedbackSubject", v)} placeholder="How was your visit to {{restaurantName}}?" />
            <TemplateArea label={am.platform.tenant.plainText} v={f.feedbackText} on={(v) => set("feedbackText", v)} rows={5} placeholder="Hi {{guestName}}, thanks for dining with us on {{date}}. Leave a review: {{reviewUrl}}" />
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-on-surface-variant">{am.platform.tenant.htmlBody}</span>
                {f.feedbackHtml && (
                  <button
                    type="button"
                    onClick={() => setPreviewHtml(renderPreview(f.feedbackHtml))}
                    className="text-[11px] text-primary hover:text-primary/70 flex items-center gap-1 transition"
                  >
                    <EyeIcon /> {am.platform.tenant.preview}
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

        {/* Reminder */}
        <div className="space-y-3 pt-2 border-t border-outline-variant/20">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant pt-1">{am.platform.tenant.reminderTpl}</h3>
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[11px] text-on-surface-variant/60 self-center mr-1">{am.platform.tenant.presets}</span>
            {REMINDER_PRESETS.map((p) => (
              <PresetButton key={p.id} preset={p} onLoad={() => loadPreset("reminder", p)} />
            ))}
          </div>
          <div className="space-y-2">
            <Field label={am.platform.tenant.subject} v={f.reminderSubject} on={(v) => set("reminderSubject", v)} placeholder="Reminder: your reservation at {{restaurantName}}" />
            <TemplateArea label={am.platform.tenant.plainText} v={f.reminderText} on={(v) => set("reminderText", v)} rows={5} placeholder="Hi {{guestName}}, this is a reminder for {{date}} at {{time}}. Reference {{reference}}" />
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-on-surface-variant">{am.platform.tenant.htmlBody}</span>
                {f.reminderHtml && (
                  <button
                    type="button"
                    onClick={() => setPreviewHtml(renderPreview(f.reminderHtml))}
                    className="text-[11px] text-primary hover:text-primary/70 flex items-center gap-1 transition"
                  >
                    <EyeIcon /> {am.platform.tenant.preview}
                  </button>
                )}
              </div>
              <textarea
                className={`${field} resize-y font-mono text-xs`}
                rows={6}
                value={f.reminderHtml}
                onChange={(e) => set("reminderHtml", e.target.value)}
                placeholder="<!DOCTYPE html>…"
              />
            </div>
          </div>
        </div>

        {/* Cancellation */}
        <div className="space-y-3 pt-2 border-t border-outline-variant/20">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant pt-1">{am.platform.tenant.cancellationTpl}</h3>
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[11px] text-on-surface-variant/60 self-center mr-1">{am.platform.tenant.presets}</span>
            {CANCELLATION_PRESETS.map((p) => (
              <PresetButton key={p.id} preset={p} onLoad={() => loadPreset("cancellation", p)} />
            ))}
          </div>
          <div className="space-y-2">
            <Field label={am.platform.tenant.subject} v={f.cancellationSubject} on={(v) => set("cancellationSubject", v)} placeholder="Your reservation at {{restaurantName}} has been cancelled" />
            <TemplateArea label={am.platform.tenant.plainText} v={f.cancellationText} on={(v) => set("cancellationText", v)} rows={5} placeholder="Hi {{guestName}}, your reservation {{reference}} has been cancelled." />
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-on-surface-variant">{am.platform.tenant.htmlBody}</span>
                {f.cancellationHtml && (
                  <button
                    type="button"
                    onClick={() => setPreviewHtml(renderPreview(f.cancellationHtml))}
                    className="text-[11px] text-primary hover:text-primary/70 flex items-center gap-1 transition"
                  >
                    <EyeIcon /> {am.platform.tenant.preview}
                  </button>
                )}
              </div>
              <textarea
                className={`${field} resize-y font-mono text-xs`}
                rows={6}
                value={f.cancellationHtml}
                onChange={(e) => set("cancellationHtml", e.target.value)}
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
        {busy ? am.platform.tenant.saving : am.platform.tenant.saveSettings}
      </button>

      {/* Hosts */}
      <section className={card}>
        <h2 className="font-semibold">{am.platform.tenant.hostsSection}</h2>
        <p className="text-xs text-on-surface-variant">{am.platform.tenant.hostsHint}</p>
        <div className="flex flex-wrap gap-2">
          {view.hosts.length === 0 && <span className="text-on-surface-variant text-sm">{am.platform.tenant.noHosts}</span>}
          {view.hosts.map((h) => (
            <span key={h} className="flex items-center gap-2 bg-surface-container-high border border-outline-variant/30 rounded-full pl-3 pr-1 py-1 text-sm">
              {h}
              <button onClick={() => removeHost(h)} className="w-5 h-5 rounded-full hover:bg-rose-500/20 text-rose-400 inline-flex items-center justify-center" aria-label={`Remove ${h}`}>
                <XIcon className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className={field} value={newHost} onChange={(e) => setNewHost(e.target.value)} placeholder="acme.example.com" />
          <button onClick={addHost} className="min-h-9 bg-surface-container-high border border-outline-variant/30 rounded-lg px-3 text-sm hover:border-primary whitespace-nowrap">{am.platform.tenant.addHost}</button>
        </div>
      </section>

      {/* Staff password */}
      <section className={card}>
        <h2 className="font-semibold">{am.platform.tenant.staffLogin}</h2>
        <p className="text-xs text-on-surface-variant">{am.platform.tenant.staffLoginHint(view.slug)}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className={field} type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder={am.platform.tenant.newPassword} />
          <button onClick={setPassword} className="min-h-9 bg-surface-container-high border border-outline-variant/30 rounded-lg px-3 text-sm hover:border-primary whitespace-nowrap">{am.platform.tenant.setPassword}</button>
        </div>
      </section>

      {/* Debug — mock data */}
      <section className={`${card} border-amber-500/30`}>
        <div>
          <h2 className="font-semibold">{am.platform.tenant.debug}</h2>
          <p className="text-xs text-on-surface-variant">
            {am.platform.tenant.debugHint(view.name)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <MockBtn busy={mockBusy} action="all" label={am.platform.tenant.generateAll}
            onClick={() => mockRun("all", am.platform.tenant.generateAll)} primary />
          <MockBtn busy={mockBusy} action="tables" label={am.platform.tenant.mockTables}
            onClick={() => mockRun("tables", am.platform.tenant.mockTables)} />
          <MockBtn busy={mockBusy} action="reservations-today" label={am.platform.tenant.mockToday}
            onClick={() => mockRun("reservations-today", am.platform.tenant.mockToday)} />
          <MockBtn busy={mockBusy} action="reservations-upcoming" label={am.platform.tenant.mockUpcoming}
            onClick={() => mockRun("reservations-upcoming", am.platform.tenant.mockUpcoming)} />
          <MockBtn busy={mockBusy} action="reservations-history" label={am.platform.tenant.mockHistory}
            onClick={() => mockRun("reservations-history", am.platform.tenant.mockHistory)} />
          <MockBtn busy={mockBusy} action="waitlist" label={am.platform.tenant.mockWaitlist}
            onClick={() => mockRun("waitlist", am.platform.tenant.mockWaitlist)} />
          <MockBtn busy={mockBusy} action="customers" label={am.platform.tenant.mockCustomers}
            onClick={() => mockRun("customers", am.platform.tenant.mockCustomers)} />
          <MockBtn busy={mockBusy} action="feedback" label={am.platform.tenant.mockFeedback}
            onClick={() => mockRun("feedback", am.platform.tenant.mockFeedback)} />
        </div>
        <div className="pt-1">
          <button
            disabled={!!mockBusy}
            onClick={() => mockRun("clear", am.platform.tenant.clearData,
              am.platform.tenant.clearConfirm(view.name))}
            className="text-sm border border-rose-500/40 text-on-surface rounded-lg px-3 py-1.5 hover:bg-rose-500/10 disabled:opacity-50"
          >
            {mockBusy === "clear" ? am.platform.tenant.clearing : am.platform.tenant.clearData}
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
      {running ? am.platform.tenant.working : label}
    </button>
  );
}

function Field({ label, v, on, placeholder, type = "text" }: { label: string; v: string; on: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="block">
      <span className="text-xs text-on-surface-variant">{label}</span>
      <input className={field} type={type} value={v} onChange={(e) => on(e.target.value)} placeholder={placeholder} />
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
      <div ref={ref} className="relative mx-3 w-full max-w-2xl overflow-hidden rounded-xl bg-surface-container shadow-2xl sm:mx-4">
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary">
              {am.platform.tenant.previewTitle}
            </span>
            <span className="ml-1 text-[11px] text-on-surface-variant">- {am.platform.tenant.previewSample}</span>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition hover:bg-surface-container-high hover:text-on-surface"
            aria-label={am.platform.tenant.closePreview}
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        <div style={{ background: "#f4f4f4", maxHeight: "72vh", overflow: "auto" }}>
          <iframe
            srcDoc={html}
            title="Email preview"
            style={{ width: "100%", minHeight: 480, border: "none", display: "block" }}
            sandbox=""
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
