"use client";

import { useState } from "react";
import { adminJson, toast } from "@/components/admin/api";

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
    if (next.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (next !== confirm) { setError("Passwords do not match."); return; }
    setSaving(true);
    try {
      await adminJson("/api/admin/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      toast("Password updated successfully.");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-md">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="rounded-xl border border-outline-variant/30 bg-surface-container p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-on-surface-variant">
          Change password
        </h2>
        <form onSubmit={changePassword} className="space-y-3">
          <div>
            <label className="text-xs text-on-surface-variant block mb-1">Current password</label>
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
            <label className="text-xs text-on-surface-variant block mb-1">New password</label>
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
            <label className="text-xs text-on-surface-variant block mb-1">Confirm new password</label>
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
            {saving ? "Saving…" : "Update password"}
          </button>
        </form>
      </section>
    </div>
  );
}
