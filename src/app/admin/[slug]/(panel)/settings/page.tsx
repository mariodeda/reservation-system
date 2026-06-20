"use client";

import { useState } from "react";
import { adminJson, toast } from "@/components/admin/api";
import { am } from "@/i18n/admin";

const field =
  "w-full bg-surface-container-high border border-outline-variant/30 rounded-lg px-3 py-2 text-sm focus:border-primary outline-none";

export default function SettingsPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <div className="space-y-6 max-w-md">
      <h1 className="text-2xl font-semibold">{am.settings.title}</h1>

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
