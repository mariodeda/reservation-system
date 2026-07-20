"use client";

import { useEffect, useState } from "react";
import { adminJson, toast } from "@/components/admin/api";
import { am } from "@/i18n";

const field =
  "w-full bg-surface-container-high border border-outline-variant/30 rounded-lg px-3 py-2 text-sm focus:border-primary outline-none";

export default function SettingsPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailLoading, setEmailLoading] = useState(true);
  const [capacitySaving, setCapacitySaving] = useState(false);
  const [capacityLoading, setCapacityLoading] = useState(true);
  const [capacityMode, setCapacityMode] = useState<"tables" | "manual">("tables");
  const [feedbackRequestsEnabled, setFeedbackRequestsEnabled] = useState(false);
  const [feedbackAutoSendEnabled, setFeedbackAutoSendEnabled] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    adminJson<{ feedbackRequestsEnabled: boolean; feedbackAutoSendEnabled: boolean }>("/api/admin/settings/email")
      .then((data) => {
        setFeedbackRequestsEnabled(data.feedbackRequestsEnabled);
        setFeedbackAutoSendEnabled(data.feedbackAutoSendEnabled);
      })
      .catch(() => {})
      .finally(() => setEmailLoading(false));
    adminJson<{ capacityMode: "tables" | "manual" }>("/api/admin/settings/capacity")
      .then((data) => setCapacityMode(data.capacityMode))
      .catch(() => {})
      .finally(() => setCapacityLoading(false));
  }, []);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next.length < 8) { setError(am.settings.passwordTooShort); return; }
    if (next !== confirm) { setError(am.settings.passwordMismatch); return; }
    setSaving(true);
    try {
      await adminJson("/api/admin/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      toast(am.settings.passwordUpdated);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : am.settings.passwordError);
    } finally {
      setSaving(false);
    }
  }

  async function saveFeedbackAutoSend(enabled: boolean) {
    const previous = feedbackAutoSendEnabled;
    setFeedbackAutoSendEnabled(enabled);
    setEmailSaving(true);
    try {
      const data = await adminJson<{ feedbackRequestsEnabled: boolean; feedbackAutoSendEnabled: boolean }>("/api/admin/settings/email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackAutoSendEnabled: enabled }),
      });
      setFeedbackRequestsEnabled(data.feedbackRequestsEnabled);
      setFeedbackAutoSendEnabled(data.feedbackAutoSendEnabled);
      toast(am.settings.emailPreferencesSaved);
    } catch (err) {
      setFeedbackAutoSendEnabled(previous);
      toast(err instanceof Error ? err.message : am.settings.emailPreferencesError, "error");
    } finally {
      setEmailSaving(false);
    }
  }

  async function saveCapacityMode(mode: "tables" | "manual") {
    const previous = capacityMode;
    setCapacityMode(mode);
    setCapacitySaving(true);
    try {
      const data = await adminJson<{ capacityMode: "tables" | "manual" }>("/api/admin/settings/capacity", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capacityMode: mode }),
      });
      setCapacityMode(data.capacityMode);
      toast(am.settings.capacityPreferencesSaved);
    } catch (err) {
      setCapacityMode(previous);
      toast(err instanceof Error ? err.message : am.settings.capacityPreferencesError, "error");
    } finally {
      setCapacitySaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">{am.settings.title}</h1>

      <section className="rounded-xl border border-outline-variant/30 bg-surface-container p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-on-surface-variant">
            {am.settings.capacityPreferences}
          </h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            {capacityMode === "manual" ? am.settings.capacityManualHint : am.settings.capacityTablesHint}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={`rounded-lg border px-3 py-3 transition ${capacityMode === "tables" ? "border-primary/45 bg-primary/10" : "border-outline-variant/30 bg-surface-container-high"}`}>
            <span className="flex items-start gap-3">
              <input
                type="radio"
                name="capacity-mode"
                value="tables"
                checked={capacityMode === "tables"}
                disabled={capacityLoading || capacitySaving}
                onChange={() => void saveCapacityMode("tables")}
                className="mt-1 h-4 w-4 accent-primary disabled:cursor-not-allowed"
              />
              <span>
                <span className="block text-sm font-semibold text-on-surface">{am.settings.capacityModeTables}</span>
                <span className="mt-0.5 block text-xs text-on-surface-variant">{am.settings.capacityModeTablesDescription}</span>
              </span>
            </span>
          </label>
          <label className={`rounded-lg border px-3 py-3 transition ${capacityMode === "manual" ? "border-primary/45 bg-primary/10" : "border-outline-variant/30 bg-surface-container-high"}`}>
            <span className="flex items-start gap-3">
              <input
                type="radio"
                name="capacity-mode"
                value="manual"
                checked={capacityMode === "manual"}
                disabled={capacityLoading || capacitySaving}
                onChange={() => void saveCapacityMode("manual")}
                className="mt-1 h-4 w-4 accent-primary disabled:cursor-not-allowed"
              />
              <span>
                <span className="block text-sm font-semibold text-on-surface">{am.settings.capacityModeManual}</span>
                <span className="mt-0.5 block text-xs text-on-surface-variant">{am.settings.capacityModeManualDescription}</span>
              </span>
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-outline-variant/30 bg-surface-container p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-on-surface-variant">
            {am.settings.emailPreferences}
          </h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            {feedbackRequestsEnabled
              ? am.settings.feedbackAutoSendHint
              : am.settings.feedbackAutoSendDisabledHint}
          </p>
        </div>
        <label className={`flex items-center justify-between gap-4 rounded-lg border border-outline-variant/30 bg-surface-container-high px-3 py-3 ${!feedbackRequestsEnabled ? "opacity-60" : ""}`}>
          <span>
            <span className="block text-sm font-semibold text-on-surface">{am.settings.feedbackAutoSend}</span>
            <span className="mt-0.5 block text-xs text-on-surface-variant">{am.settings.feedbackAutoSendDescription}</span>
          </span>
          <input
            type="checkbox"
            checked={feedbackAutoSendEnabled}
            disabled={emailLoading || emailSaving || !feedbackRequestsEnabled}
            onChange={(event) => void saveFeedbackAutoSend(event.target.checked)}
            className="h-5 w-5 accent-primary disabled:cursor-not-allowed"
          />
        </label>
      </section>

      <section className="rounded-xl border border-outline-variant/30 bg-surface-container p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-on-surface-variant">
          {am.settings.changePassword}
        </h2>
        <form onSubmit={changePassword} className="space-y-3">
          <div>
            <label className="text-xs text-on-surface-variant block mb-1">{am.settings.currentPassword}</label>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
              className={field}
            />
          </div>
          <div>
            <label className="text-xs text-on-surface-variant block mb-1">{am.settings.newPassword}</label>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              className={field}
            />
          </div>
          <div>
            <label className="text-xs text-on-surface-variant block mb-1">{am.settings.confirmPassword}</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
              className={field}
            />
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="bg-primary text-on-primary px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-60"
          >
            {saving ? am.settings.saving : am.settings.updatePassword}
          </button>
        </form>
      </section>
    </div>
  );
}
