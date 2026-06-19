"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function PlatformShell({
  username,
  children,
}: {
  username: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/platform/logout", { method: "POST" });
    router.replace("/platform/login");
    router.refresh();
  }
  return (
    <div data-admin className="min-h-screen bg-background text-on-surface">
      <header className="sticky top-0 z-30 bg-surface-container/95 backdrop-blur border-b border-outline-variant/30">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 min-w-0">
            <Link href="/platform" className="font-display-lg text-[16px] text-primary uppercase tracking-tighter truncate">
              Reservations Platform
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-on-surface-variant hidden sm:inline">{username}</span>
            <button
              onClick={logout}
              className="text-sm text-on-surface-variant hover:text-primary border border-outline-variant/40 rounded-lg px-3 py-1.5 transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
