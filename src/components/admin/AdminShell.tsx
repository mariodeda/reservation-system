"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { am, hydrateLocale, setLocale, type Locale } from "@/i18n";
import SystemLogo from "@/components/SystemLogo";
import { useReservationEvents } from "./useReservationEvents";
import { NotificationBell, ReservationToastStack } from "./NotificationBell";

export default function AdminShell({
  slug,
  brandName,
  logoUrl,
  children,
}: {
  slug: string;
  brandName: string;
  logoUrl?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/admin/${slug}`;
  const nav = [
    { seg: "", label: am.nav.dashboard },
    { seg: "/reservations", label: am.nav.reservations },
    { seg: "/customers", label: am.nav.customers },
    { seg: "/tables", label: am.nav.tables },
    { seg: "/analytics", label: am.nav.analytics },
    { seg: "/email-logs", label: "Email logs" },
    { seg: "/availability", label: am.nav.availability },
    { seg: "/settings", label: am.nav.settings },
  ].map((n) => ({ href: `${base}${n.seg}`, label: n.label, isHome: n.seg === "" }));
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [locale, setLocaleState] = useState<Locale>("it");
  const { notifications, unreadCount, connected, markAllRead, markRead } = useReservationEvents();
  const [toasts, setToasts] = useState<typeof notifications>([]);

  // Each new notification pops a toast
  useEffect(() => {
    const newest = notifications[0];
    if (newest && !newest.read) {
      setToasts((prev) => {
        if (prev.some((t) => t.id === newest.id)) return prev;
        return [newest, ...prev].slice(0, 4);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications[0]?.id]);

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

  function handleMarkAllRead() {
    markAllRead();
    setToasts([]);
  }

  function handleMarkRead(notificationId: string) {
    markRead(notificationId);
    setToasts((prev) => prev.filter((t) => t.notificationId !== notificationId));
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace(`${base}/login`);
    router.refresh();
  }

  return (
    <div data-admin data-theme={theme} className="min-h-screen bg-background text-on-surface">
      <header className="sticky top-0 z-30 bg-surface-container/95 backdrop-blur border-b border-outline-variant/30">
        <div className="px-4 lg:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 lg:gap-5 min-w-0">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={brandName} className="h-7 w-auto max-w-[160px] object-contain shrink-0" />
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <SystemLogo className="h-7 w-7 text-primary shrink-0" />
                <span className="font-display-lg text-[16px] text-primary uppercase tracking-tighter truncate hidden xl:inline max-w-[240px]">
                  {brandName}
                </span>
              </div>
            )}
            <nav className="hidden sm:flex items-center gap-1">
              {nav.map((n) => {
                const active = n.isHome ? pathname === n.href : pathname.startsWith(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={`px-3 py-1.5 rounded-lg text-sm transition ${
                      active
                        ? "bg-primary/15 text-primary"
                        : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                    }`}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <NotificationBell
              notifications={notifications}
              unreadCount={unreadCount}
              connected={connected}
              slug={slug}
              onMarkAllRead={handleMarkAllRead}
              onMarkRead={handleMarkRead}
            />
            <button
              onClick={toggleTheme}
              title={theme === "dark" ? am.theme.toggleLight : am.theme.toggleDark}
              aria-label={theme === "dark" ? am.theme.toggleLight : am.theme.toggleDark}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition"
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
            <div className="flex items-center rounded-lg border border-outline-variant/40 overflow-hidden">
              {(["it", "en"] as Locale[]).map((l) => (
                <button
                  key={l}
                  onClick={() => { if (locale !== l) setLocale(l); }}
                  title={l === "it" ? "Italiano" : "English"}
                  aria-label={l === "it" ? "Italiano" : "English"}
                  className={`px-2 py-1 text-sm leading-none transition ${
                    locale === l
                      ? "bg-primary/15 text-primary font-medium"
                      : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                  }`}
                >
                  {l === "it" ? "🇮🇹" : "🇬🇧"}
                </button>
              ))}
            </div>
            <button
              onClick={logout}
              className="text-sm text-on-surface-variant hover:text-primary border border-outline-variant/40 rounded-lg px-3 py-1.5 transition whitespace-nowrap"
            >
              {am.nav.signOut}
            </button>
          </div>
        </div>
        {/* mobile nav — horizontally scrollable; right fade hints there are more items */}
        <div className="sm:hidden relative">
          <nav className="flex items-center gap-1 px-4 pb-2 overflow-x-auto scrollbar-none" style={{ WebkitOverflowScrolling: "touch" }}>
            {nav.map((n) => {
              const active = n.isHome ? pathname === n.href : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`shrink-0 px-3 py-2 rounded-lg text-sm transition min-h-[36px] flex items-center ${
                    active ? "bg-primary/15 text-primary" : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          {/* fade hint — masked by the header bg so it's subtle */}
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-surface-container/95 to-transparent" aria-hidden="true" />
        </div>
      </header>
      <main className="px-6 py-6">{children}</main>
      <ReservationToastStack
        toasts={toasts}
        slug={slug}
        onDismiss={handleMarkRead}
      />
    </div>
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
