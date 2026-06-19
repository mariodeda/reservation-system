"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type AdminReservation, formatDateLong, todayInTz } from "@/components/admin/shared";
import { am } from "@/i18n/admin";
import ReservationRow from "@/components/admin/ReservationRow";
import { adminJson, toast } from "@/components/admin/api";
import { ACTIVE_STATUSES, type AvailabilityConfig } from "@/lib/reservations/types";
import { offeringServiceMap, type OfferingServices } from "@/lib/reservations/offerings";

export default function DashboardPage() {
  const { slug } = useParams<{ slug: string }>();
  const [tz, setTz] = useState("Europe/Rome");
  const [offerings, setOfferings] = useState<OfferingServices[]>([]);
  const [items, setItems] = useState<AdminReservation[]>([]);
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => todayInTz(tz), [tz]);

  useEffect(() => {
    adminJson<{ config: AvailabilityConfig }>("/api/admin/config")
      .then((d) => {
        setTz(d.config.timezone || "Europe/Rome");
        setOfferings(offeringServiceMap(d.config));
      })
      .catch(() => {});
  }, []);

  const multiOffering = offerings.length > 1;
  const labelFor = (offId: string, svcId: string) => {
    const off = offerings.find((o) => o.id === (offId || "main"));
    const svc = off?.services.find((s) => s.id === svcId)?.label ?? svcId;
    return multiOffering && off ? `${off.label} · ${svc}` : svc;
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminJson<{ reservations: AdminReservation[] }>(
        `/api/admin/reservations?date=${today}`,
      );
      setItems(data.reservations ?? []);
    } catch {
      toast(am.dashboard.couldNotLoad, "error");
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    load();
    // Refresh every 30s so live-service staff see new walk-in requests and status changes.
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const active = items.filter((r) => ACTIVE_STATUSES.includes(r.status));
  const covers = active.reduce((s, r) => s + r.partySize, 0);
  const pending = items.filter((r) => r.status === "pending").length;
  const byService = active.reduce<Record<string, { count: number; covers: number }>>((acc, r) => {
    const key = labelFor(r.offering || "main", r.service);
    (acc[key] ??= { count: 0, covers: 0 });
    acc[key].count++;
    acc[key].covers += r.partySize;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{am.dashboard.title}</h1>
          <p className="text-on-surface-variant">{formatDateLong(today)}</p>
        </div>
        <Link
          href={`/admin/${slug}/reservations`}
          className="bg-primary text-on-primary px-4 py-2 rounded-lg text-sm font-semibold hover:brightness-110"
        >
          {am.dashboard.allReservations}
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label={am.dashboard.stats.reservations} value={active.length} />
        <Stat label={am.dashboard.stats.covers} value={covers} />
        <Stat label={am.dashboard.stats.pending} value={pending} highlight={pending > 0} />
      </div>

      {Object.keys(byService).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(byService).map(([label, v]) => (
            <span
              key={label}
              className="text-xs px-3 py-1 rounded-full bg-surface-container border border-outline-variant/30 text-on-surface-variant"
            >
              <span className="text-on-surface font-medium">{label}</span> · {am.dashboard.booking(v.count)} · {am.dashboard.cover(v.covers)}
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant border border-dashed border-outline-variant/40 rounded-xl">
          {am.dashboard.noReservationsToday}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((r) => (
            <ReservationRow key={r.id} r={r} onChanged={load} offerings={offerings} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight ? "border-amber-400/40 bg-amber-400/10" : "border-outline-variant/30 bg-surface-container"
      }`}
    >
      <div className="text-3xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-widest text-on-surface-variant mt-1">{label}</div>
    </div>
  );
}
