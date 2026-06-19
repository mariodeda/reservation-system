"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/platform";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/platform/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Login failed.");
        setBusy(false);
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main data-admin className="min-h-screen flex items-center justify-center bg-background px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-surface-container rounded-xl border border-outline-variant/30 p-8 shadow-2xl space-y-5"
      >
        <div className="text-center mb-2">
          <div className="font-display-lg text-[22px] text-primary uppercase tracking-tighter">
            Reservations Platform
          </div>
          <p className="text-on-surface-variant text-sm mt-1">Operator sign in</p>
        </div>

        <label className="block">
          <span className="text-xs uppercase tracking-widest text-on-surface-variant">Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            className="mt-1 w-full bg-surface-container-high border border-outline-variant/30 rounded-lg p-3 text-on-surface focus:border-primary outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-on-surface-variant">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="mt-1 w-full bg-surface-container-high border border-outline-variant/30 rounded-lg p-3 text-on-surface focus:border-primary outline-none"
          />
        </label>

        {error && (
          <p className="text-sm text-error bg-error/10 border border-error/30 rounded-lg px-3 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-primary text-on-primary font-label-lg text-label-lg py-3 rounded-lg hover:brightness-110 transition disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

export default function PlatformLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
