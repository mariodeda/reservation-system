"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { brand } from "@/reservation.config";
import { am } from "@/i18n/admin";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/admin";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || am.login.loginFailed);
        setBusy(false);
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError(am.login.networkError);
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
            {brand.name}
          </div>
          <p className="text-on-surface-variant text-sm mt-1">{am.login.staffSignIn}</p>
        </div>

        <label className="block">
          <span className="text-xs uppercase tracking-widest text-on-surface-variant">{am.login.username}</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            className="mt-1 w-full bg-surface-container-high border border-outline-variant/30 rounded-lg p-3 text-on-surface focus:border-primary outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-on-surface-variant">{am.login.password}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="mt-1 w-full bg-surface-container-high border border-outline-variant/30 rounded-lg p-3 text-on-surface focus:border-primary outline-none"
          />
        </label>

        {error && (
          <p className="text-sm text-error bg-error/10 border border-error/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-primary text-on-primary font-label-lg text-label-lg py-3 rounded-lg hover:brightness-110 transition disabled:opacity-60"
        >
          {busy ? am.login.signingIn : am.login.signIn}
        </button>
      </form>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
