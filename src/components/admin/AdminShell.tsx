"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { am, hydrateLocale, setLocale, type Locale } from "@/i18n";
import SystemLogo from "@/components/SystemLogo";
import { useReservationEvents } from "./useReservationEvents";
import { NotificationBell, ReservationToastStack } from "./NotificationBell";
import TodayBookingControls from "./TodayBookingControls";
import Tooltip from "@/components/ui/Tooltip";
import LanguageFlag from "@/components/ui/LanguageFlag";

export default function AdminShell({
  slug,
  brandName,
  logoUrl,
  impersonation,
  children,
}: {
  slug: string;
  brandName: string;
  logoUrl?: string;
  impersonation?: { operator: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/admin/${slug}`;
  const currentPath = normalizePath(pathname);
  const navBeforeClientStats = [
    { seg: "/reservations", label: am.nav.reservations },
    { seg: "/tables", label: am.nav.tables },
    { seg: "/availability", label: am.nav.availability },
  ].map((n) => ({ href: `${base}${n.seg}`, label: n.label, isHome: n.seg === "" }));
  const clientStatsSections = [
    { href: `${base}/customers`, label: am.nav.customers },
    { href: `${base}/analytics`, label: am.nav.analytics },
  ];
  const clientStatsActive = clientStatsSections.some((s) => isActivePath(currentPath, s.href));
  const clientStatsValue = clientStatsActive ? clientStatsSections.find((s) => isActivePath(currentPath, s.href))?.href : "";
  const settingsHref = `${base}/settings`;
  const settingsActive = isActivePath(currentPath, settingsHref);
  const docsHref = `${base}/docs`;
  const docsActive = isActivePath(currentPath, docsHref);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [locale, setLocaleState] = useState<Locale>("it");
  const [clientStatsOpen, setClientStatsOpen] = useState(false);
  const [tenantMenuOpen, setTenantMenuOpen] = useState(false);
  const clientStatsRef = useRef<HTMLDetailsElement>(null);
  const tenantMenuRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!clientStatsOpen) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!clientStatsRef.current?.contains(event.target as Node)) {
        setClientStatsOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [clientStatsOpen]);

  useEffect(() => {
    if (!tenantMenuOpen) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!tenantMenuRef.current?.contains(event.target as Node)) {
        setTenantMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [tenantMenuOpen]);

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

  async function exitImpersonation() {
    await fetch("/api/admin/impersonation", { method: "DELETE" });
    router.replace("/platform");
    router.refresh();
  }

  return (
    <div data-admin data-theme={theme} className="min-h-screen bg-background text-on-surface">
      <header className="sticky top-0 z-30 bg-surface-container/95 backdrop-blur border-b border-outline-variant/30">
        <div className="px-4 lg:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 lg:gap-5 min-w-0">
            <Tooltip content={am.nav.dashboard}>
            <Link
              href={base}
              aria-label={am.nav.dashboard}
              className="shrink-0 min-w-0 flex items-center hover:opacity-80 transition"
            >
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
            </Link>
            </Tooltip>
            <nav className="hidden sm:flex items-center gap-1">
              {navBeforeClientStats.map((n) => {
                const active = n.isHome ? currentPath === normalizePath(n.href) : isActivePath(currentPath, n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    aria-current={active ? "page" : undefined}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      active
                        ? "bg-primary text-on-primary shadow-sm"
                        : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                    }`}
                  >
                    {n.label}
                  </Link>
                );
              })}
              <details ref={clientStatsRef} open={clientStatsOpen} className="relative group">
                <summary
                  onClick={(event) => {
                    event.preventDefault();
                    setClientStatsOpen((open) => !open);
                  }}
                  className={`list-none cursor-pointer select-none px-3 py-1.5 rounded-lg text-sm transition flex items-center gap-1.5 [&::-webkit-details-marker]:hidden ${
                    clientStatsActive
                      ? "bg-primary text-on-primary shadow-sm"
                      : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                  }`}
                  aria-current={clientStatsActive ? "page" : undefined}
                >
                  {am.nav.clientsAndStatistics}
                  <ChevronDownIcon />
                </summary>
                <div className="absolute left-0 top-full mt-2 min-w-48 rounded-lg border border-outline-variant/40 bg-surface-container shadow-xl p-1 z-50">
                  {clientStatsSections.map((section) => {
                    const active = isActivePath(currentPath, section.href);
                    return (
                      <Link
                        key={section.href}
                        href={section.href}
                        onClick={() => setClientStatsOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={`block px-3 py-2 rounded-md text-sm font-medium transition ${
                          active
                            ? "bg-primary text-on-primary shadow-sm"
                            : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                        }`}
                      >
                        {section.label}
                      </Link>
                    );
                  })}
                </div>
              </details>
            </nav>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <TodayBookingControls />
            <NotificationBell
              notifications={notifications}
              unreadCount={unreadCount}
              connected={connected}
              slug={slug}
              onMarkAllRead={handleMarkAllRead}
              onMarkRead={handleMarkRead}
            />
            <Tooltip content={theme === "dark" ? am.theme.toggleLight : am.theme.toggleDark}>
              <button
                onClick={toggleTheme}
                aria-label={theme === "dark" ? am.theme.toggleLight : am.theme.toggleDark}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition"
              >
                {theme === "dark" ? <SunIcon /> : <MoonIcon />}
              </button>
            </Tooltip>
            <div ref={tenantMenuRef} className="relative">
              <Tooltip content={am.nav.settings}>
                <button
                  type="button"
                  onClick={() => setTenantMenuOpen((open) => !open)}
                  aria-label={am.nav.settings}
                  aria-expanded={tenantMenuOpen}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg transition ${
                    settingsActive || tenantMenuOpen
                      ? "bg-primary text-on-primary shadow-sm"
                      : "text-on-surface-variant hover:text-primary hover:bg-surface-container-high"
                  }`}
                >
                  <GearIcon />
                </button>
              </Tooltip>
              {tenantMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-outline-variant/40 bg-surface-container shadow-2xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-outline-variant/20">
                    <div className="text-xs uppercase tracking-widest text-on-surface-variant/70">Restaurant</div>
                    <div className="mt-1 text-sm font-semibold text-on-surface truncate">{brandName}</div>
                    <div className="mt-0.5 text-xs text-on-surface-variant truncate">/{slug}</div>
                    {impersonation && (
                      <div className="mt-2 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-200">
                        Platform support session
                      </div>
                    )}
                  </div>
                  <div className="p-1.5">
                    <Link
                      href={settingsHref}
                      onClick={() => setTenantMenuOpen(false)}
                      aria-current={settingsActive ? "page" : undefined}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                        settingsActive
                          ? "bg-primary text-on-primary shadow-sm"
                          : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                      }`}
                    >
                      <GearIcon />
                      <span>{am.nav.settings}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setTenantMenuOpen(false);
                        void logout();
                      }}
                      className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-on-surface-variant transition hover:bg-surface-container-high hover:text-primary"
                    >
                      <SignOutIcon />
                      <span>{am.nav.signOut}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
            <Tooltip content={am.nav.docs}>
              <Link
                href={docsHref}
                aria-label={am.nav.docs}
                aria-current={docsActive ? "page" : undefined}
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition ${
                  docsActive
                    ? "bg-primary text-on-primary shadow-sm"
                    : "text-on-surface-variant hover:text-primary hover:bg-surface-container-high"
                }`}
              >
                <QuestionIcon />
              </Link>
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
          </div>
        </div>
        {/* mobile nav — horizontally scrollable; right fade hints there are more items */}
        {impersonation && (
          <div className="border-t border-amber-500/20 bg-amber-500/10 px-4 py-2 lg:px-6">
            <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="text-amber-200">
                <span className="font-semibold">Impersonating {brandName}</span>
                <span className="text-amber-100/80"> as platform operator {impersonation.operator}</span>
              </div>
              <button
                type="button"
                onClick={exitImpersonation}
                className="self-start rounded-lg border border-amber-300/40 px-3 py-1 text-xs font-semibold text-amber-100 transition hover:bg-amber-300/10 sm:self-auto"
              >
                Exit impersonation
              </button>
            </div>
          </div>
        )}
        <div className="sm:hidden relative">
          <nav className="flex items-center gap-1 px-4 pb-2 overflow-x-auto scrollbar-none" style={{ WebkitOverflowScrolling: "touch" }}>
            {navBeforeClientStats.map((n) => {
              const active = n.isHome ? currentPath === normalizePath(n.href) : isActivePath(currentPath, n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition min-h-[36px] flex items-center ${
                    active ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
            <label className={`shrink-0 min-h-[36px] flex items-center rounded-lg text-sm transition ${
              clientStatsActive ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
            }`}>
              <span className="sr-only">{am.nav.clientsAndStatistics}</span>
              <select
                aria-label={am.nav.clientsAndStatistics}
                value={clientStatsValue ?? ""}
                onChange={(event) => {
                  if (event.target.value) router.push(event.target.value);
                }}
                className="bg-transparent px-3 py-2 rounded-lg outline-none"
              >
                <option value="" disabled>{am.nav.clientsAndStatistics}</option>
                {clientStatsSections.map((section) => (
                  <option key={section.href} value={section.href}>{section.label}</option>
                ))}
              </select>
            </label>
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

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.7 2.1h2.6l.5 2.1c.5.2.9.4 1.3.7l2-.7 1.3 2.2-1.6 1.4c.1.5.1 1 .1 1.5l1.6 1.4-1.3 2.2-2-.7c-.4.3-.8.5-1.3.7l-.5 2.1H8.7l-.5-2.1c-.5-.2-.9-.4-1.3-.7l-2 .7-1.3-2.2 1.6-1.4c-.1-.5-.1-1 0-1.5L3.6 6.4l1.3-2.2 2 .7c.4-.3.8-.5 1.3-.7l.5-2.1Z" />
      <circle cx="10" cy="9.5" r="2.4" />
    </svg>
  );
}

function QuestionIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="10" r="7.2" />
      <path d="M7.9 7.7a2.2 2.2 0 014.2.9c0 1.5-1.5 1.9-2.1 2.8" />
      <path d="M10 14.2h.01" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3.5H4.8A1.8 1.8 0 003 5.3v9.4a1.8 1.8 0 001.8 1.8H8" />
      <path d="M12 6.5 15.5 10 12 13.5" />
      <path d="M15.5 10H7" />
    </svg>
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
