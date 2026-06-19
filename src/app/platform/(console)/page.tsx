"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { platformFetch, platformJson, toast, type TenantView } from "@/components/platform/api";

const field =
  "bg-surface-container-high border border-outline-variant/30 rounded-lg px-2 py-1.5 text-sm w-full focus:border-primary outline-none";

interface TenantStats {
  total: number;
  last30: number;
  totalCovers: number;
  noShows: number;
  cancellations: number;
  lastBookingDate: string | null;
}

interface PlatformAnalytics {
  totals: { reservations: number; last30: number; tenants: number };
  byTenant: Record<string, TenantStats>;
}

export default function PlatformHome() {
  const [tenants, setTenants] = useState<TenantView[] | null>(null);
  const [analytics, setAnalytics] = useState<PlatformAnalytics | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const [tenantsData, analyticsData] = await Promise.all([
        platformJson<{ tenants: TenantView[] }>("/api/platform/tenants"),
        platformJson<PlatformAnalytics>("/api/platform/analytics").catch(() => null),
      ]);
      setTenants(tenantsData.tenants);
      setAnalytics(analyticsData);
    } catch {
      toast("Could not load restaurants.", "error");
    }
  }
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Restaurants</h1>
        <button
          onClick={() => setCreating((c) => !c)}
          className="bg-primary text-on-primary px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110"
        >
          {creating ? "Close" : "New restaurant"}
        </button>
      </div>

      {creating && <CreateForm onCreated={() => { setCreating(false); load(); }} />}

      {/* Platform-wide stats */}
      {analytics && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total bookings", value: analytics.totals.reservations },
            { label: "Last 30 days", value: analytics.totals.last30 },
            { label: "Active restaurants", value: analytics.totals.tenants },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-outline-variant/30 bg-surface-container p-4">
              <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
              <div className="text-xs uppercase tracking-widest text-on-surface-variant mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {tenants === null ? (
        <p className="text-on-surface-variant">Loading…</p>
      ) : tenants.length === 0 ? (
        <p className="text-on-surface-variant">No restaurants yet. Create one to get started.</p>
      ) : (
        <div className="space-y-2">
          {tenants.map((t) => {
            const stats = analytics?.byTenant[t.id];
            return (
              <Link
                key={t.id}
                href={`/platform/tenants/${t.id}`}
                className="flex items-center justify-between rounded-xl border border-outline-variant/30 bg-surface-container p-4 hover:border-primary/50 transition"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{t.name}</span>
                    <span className="text-xs text-on-surface-variant">/{t.slug}</span>
                    {t.status === "disabled" && (
                      <span className="text-[10px] uppercase tracking-widest text-rose-300 border border-rose-500/30 rounded px-1.5 py-0.5">disabled</span>
                    )}
                  </div>
                  <div className="text-xs text-on-surface-variant truncate mt-0.5">
                    {t.hosts.length ? t.hosts.join(", ") : "no hosts mapped"}
                  </div>
                </div>
                {stats && (
                  <div className="flex items-center gap-4 shrink-0 ml-4 text-xs text-on-surface-variant">
                    <span title="Total reservations">
                      <span className="font-semibold text-on-surface">{stats.total}</span> total
                    </span>
                    <span title="Last 30 days" className="hidden sm:inline">
                      <span className="font-semibold text-on-surface">{stats.last30}</span> /30d
                    </span>
                    {stats.noShows > 0 && (
                      <span className="text-rose-400 hidden md:inline" title="No-shows">
                        {stats.noShows} no-show{stats.noShows > 1 ? "s" : ""}
                      </span>
                    )}
                    {stats.lastBookingDate && (
                      <span className="hidden lg:inline" title="Last booking date">
                        Last: {stats.lastBookingDate}
                      </span>
                    )}
                  </div>
                )}
                <span className="text-on-surface-variant ml-3">›</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateForm({ onCreated }: { onCreated: () => void }) {
  const [f, setF] = useState({ name: "", slug: "", username: "", password: "", hosts: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function submit() {
    if (!f.name.trim() || !f.slug.trim() || !f.username.trim() || f.password.length < 8) {
      toast("Name, slug, username and an 8+ char password are required.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await platformFetch("/api/platform/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: f.slug.trim().toLowerCase(),
          name: f.name.trim(),
          username: f.username.trim(),
          password: f.password,
          hosts: f.hosts.split(/[\s,]+/).map((h) => h.trim()).filter(Boolean),
          settings: { name: f.name.trim(), autoConfirm: true, emailEnabled: true, timezone: "Europe/Rome", locale: "en-US" },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed");
      toast("Restaurant created");
      onCreated();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not create restaurant.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4 space-y-3">
      <h2 className="font-semibold">New restaurant</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block"><span className="text-xs text-on-surface-variant">Name</span>
          <input className={field} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Acme Osteria" /></label>
        <label className="block"><span className="text-xs text-on-surface-variant">Slug</span>
          <input className={field} value={f.slug} onChange={(e) => set("slug", e.target.value)} placeholder="acme" /></label>
        <label className="block"><span className="text-xs text-on-surface-variant">Staff username</span>
          <input className={field} value={f.username} onChange={(e) => set("username", e.target.value)} placeholder="staff" /></label>
        <label className="block"><span className="text-xs text-on-surface-variant">Staff password (8+)</span>
          <input className={field} type="password" value={f.password} onChange={(e) => set("password", e.target.value)} /></label>
        <label className="block sm:col-span-2"><span className="text-xs text-on-surface-variant">Hosts (space/comma separated)</span>
          <input className={field} value={f.hosts} onChange={(e) => set("hosts", e.target.value)} placeholder="acme.example.com admin.acme.example.com" /></label>
      </div>
      <button onClick={submit} disabled={busy} className="bg-primary text-on-primary px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-60">
        {busy ? "Creating…" : "Create restaurant"}
      </button>
    </div>
  );
}
