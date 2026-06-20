"use client";

import { useCallback, useEffect, useState } from "react";
import { am } from "@/i18n/admin";
import { adminJson, toast } from "@/components/admin/api";

type Period = "7d" | "30d" | "90d" | "365d";

interface AnalyticsData {
  period: string;
  from: string;
  to: string;
  byDay: { date: string; reservations: number; covers: number }[];
  byStatus: Record<string, number>;
  bySource: { web: number; admin: number };
  byService: { offering?: string; service: string; reservations: number; covers: number }[];
  avgPartySize: number;
  avgLeadDays: number;
  newVsReturning: { new: number; returning: number };
  feedback: { sent: number; filled: number; avgRating: number | null; byRating: number[] };
  byOffering?: { offering: string; reservations: number; covers: number }[];
  rates?: { total: number; noShow: number; cancelled: number; noShowRate: number; cancelledRate: number };
  heatmap?: { weekday: number; hour: number; reservations: number; covers: number }[];
  partySizes?: { size: number; reservations: number }[];
  tableUtilization?: { tableId: string; label: string; turns: number; covers: number }[];
  waitlist?: {
    total: number; seated: number; left: number; expired: number;
    waiting: number; avgQuotedWait: number; conversionRate: number;
  };
}

const PERIODS: { value: Period; label: string }[] = [
  { value: "7d", label: am.analytics.period7 },
  { value: "30d", label: am.analytics.period30 },
  { value: "90d", label: am.analytics.period90 },
  { value: "365d", label: am.analytics.period365 },
];

const STATUS_COLORS: Record<string, string> = {
  completed: "#4ade80",
  seated: "#38bdf8",
  confirmed: "#a3e635",
  pending: "#fbbf24",
  cancelled: "#f87171",
  no_show: "#f43f5e",
};

function BarChart({
  data,
  metric,
}: {
  data: { date: string; reservations: number; covers: number }[];
  metric: "covers" | "reservations";
}) {
  if (!data.length) return <p className="text-on-surface-variant text-sm py-8 text-center">{am.analytics.noData}</p>;
  const values = data.map((d) => d[metric]);
  const max = Math.max(...values, 1);
  const W = 600;
  const H = 120;
  const barW = Math.max(2, Math.floor((W - data.length * 2) / data.length));
  const gap = Math.floor((W - barW * data.length) / Math.max(data.length - 1, 1));

  function formatDate(d: string) {
    const dt = new Date(`${d}T00:00:00Z`);
    return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`;
  }

  const showLabels = data.length <= 31;

  return (
    <svg viewBox={`0 0 ${W} ${H + (showLabels ? 20 : 4)}`} className="w-full" aria-label={`${metric} bar chart`}>
      {data.map((d, i) => {
        const v = d[metric];
        const h = Math.max(2, Math.round((v / max) * H));
        const x = i * (barW + gap);
        const y = H - h;
        return (
          <g key={d.date}>
            <rect x={x} y={y} width={barW} height={h} rx="1" className="fill-primary opacity-80" />
            {showLabels && i % Math.ceil(data.length / 14) === 0 && (
              <text x={x + barW / 2} y={H + 14} textAnchor="middle" fontSize="9" className="fill-on-surface-variant opacity-70">
                {formatDate(d.date)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function DonutChart({ slices }: { slices: { label: string; value: number; color: string }[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (!total) return <p className="text-on-surface-variant text-sm">{am.analytics.noData}</p>;
  const cx = 50, cy = 50, r = 38, inner = 22;
  let angle = -Math.PI / 2;
  const paths: { d: string; color: string; label: string; pct: number }[] = [];

  for (const s of slices) {
    if (!s.value) continue;
    const sweep = (s.value / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(angle + sweep);
    const y2 = cy + r * Math.sin(angle + sweep);
    const ix1 = cx + inner * Math.cos(angle);
    const iy1 = cy + inner * Math.sin(angle);
    const ix2 = cx + inner * Math.cos(angle + sweep);
    const iy2 = cy + inner * Math.sin(angle + sweep);
    const large = sweep > Math.PI ? 1 : 0;
    paths.push({
      d: `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${inner} ${inner} 0 ${large} 0 ${ix1} ${iy1} Z`,
      color: s.color,
      label: s.label,
      pct: Math.round((s.value / total) * 100),
    });
    angle += sweep;
  }

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <svg viewBox="0 0 100 100" className="w-24 h-24 shrink-0">
        {paths.map((p) => (
          <path key={p.label} d={p.d} fill={p.color} />
        ))}
      </svg>
      <div className="space-y-1 text-xs">
        {paths.map((p) => (
          <div key={p.label} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-on-surface-variant capitalize">{p.label.replace("_", "-")}</span>
            <span className="font-semibold tabular-nums ml-auto pl-2">{p.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// API weekday is 0=Sun…6=Sat; display Mon-first.
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function Heatmap({ cells }: { cells: { weekday: number; hour: number; covers: number }[] }) {
  if (!cells.length) return <p className="text-on-surface-variant text-sm py-6 text-center">{am.analytics.noData}</p>;
  const hours = cells.map((c) => c.hour);
  const minH = Math.min(...hours);
  const maxH = Math.max(...hours);
  const hourRange: number[] = [];
  for (let h = minH; h <= maxH; h++) hourRange.push(h);
  const max = Math.max(...cells.map((c) => c.covers), 1);
  const lookup = new Map<string, number>();
  for (const c of cells) lookup.set(`${c.weekday}:${c.hour}`, c.covers);

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1">
        <thead>
          <tr>
            <th />
            {hourRange.map((h) => (
              <th key={h} className="text-[9px] font-normal text-on-surface-variant/70 tabular-nums w-6 text-center">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DISPLAY_ORDER.map((wd, i) => (
            <tr key={wd}>
              <td className="text-[10px] text-on-surface-variant pr-1 whitespace-nowrap">{WEEKDAY_LABELS[i]}</td>
              {hourRange.map((h) => {
                const v = lookup.get(`${wd}:${h}`) ?? 0;
                const intensity = v / max;
                return (
                  <td key={h}>
                    <div
                      className="w-6 h-6 rounded-sm"
                      title={v ? `${WEEKDAY_LABELS[i]} ${h}:00 — ${v} ${am.analytics.covers.toLowerCase()}` : undefined}
                      style={{
                        backgroundColor: v
                          ? `color-mix(in srgb, var(--brand-primary, #f2ca50) ${Math.round(20 + intensity * 80)}%, transparent)`
                          : "var(--md-surface-container-high, rgba(255,255,255,0.04))",
                      }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Simple horizontal bar list keyed by a label + value. */
function BarList({ rows }: { rows: { key: string; label: string; value: number; sub?: string }[] }) {
  if (!rows.length) return <p className="text-on-surface-variant text-sm">{am.analytics.noData}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-3">
          <span className="w-28 text-sm shrink-0 truncate">{r.label}</span>
          <div className="flex-1 bg-surface-container-high rounded-full h-2 overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.round((r.value / max) * 100)}%` }} />
          </div>
          <span className="text-xs text-on-surface-variant tabular-nums w-24 text-right">{r.sub ?? r.value}</span>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, sub, hint }: { label: string; value: string; sub?: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4">
      <div className="text-2xl font-semibold tabular-nums leading-none">{value}</div>
      <div className="text-xs uppercase tracking-widest text-on-surface-variant mt-2">{label}</div>
      {hint && <div className="text-[11px] text-on-surface-variant/70 mt-1.5 leading-snug">{hint}</div>}
      {sub && <div className="text-[11px] text-on-surface-variant/50 mt-0.5 tabular-nums">{sub}</div>}
    </div>
  );
}

const section = "rounded-xl border border-outline-variant/30 bg-surface-container p-5 space-y-3";

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<"covers" | "reservations">("covers");
  const [offeringLabels, setOfferingLabels] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await adminJson<AnalyticsData>(`/api/admin/analytics?period=${period}`);
      setData(d);
    } catch {
      toast(am.analytics.couldNotLoad, "error");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  // Resolve offering ids → labels for the per-offering breakdown.
  useEffect(() => {
    adminJson<{ offerings: { id: string; label: string }[] }>("/api/availability?offerings=1")
      .then((d) => setOfferingLabels(Object.fromEntries(d.offerings.map((o) => [o.id, o.label]))))
      .catch(() => {});
  }, []);

  // Derive multi-offering from the actual data, not the (cosmetic) label fetch —
  // a transient label-fetch failure must not collapse the per-offering breakdown.
  const multiOffering = (data?.byOffering?.length ?? 0) > 1;
  const offeringName = (id?: string) => offeringLabels[id || "main"] ?? (id || "main");

  const totalReservations = data?.byDay.reduce((s, d) => s + d.reservations, 0) ?? 0;
  const totalCovers = data?.byDay.reduce((s, d) => s + d.covers, 0) ?? 0;

  const statusSlices = Object.entries(data?.byStatus ?? {}).map(([k, v]) => ({
    label: k,
    value: v,
    color: STATUS_COLORS[k] ?? "#6b7280",
  }));

  const sourceTotal = (data?.bySource.web ?? 0) + (data?.bySource.admin ?? 0);
  const sourceSlices = [
    { label: am.analytics.web, value: data?.bySource.web ?? 0, color: "#818cf8" },
    { label: am.analytics.admin, value: data?.bySource.admin ?? 0, color: "#f2ca50" },
  ];

  const nvr = data?.newVsReturning;
  const nvrTotal = (nvr?.new ?? 0) + (nvr?.returning ?? 0);
  const nvrSlices = [
    { label: am.analytics.newGuests, value: nvr?.new ?? 0, color: "#34d399" },
    { label: am.analytics.returningGuests, value: nvr?.returning ?? 0, color: "#818cf8" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">{am.analytics.title}</h1>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                period === p.value
                  ? "bg-primary/15 text-primary border-primary/40"
                  : "border-outline-variant/30 text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : !data ? null : (
        <>
          {/* KPI row */}
          {(() => {
            const periodDays = parseInt(period);
            return (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard
                  label={am.analytics.reservations}
                  value={String(totalReservations)}
                  hint={totalReservations > 0 ? am.analytics.hintAvgPerDay((totalReservations / periodDays).toFixed(1)) : am.analytics.hintNoBookings}
                />
                <StatCard
                  label={am.analytics.covers}
                  value={String(totalCovers)}
                  hint={totalCovers > 0 ? am.analytics.hintAvgGuestsPerDay((totalCovers / periodDays).toFixed(1)) : undefined}
                />
                <StatCard
                  label={am.analytics.avgParty}
                  value={data.avgPartySize ? data.avgPartySize.toFixed(1) : "—"}
                  hint={am.analytics.hintAvgParty}
                />
                <StatCard
                  label={am.analytics.avgLead}
                  value={data.avgLeadDays ? `${Math.round(data.avgLeadDays)}` : "—"}
                  hint={am.analytics.hintAvgLead}
                  sub={am.analytics.avgLeadUnit}
                />
                <StatCard
                  label={am.analytics.noShowRate}
                  value={data.rates ? `${data.rates.noShowRate}%` : "—"}
                  hint={am.analytics.hintNoShow}
                  sub={data.rates ? `${data.rates.noShow} no-shows of ${data.rates.total}` : undefined}
                />
                <StatCard
                  label={am.analytics.cancelRate}
                  value={data.rates ? `${data.rates.cancelledRate}%` : "—"}
                  hint={am.analytics.hintCancelRate}
                  sub={data.rates ? `${data.rates.cancelled} cancellations of ${data.rates.total}` : undefined}
                />
              </div>
            );
          })()}

          {/* Daily bar chart */}
          <div className={section}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm uppercase tracking-widest text-on-surface-variant">
                {metric === "covers" ? am.analytics.covers : am.analytics.reservations} {am.analytics.byDay}
              </h2>
              <div className="flex gap-1">
                {(["covers", "reservations"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMetric(m)}
                    className={`px-2.5 py-1 rounded text-xs border transition ${
                      metric === m
                        ? "bg-primary/15 text-primary border-primary/30"
                        : "border-outline-variant/20 text-on-surface-variant"
                    }`}
                  >
                    {m === "covers" ? am.analytics.covers : am.analytics.reservations}
                  </button>
                ))}
              </div>
            </div>
            <BarChart data={data.byDay} metric={metric} />
          </div>

          {/* Peak demand heatmap */}
          {data.heatmap && data.heatmap.length > 0 && (
            <div className={section}>
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h2 className="font-semibold text-sm uppercase tracking-widest text-on-surface-variant">
                  {am.analytics.peakDemand}
                </h2>
                <span className="text-xs text-on-surface-variant/60">{am.analytics.peakHint}</span>
              </div>
              <Heatmap cells={data.heatmap} />
            </div>
          )}

          <div className="grid sm:grid-cols-3 gap-4">
            {/* Status breakdown */}
            <div className={section}>
              <h2 className="font-semibold text-sm uppercase tracking-widest text-on-surface-variant">
                {am.analytics.byStatus}
              </h2>
              <DonutChart slices={statusSlices} />
            </div>

            {/* Source */}
            <div className={section}>
              <h2 className="font-semibold text-sm uppercase tracking-widest text-on-surface-variant">
                {am.analytics.bySource}
              </h2>
              {sourceTotal ? (
                <DonutChart slices={sourceSlices} />
              ) : (
                <p className="text-on-surface-variant text-sm">{am.analytics.noData}</p>
              )}
            </div>

            {/* New vs returning */}
            <div className={section}>
              <h2 className="font-semibold text-sm uppercase tracking-widest text-on-surface-variant">
                {am.analytics.newVsReturning}
              </h2>
              {nvrTotal ? (
                <DonutChart slices={nvrSlices} />
              ) : (
                <p className="text-on-surface-variant text-sm">{am.analytics.noData}</p>
              )}
            </div>
          </div>

          {/* Feedback — always shown so staff know the feature exists */}
          <div className={section}>
            <h2 className="font-semibold text-sm uppercase tracking-widest text-on-surface-variant mb-2">
              {am.analytics.feedbackTitle}
            </h2>
            {data.feedback.sent === 0 ? (
              <p className="text-sm text-on-surface-variant/60">
                {am.analytics.feedbackNone}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-6 mb-4">
                  <div>
                    <div className="text-2xl font-bold text-primary">
                      {data.feedback.avgRating != null ? `★ ${data.feedback.avgRating.toFixed(1)}` : "—"}
                    </div>
                    <div className="text-xs text-on-surface-variant mt-0.5">{am.analytics.avgRating}</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{data.feedback.filled}</div>
                    <div className="text-xs text-on-surface-variant mt-0.5">
                      {am.analytics.feedbackResponses(
                        data.feedback.filled,
                        Math.round((data.feedback.filled / data.feedback.sent) * 100),
                        data.feedback.sent,
                      )}
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {[5, 4, 3, 2, 1].map((s) => {
                    const count = data.feedback.byRating[s - 1] ?? 0;
                    const pct = data.feedback.filled > 0 ? Math.round((count / data.feedback.filled) * 100) : 0;
                    return (
                      <div key={s} className="flex items-center gap-2 text-xs">
                        <span className="w-4 text-on-surface-variant text-right tabular-nums">{s}★</span>
                        <div className="flex-1 bg-surface-container-high rounded-full h-2 overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-8 text-on-surface-variant text-right tabular-nums">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* By offering (only when more than one offering) */}
          {multiOffering && data.byOffering && data.byOffering.length > 0 && (
            <div className={section}>
              <h2 className="font-semibold text-sm uppercase tracking-widest text-on-surface-variant mb-1">
                {am.analytics.byOffering}
              </h2>
              <div className="space-y-2">
                {data.byOffering.map((o) => {
                  const maxCovers = Math.max(...data.byOffering!.map((x) => x.covers), 1);
                  const pct = Math.round((o.covers / maxCovers) * 100);
                  return (
                    <div key={o.offering} className="flex items-center gap-3">
                      <span className="w-28 text-sm shrink-0 truncate">{offeringName(o.offering)}</span>
                      <div className="flex-1 bg-surface-container-high rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-on-surface-variant tabular-nums w-24 text-right">
                        {o.reservations} res · {o.covers} cov
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* By service */}
          {data.byService.length > 0 && (
            <div className={section}>
              <h2 className="font-semibold text-sm uppercase tracking-widest text-on-surface-variant mb-1">
                {am.analytics.byService}
              </h2>
              <div className="space-y-2">
                {data.byService.map((s) => {
                  const maxCovers = Math.max(...data.byService.map((x) => x.covers), 1);
                  const pct = Math.round((s.covers / maxCovers) * 100);
                  return (
                    <div key={`${s.offering || "main"}:${s.service}`} className="flex items-center gap-3">
                      <span className="w-32 text-sm capitalize shrink-0 truncate">
                        {multiOffering ? `${offeringName(s.offering)} · ${s.service}` : s.service}
                      </span>
                      <div className="flex-1 bg-surface-container-high rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-on-surface-variant tabular-nums w-24 text-right">
                        {s.reservations} res · {s.covers} cov
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            {/* Party-size distribution */}
            {data.partySizes && data.partySizes.length > 0 && (
              <div className={section}>
                <h2 className="font-semibold text-sm uppercase tracking-widest text-on-surface-variant mb-1">
                  {am.analytics.partySizes}
                </h2>
                <BarList
                  rows={data.partySizes.map((p) => ({
                    key: String(p.size),
                    label: am.analytics.partyOf(p.size),
                    value: p.reservations,
                  }))}
                />
              </div>
            )}

            {/* Table utilization (Phase 1) */}
            {data.tableUtilization && data.tableUtilization.length > 0 && (
              <div className={section}>
                <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
                  <h2 className="font-semibold text-sm uppercase tracking-widest text-on-surface-variant">
                    {am.analytics.tableUtilization}
                  </h2>
                  <span className="text-xs text-on-surface-variant/60">{am.analytics.tableUtilHint}</span>
                </div>
                <BarList
                  rows={data.tableUtilization.map((t) => ({
                    key: t.tableId,
                    label: t.label,
                    value: t.covers,
                    sub: `${t.turns} ${am.analytics.turns} · ${t.covers} ${am.analytics.cov}`,
                  }))}
                />
              </div>
            )}
          </div>

          {/* Waitlist summary (Phase 2) */}
          {data.waitlist && data.waitlist.total > 0 && (
            <div className={section}>
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h2 className="font-semibold text-sm uppercase tracking-widest text-on-surface-variant">
                  {am.analytics.waitlistTitle}
                </h2>
                <span className="text-xs text-on-surface-variant/60">{am.analytics.waitlistHint}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
                <StatCard label={am.analytics.wlTotal} value={String(data.waitlist.total)} />
                <StatCard label={am.analytics.wlSeated} value={String(data.waitlist.seated)} />
                <StatCard label={am.analytics.wlLeft} value={String(data.waitlist.left)} />
                <StatCard label={am.analytics.wlConversion} value={`${data.waitlist.conversionRate}%`} />
                <StatCard
                  label={am.analytics.wlAvgWait}
                  value={data.waitlist.avgQuotedWait ? `${data.waitlist.avgQuotedWait}` : "—"}
                  sub={data.waitlist.avgQuotedWait ? am.analytics.minUnit : undefined}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
