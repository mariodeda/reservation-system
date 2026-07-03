"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import SystemLogo from "@/components/SystemLogo";
import { am, hydrateLocale, setLocale, type Locale } from "@/i18n";
import Tooltip from "@/components/ui/Tooltip";

export default function PlatformShell({
  username,
  children,
}: {
  username: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const fullWidth = pathname?.startsWith("/platform/logs") || pathname?.startsWith("/platform/email-logs") || pathname?.startsWith("/platform/docs") || false;
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

  async function logout() {
    await fetch("/api/platform/logout", { method: "POST" });
    router.replace("/platform/login");
    router.refresh();
  }

  return (
    <div data-admin data-theme={theme} className="min-h-screen bg-background text-on-surface">
      <header className="sticky top-0 z-30 bg-surface-container/95 backdrop-blur border-b border-outline-variant/30">
        <div className={`${fullWidth ? "w-full px-4 sm:px-6 lg:px-8" : "max-w-5xl mx-auto px-4"} h-14 flex items-center justify-between gap-4`}>
          <div className="flex items-center gap-6 min-w-0">
            <Link href="/platform" className="flex items-center gap-2 text-primary">
              <SystemLogo className="h-7 w-7" />
              <span className="font-display-lg text-[16px] uppercase tracking-tighter truncate hidden sm:inline">
                Reservations Platform
              </span>
            </Link>
            <nav className="hidden md:flex items-center gap-1 text-sm" aria-label="Platform">
              <NavLink href="/platform" active={pathname === "/platform"}>Restaurants</NavLink>
              <NavLink href="/platform/logs" active={pathname?.startsWith("/platform/logs") ?? false}>Logs</NavLink>
              <NavLink href="/platform/email-logs" active={pathname?.startsWith("/platform/email-logs") ?? false}>Email logs</NavLink>
              <NavLink href="/platform/docs" active={pathname?.startsWith("/platform/docs") ?? false}>Docs</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-on-surface-variant hidden sm:inline mr-1">{username}</span>
            <Tooltip content={theme === "dark" ? am.theme.toggleLight : am.theme.toggleDark}>
              <button
                onClick={toggleTheme}
                aria-label={theme === "dark" ? am.theme.toggleLight : am.theme.toggleDark}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition"
              >
                {theme === "dark" ? <SunIcon /> : <MoonIcon />}
              </button>
            </Tooltip>
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
                  {l === "it" ? "🇮🇹" : "🇬🇧"}
                </button>
                </Tooltip>
              ))}
            </div>
            <button
              onClick={logout}
              className="text-sm text-on-surface-variant hover:text-primary border border-outline-variant/40 rounded-lg px-3 py-1.5 transition"
            >
              {am.nav.signOut}
            </button>
          </div>
        </div>
      </header>
      <main className={fullWidth ? "w-full px-4 py-6 sm:px-6 lg:px-8" : "max-w-5xl mx-auto px-4 py-6"}>{children}</main>
    </div>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-3 py-1.5 transition ${
        active
          ? "bg-primary/15 text-primary"
          : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
      }`}
    >
      {children}
    </Link>
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
