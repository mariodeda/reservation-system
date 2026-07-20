"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { am, hydrateLocale, setLocale, type Locale } from "@/i18n";
import SystemLogo from "@/components/SystemLogo";
import Tooltip from "@/components/ui/Tooltip";
import LanguageFlag from "@/components/ui/LanguageFlag";

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
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [locale, setLocaleState] = useState<Locale>("it");

  useEffect(() => {
    const saved = localStorage.getItem("admin-theme");
    if (saved === "light") setTheme("light");
    setLocaleState(hydrateLocale());
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("admin-theme", next);
  }

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
    <main data-admin data-theme={theme} className="relative min-h-screen flex items-center justify-center bg-background px-4">
      {/* Theme + language controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <div className="flex items-center rounded-lg border border-outline-variant/40 overflow-hidden">
          {(["it", "en"] as Locale[]).map((l) => (
            <Tooltip key={l} content={l === "it" ? "Italiano" : "English"}>
            <button
              onClick={() => { if (locale !== l) setLocale(l); }}
              aria-label={l === "it" ? "Italiano" : "English"}
              className={`px-2 py-1 text-sm leading-none transition ${
                locale === l
                  ? "bg-primary/15 text-primary font-medium"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
              }`}
            >
              <LanguageFlag locale={l} />
            </button>
            </Tooltip>
          ))}
        </div>
        <Tooltip content={theme === "dark" ? am.theme.toggleLight : am.theme.toggleDark}>
          <button
            onClick={toggleTheme}
            aria-label={theme === "dark" ? am.theme.toggleLight : am.theme.toggleDark}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition"
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
        </Tooltip>
      </div>

      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-surface-container rounded-xl border border-outline-variant/30 p-8 shadow-2xl space-y-5"
      >
        <div className="text-center mb-2">
          {logoUrl ? (
            <span className="mx-auto inline-flex min-h-16 max-w-[260px] items-center rounded-xl border border-white/20 bg-neutral-950/75 px-4 py-2 shadow-md ring-1 ring-black/10 backdrop-blur-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt={brandName} className="h-12 w-auto max-w-[220px] object-contain" />
            </span>
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

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <circle cx="10" cy="10" r="3.5" />
      <line x1="10" y1="1.5" x2="10" y2="3" />
      <line x1="10" y1="17" x2="10" y2="18.5" />
      <line x1="1.5" y1="10" x2="3" y2="10" />
      <line x1="17" y1="10" x2="18.5" y2="10" />
      <line x1="3.6" y1="3.6" x2="4.7" y2="4.7" />
      <line x1="15.3" y1="15.3" x2="16.4" y2="16.4" />
      <line x1="3.6" y1="16.4" x2="4.7" y2="15.3" />
      <line x1="15.3" y1="4.7" x2="16.4" y2="3.6" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.5 12.5A7.5 7.5 0 117.5 2.5a5.5 5.5 0 0010 10z" />
    </svg>
  );
}
