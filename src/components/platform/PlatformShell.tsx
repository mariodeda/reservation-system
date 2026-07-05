"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import SystemLogo from "@/components/SystemLogo";
import { am, hydrateLocale, setLocale, type Locale } from "@/i18n";
import Tooltip from "@/components/ui/Tooltip";
import LanguageFlag from "@/components/ui/LanguageFlag";

export default function PlatformShell({
  username,
  children,
}: {
  username: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const currentPath = normalizePath(pathname);
  const fullWidth = pathname?.startsWith("/platform/logs") || pathname?.startsWith("/platform/cron-runs") || pathname?.startsWith("/platform/email-logs") || pathname?.startsWith("/platform/docs") || false;
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
        <div className={`${fullWidth ? "w-full px-3 sm:px-6 lg:px-8" : "max-w-5xl mx-auto px-3 sm:px-4"} h-14 flex items-center justify-between gap-2 sm:gap-4`}>
          <div className="flex items-center gap-4 md:gap-6 min-w-0">
            <Link href="/platform" className="flex items-center gap-2 text-primary">
              <SystemLogo className="h-7 w-7" />
              <span className="font-display-lg text-[16px] uppercase tracking-tighter truncate hidden sm:inline">
                Reservations Platform
              </span>
            </Link>
            <nav className="hidden md:flex items-center gap-1 text-sm" aria-label="Platform">
              <NavLink href="/platform" active={isPlatformRestaurantsActive(currentPath)}>Restaurants</NavLink>
              <NavLink href="/platform/logs" active={isActivePath(currentPath, "/platform/logs")}>Logs</NavLink>
              <NavLink href="/platform/cron-runs" active={isActivePath(currentPath, "/platform/cron-runs")}>Cron jobs</NavLink>
              <NavLink href="/platform/email-logs" active={isActivePath(currentPath, "/platform/email-logs")}>Email logs</NavLink>
              <NavLink href="/platform/docs" active={isActivePath(currentPath, "/platform/docs")}>Docs</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
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
                  <LanguageFlag locale={l} />
                </button>
                </Tooltip>
              ))}
            </div>
            <button
              onClick={logout}
              className="text-xs sm:text-sm text-on-surface-variant hover:text-primary border border-outline-variant/40 rounded-lg px-2 sm:px-3 py-1.5 transition"
            >
              {am.nav.signOut}
            </button>
          </div>
        </div>
        <div className="md:hidden relative">
          <nav className={`${fullWidth ? "px-3" : "px-3 sm:px-4"} flex items-center gap-1 pb-2 overflow-x-auto scrollbar-none`} aria-label="Platform" style={{ WebkitOverflowScrolling: "touch" }}>
            <MobileNavLink href="/platform" active={isPlatformRestaurantsActive(currentPath)}>Restaurants</MobileNavLink>
            <MobileNavLink href="/platform/logs" active={isActivePath(currentPath, "/platform/logs")}>Logs</MobileNavLink>
            <MobileNavLink href="/platform/cron-runs" active={isActivePath(currentPath, "/platform/cron-runs")}>Cron jobs</MobileNavLink>
            <MobileNavLink href="/platform/email-logs" active={isActivePath(currentPath, "/platform/email-logs")}>Email logs</MobileNavLink>
            <MobileNavLink href="/platform/docs" active={isActivePath(currentPath, "/platform/docs")}>Docs</MobileNavLink>
          </nav>
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-surface-container/95 to-transparent" aria-hidden="true" />
        </div>
      </header>
      <main className={fullWidth ? "w-full px-3 py-4 sm:px-6 sm:py-6 lg:px-8" : "max-w-5xl mx-auto px-3 py-4 sm:px-4 sm:py-6"}>{children}</main>
    </div>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-lg px-3 py-1.5 font-medium transition ${
        active
          ? "bg-primary text-on-primary shadow-sm"
          : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
      }`}
    >
      {children}
    </Link>
  );
}

function MobileNavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition min-h-[36px] flex items-center ${
        active
          ? "bg-primary text-on-primary shadow-sm"
          : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
      }`}
    >
      {children}
    </Link>
  );
}

function normalizePath(pathname: string | null): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

function isActivePath(pathname: string, href: string): boolean {
  const normalizedHref = normalizePath(href);
  return pathname === normalizedHref || pathname.startsWith(`${normalizedHref}/`);
}

function isPlatformRestaurantsActive(pathname: string): boolean {
  if (pathname === "/platform") return true;
  return isActivePath(pathname, "/platform/tenants");
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
