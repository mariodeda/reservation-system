"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { am } from "@/i18n";
import SystemLogo from "@/components/SystemLogo";

function Inner({
  slug,
  brandName,
  logoUrl,
  themePrimary,
}: {
  slug: string;
  brandName: string;
  logoUrl?: string;
  themePrimary?: string;
}) {
  const router = useRouter();
  const home = `/admin/${slug}`;
  // Only honor a `next` that stays within THIS tenant's admin — no open redirect.
  const rawNext = useSearchParams().get("next") || "";
  const next = rawNext.startsWith(`${home}/`) || rawNext === home ? rawNext : home;
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
        body: JSON.stringify({ slug, username, password }),
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
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={brandName} className="mx-auto h-12 w-auto max-w-[220px] object-contain" />
          ) : (
            <div style={themePrimary ? { color: themePrimary } : undefined}>
              <SystemLogo className="mx-auto h-14 w-14 text-primary" />
              <div className="font-display-lg text-[18px] text-primary uppercase tracking-tighter mt-2">
                {brandName}
              </div>
            </div>
          )}
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

export default function LoginForm(props: {
  slug: string;
  brandName: string;
  logoUrl?: string;
  themePrimary?: string;
}) {
  return (
    <Suspense>
      <Inner {...props} />
    </Suspense>
  );
}
