"use client";

import { useCallback, useEffect, useState } from "react";
import { am } from "@/i18n";
import { adminJson, toast } from "@/components/admin/api";
import { DISMISS_ADMIN_TOOLTIPS_EVENT } from "@/components/admin/tooltip-events";
import { offeringSummaries } from "@/lib/reservations/offerings";
import type { AvailabilityConfig } from "@/lib/reservations/types";

type Period = "7d" | "30d" | "90d" | "365d";

interface SourceAnalytics {
  source: string;
  label: string;
  external: boolean;
  reservations: number;
  activeReservations: number;
  covers: number;
  cancelled: number;
  noShow: number;
  completed: number;
  reservationShare: number;
  coverShare: number;
  cancellationRate: number;
  noShowRate: number;
}

interface AnalyticsData {
  period: string;
  from: string;
  to: string;
  byDay: { date: string; reservations: number; covers: number }[];
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  sourceBreakdown?: SourceAnalytics[];
  externalSummary?: {
    reservations: number;
    activeReservations: number;
    covers: number;
    cancelled: number;
    noShow: number;
    reservationShare: number;
    coverShare: number;
    providers: SourceAnalytics[];
  };
  byService: { offering?: string; service: string; reservations: number; covers: number }[];
  avgPartySize: number;
  avgLeadDays: number;
  newVsReturning: { new: number; returning: number };
  feedback: { sent: number };
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

const STATUS_COLORS: Record<string, string> = {
  completed: "#4ade80",
  seated: "#38bdf8",
  confirmed: "#a3e635",
  pending: "#fbbf24",
  cancelled: "#f87171",
  no_show: "#f43f5e",
};

const SOURCE_COLORS: Record<string, string> = {
  web: "#818cf8",
  admin: "#f2ca50",
  thefork: "#007064",
  dish: "#fb6a3a",
};

function sourceDisplayName(source: string, fallback?: string) {
  if (source === "web") return am.analytics.web;
  if (source === "admin") return am.analytics.admin;
  if (source === "thefork") return am.analytics.theFork;
  if (source === "dish") return am.analytics.dish;
  return fallback || source;
}

// ── Tooltip ──────────────────────────────────────────────────────────────────

type TipState = { x: number; y: number; title: string; lines: string[] } | null;

function useAdminTooltipDismiss(onDismiss: () => void) {
  useEffect(() => {
    window.addEventListener(DISMISS_ADMIN_TOOLTIPS_EVENT, onDismiss);
    return () => window.removeEventListener(DISMISS_ADMIN_TOOLTIPS_EVENT, onDismiss);
  }, [onDismiss]);
}

function Tip({ tip }: { tip: NonNullable<TipState> }) {
  const safeX =
    typeof window !== "undefined"
      ? Math.min(tip.x + 14, window.innerWidth - 224)
      : tip.x + 14;
  return (
    <div className="fixed z-50 pointer-events-none" style={{ left: safeX, top: tip.y }}>
      <div className="-translate-y-full rounded-lg border border-outline-variant/40 bg-surface-container shadow-xl px-3 py-2 text-xs space-y-0.5">
        <div className="font-semibold text-on-surface whitespace-nowrap">{tip.title}</div>
        {tip.lines.map((l, i) => (
          <div key={i} className="text-on-surface-variant whitespace-nowrap">{l}</div>
        ))}
      </div>
    </div>
  );
}

// ── BarChart ─────────────────────────────────────────────────────────────────

function BarChart({
  data,
  metric,
}: {
  data: { date: string; reservations: number; covers: number }[];
  metric: "covers" | "reservations";
}) {
  const [tip, setTip] = useState<TipState>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const clearTip = useCallback(() => {
    setTip(null);
    setHoveredDate(null);
  }, []);
  useAdminTooltipDismiss(clearTip);

  if (!data.length)
    return (
      <p className="text-on-surface-variant text-sm py-8 text-center">
        {am.analytics.noData}
      </p>
    );

  const values = data.map((d) => d[metric]);
  const max = Math.max(...values, 1);
  const W = 600;
  const H = 120;
  const barW = Math.max(2, Math.floor((W - data.length * 2) / data.length));
  const gap = Math.floor((W - barW * data.length) / Math.max(data.length - 1, 1));
  const showLabels = data.length <= 31;

  function fmtShort(d: string) {
    const dt = new Date(`${d}T00:00:00Z`);
    return dt.toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "long",
      day: "numeric",
    });
  }
  function fmtFull(d: string) {
    const dt = new Date(`${d}T00:00:00Z`);
    return dt.toLocaleDateString("en-US", {
      timeZone: "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  const otherMetric = metric === "covers" ? "reservations" : "covers";

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H + (showLabels ? 28 : 4)}`}
        className="w-full cursor-crosshair"
        aria-label={`${metric} bar chart`}
        onMouseLeave={clearTip}
      >
        {data.map((d, i) => {
          const v = d[metric];
          const otherV = d[otherMetric];
          const h = Math.max(2, Math.round((v / max) * H));
          const x = i * (barW + gap);
          const y = H - h;
          const isHovered = hoveredDate === d.date;
          const dimmed = hoveredDate !== null && !isHovered;

          return (
            <g
              key={d.date}
              onMouseEnter={(e) => {
                setHoveredDate(d.date);
                setTip({
                  x: e.clientX,
                  y: e.clientY,
                  title: fmtFull(d.date),
                  lines: [
                    `${v} ${metric}`,
                    `${otherV} ${otherMetric}`,
                  ],
                });
              }}
              onMouseMove={(e) =>
                setTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : null))
              }
            >
              {/* Full-height transparent hit area for easy hovering */}
              <rect
                x={x}
                y={0}
                width={barW + (i < data.length - 1 ? gap : 0)}
                height={H}
                fill="transparent"
              />
              {/* Actual bar */}
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx="1"
                className="fill-primary"
                style={{ opacity: dimmed ? 0.3 : isHovered ? 1 : 0.8 }}
              />
              {/* Hover indicator line */}
              {isHovered && h > 2 && (
                <line
                  x1={x + barW / 2}
                  y1={0}
                  x2={x + barW / 2}
                  y2={y - 2}
                  stroke="var(--brand-primary, #f2ca50)"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                  opacity={0.5}
                />
              )}
              {showLabels && i % Math.ceil(data.length / 10) === 0 && (
                <text
                  x={x + barW / 2}
                  y={H + 18}
                  textAnchor="middle"
                  fontSize="10"
                  className="fill-on-surface-variant opacity-70"
                >
                  {fmtShort(d.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {tip && <Tip tip={tip} />}
    </div>
  );
}

// ── DonutChart ────────────────────────────────────────────────────────────────

function DonutChart({
  slices,
}: {
  slices: { label: string; value: number; color: string }[];
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [tip, setTip] = useState<TipState>(null);
  const clearTip = useCallback(() => {
    setHoveredIdx(null);
    setTip(null);
  }, []);
  useAdminTooltipDismiss(clearTip);

  const total = slices.reduce((s, x) => s + x.value, 0);
  if (!total)
    return <p className="text-on-surface-variant text-sm">{am.analytics.noData}</p>;

  const cx = 50,
    cy = 50,
    r = 38,
    inner = 22;
  let angle = -Math.PI / 2;
  const paths: { d: string; color: string; label: string; value: number; pct: number }[] =
    [];

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
      value: s.value,
      pct: Math.round((s.value / total) * 100),
    });
    angle += sweep;
  }

  return (
    <div
      className="flex items-center gap-4 flex-wrap"
      onMouseLeave={clearTip}
    >
      <svg viewBox="0 0 100 100" className="w-24 h-24 shrink-0">
        {paths.map((p, i) => (
          <path
            key={p.label}
            d={p.d}
            fill={p.color}
            className="cursor-pointer transition-opacity"
            style={{ opacity: hoveredIdx !== null && hoveredIdx !== i ? 0.35 : 1 }}
            onMouseEnter={(e) => {
              setHoveredIdx(i);
              setTip({
                x: e.clientX,
                y: e.clientY,
                title: p.label.replace("_", "-"),
                lines: [`${p.value}`, `${p.pct}%`],
              });
            }}
            onMouseMove={(e) =>
              setTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : null))
            }
          />
        ))}
        {/* Centre hole */}
        <circle cx={cx} cy={cy} r={inner} fill="transparent" />
      </svg>
      <div className="space-y-1 text-xs">
        {paths.map((p, i) => (
          <div
            key={p.label}
            className="flex items-center gap-2 transition-opacity"
            style={{ opacity: hoveredIdx !== null && hoveredIdx !== i ? 0.35 : 1 }}
            onMouseEnter={(e) => {
              setHoveredIdx(i);
              setTip({
                x: e.clientX,
                y: e.clientY,
                title: p.label.replace("_", "-"),
                lines: [`${p.value}`, `${p.pct}%`],
              });
            }}
            onMouseMove={(e) =>
              setTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : null))
            }
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: p.color }}
            />
            <span className="text-on-surface-variant capitalize">
              {p.label.replace("_", "-")}
            </span>
            <span className="font-semibold tabular-nums ml-auto pl-2">{p.pct}%</span>
          </div>
        ))}
      </div>
      {tip && <Tip tip={tip} />}
    </div>
  );
}

// ── Heatmap ───────────────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function Heatmap({ cells }: { cells: { weekday: number; hour: number; covers: number }[] }) {
  const [tip, setTip] = useState<TipState>(null);
  const clearTip = useCallback(() => setTip(null), []);
  useAdminTooltipDismiss(clearTip);

  if (!cells.length)
    return (
      <p className="text-on-surface-variant text-sm py-6 text-center">
        {am.analytics.noData}
      </p>
    );

  const hours = cells.map((c) => c.hour);
  const minH = Math.min(...hours);
  const maxH = Math.max(...hours);
  const hourRange: number[] = [];
  for (let h = minH; h <= maxH; h++) hourRange.push(h);
  const max = Math.max(...cells.map((c) => c.covers), 1);
  const lookup = new Map<string, number>();
  for (const c of cells) lookup.set(`${c.weekday}:${c.hour}`, c.covers);
  const busiest = [...cells]
    .filter((c) => c.covers > 0)
    .sort((a, b) => b.covers - a.covers)
    .slice(0, 5);
  const weekdayTotals = DISPLAY_ORDER.map((wd, i) => ({
    weekday: wd,
    label: WEEKDAY_LABELS[i],
    covers: cells.filter((c) => c.weekday === wd).reduce((sum, c) => sum + c.covers, 0),
  })).sort((a, b) => b.covers - a.covers);
  const busiestDay = weekdayTotals[0];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] items-start" onMouseLeave={clearTip}>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-1 w-full table-fixed min-w-[620px]">
          <thead>
            <tr>
              <th className="w-12" />
              {hourRange.map((h) => (
                <th
                  key={h}
                  className="text-[10px] font-normal text-on-surface-variant/70 tabular-nums text-center"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DISPLAY_ORDER.map((wd, i) => (
              <tr key={wd}>
                <td className="text-[10px] text-on-surface-variant pr-1 whitespace-nowrap">
                  {WEEKDAY_LABELS[i]}
                </td>
                {hourRange.map((h) => {
                  const v = lookup.get(`${wd}:${h}`) ?? 0;
                  const intensity = v / max;
                  return (
                    <td key={h}>
                      <div
                        className={`h-8 w-full rounded transition-opacity ${v ? "cursor-pointer" : ""}`}
                        style={{
                          backgroundColor: v
                            ? `color-mix(in srgb, var(--brand-primary, #f2ca50) ${Math.round(20 + intensity * 80)}%, transparent)`
                            : "var(--md-surface-container-high, rgba(255,255,255,0.04))",
                        }}
                        onMouseEnter={
                          v
                            ? (e) =>
                                setTip({
                                  x: e.clientX,
                                  y: e.clientY,
                                  title: `${WEEKDAY_LABELS[i]} ${h}:00`,
                                  lines: [`${v} ${am.analytics.covers.toLowerCase()}`],
                                })
                            : undefined
                        }
                        onMouseMove={
                          v
                            ? (e) =>
                                setTip((t) =>
                                  t ? { ...t, x: e.clientX, y: e.clientY } : null,
                                )
                            : undefined
                        }
                        onMouseLeave={clearTip}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3">
        <div className="rounded-lg border border-outline-variant/25 bg-surface-container-high p-3">
          <div className="text-[11px] uppercase tracking-widest text-on-surface-variant">
            {am.analytics.busiestWindow}
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {busiest[0] ? `${WEEKDAY_LABELS[DISPLAY_ORDER.indexOf(busiest[0].weekday)]} ${busiest[0].hour}:00` : "-"}
          </div>
          <div className="text-xs text-on-surface-variant mt-1">
            {busiest[0] ? `${busiest[0].covers} ${am.analytics.covers.toLowerCase()}` : am.analytics.noData}
          </div>
        </div>
        {busiestDay && (
          <div className="rounded-lg border border-outline-variant/25 bg-surface-container-high p-3">
            <div className="text-[11px] uppercase tracking-widest text-on-surface-variant">
              {am.analytics.busiestDay}
            </div>
            <div className="mt-1 text-xl font-semibold">{busiestDay.label}</div>
            <div className="text-xs text-on-surface-variant mt-1">
              {busiestDay.covers} {am.analytics.covers.toLowerCase()}
            </div>
          </div>
        )}
        <div className="rounded-lg border border-outline-variant/25 bg-surface-container-high p-3">
          <div className="text-[11px] uppercase tracking-widest text-on-surface-variant mb-2">
            {am.analytics.topSlots}
          </div>
          <div className="space-y-1.5">
            {busiest.map((cell) => {
              const label = `${WEEKDAY_LABELS[DISPLAY_ORDER.indexOf(cell.weekday)]} ${cell.hour}:00`;
              return (
                <div key={`${cell.weekday}-${cell.hour}`} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-on-surface">{label}</span>
                  <span className="text-on-surface-variant tabular-nums">{cell.covers}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {tip && <Tip tip={tip} />}
    </div>
  );
}

// ── BarList ───────────────────────────────────────────────────────────────────

function BarList({
  rows,
}: {
  rows: { key: string; label: string; value: number; sub?: string }[];
}) {
  const [tip, setTip] = useState<TipState>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const clearTip = useCallback(() => {
    setTip(null);
    setHoveredKey(null);
  }, []);
  useAdminTooltipDismiss(clearTip);

  if (!rows.length)
    return <p className="text-on-surface-variant text-sm">{am.analytics.noData}</p>;

  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div
      className="space-y-2"
      onMouseLeave={clearTip}
    >
      {rows.map((r) => {
        const pct = Math.round((r.value / max) * 100);
        const dimmed = hoveredKey !== null && hoveredKey !== r.key;
        return (
          <div
            key={r.key}
            className="flex items-center gap-3 transition-opacity"
            style={{ opacity: dimmed ? 0.35 : 1 }}
            onMouseEnter={(e) => {
              setHoveredKey(r.key);
              setTip({
                x: e.clientX,
                y: e.clientY,
                title: r.label,
                lines: r.sub
                  ? [r.sub, `${pct}% of peak`]
                  : [`${r.value}`, `${pct}% of peak`],
              });
            }}
            onMouseMove={(e) =>
              setTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : null))
            }
          >
            <span className="w-28 text-sm shrink-0 truncate">{r.label}</span>
            <div className="flex-1 bg-surface-container-high rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-on-surface-variant tabular-nums w-24 text-right">
              {r.sub ?? r.value}
            </span>
          </div>
        );
      })}
      {tip && <Tip tip={tip} />}
    </div>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  hint,
}: {
  label: string;
  value: string;
  sub?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4">
      <div className="text-2xl font-semibold tabular-nums leading-none">{value}</div>
      <div className="text-xs uppercase tracking-widest text-on-surface-variant mt-2">
        {label}
      </div>
      {hint && (
        <div className="text-[11px] text-on-surface-variant/70 mt-1.5 leading-snug">
          {hint}
        </div>
      )}
      {sub && (
        <div className="text-[11px] text-on-surface-variant/50 mt-0.5 tabular-nums">
          {sub}
        </div>
      )}
    </div>
  );
}

// ── HoverableBarRow ────────────────────────────────────────────────────────────

function HoverableBarRow({
  label,
  pct,
  detail,
  tipTitle,
  tipLines,
  dimmed,
  onEnter,
  onMove,
  onLeave,
}: {
  label: string;
  pct: number;
  detail: string;
  tipTitle: string;
  tipLines: string[];
  dimmed: boolean;
  onEnter: (e: React.MouseEvent) => void;
  onMove: (e: React.MouseEvent) => void;
  onLeave: () => void;
}) {
  void tipTitle; void tipLines; // consumed by parent via onEnter
  return (
    <div
      className="flex items-center gap-3 transition-opacity"
      style={{ opacity: dimmed ? 0.35 : 1 }}
      onMouseEnter={onEnter}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <span className="w-28 text-sm shrink-0 truncate">{label}</span>
      <div className="flex-1 bg-surface-container-high rounded-full h-2 overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-on-surface-variant tabular-nums w-24 text-right">
        {detail}
      </span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function WaitlistFunnel({
  waitlist,
}: {
  waitlist: NonNullable<AnalyticsData["waitlist"]>;
}) {
  const waitingPct = waitlist.total ? Math.round((waitlist.waiting / waitlist.total) * 100) : 0;
  const seatedPct = waitlist.total ? Math.round((waitlist.seated / waitlist.total) * 100) : 0;
  const leftPct = waitlist.total ? Math.round((waitlist.left / waitlist.total) * 100) : 0;
  const expiredPct = waitlist.total ? Math.round((waitlist.expired / waitlist.total) * 100) : 0;
  const unresolved = waitlist.waiting + waitlist.expired;
  const segments = [
    { key: "seated", label: am.analytics.wlSeated, value: waitlist.seated, pct: seatedPct, color: "#34d399" },
    { key: "waiting", label: am.analytics.wlWaiting, value: waitlist.waiting, pct: waitingPct, color: "#f2ca50" },
    { key: "left", label: am.analytics.wlLeft, value: waitlist.left, pct: leftPct, color: "#fb7185" },
    { key: "expired", label: am.analytics.wlExpired, value: waitlist.expired, pct: expiredPct, color: "#94a3b8" },
  ];

  return (
    <div className="grid lg:grid-cols-[260px_minmax(0,1fr)] gap-5 items-stretch">
      <div className="rounded-lg border border-outline-variant/25 bg-surface-container-high p-4 flex flex-col justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-on-surface-variant">
            {am.analytics.wlConversion}
          </div>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-4xl font-semibold tabular-nums leading-none">
              {waitlist.conversionRate}%
            </span>
            <span className="text-xs text-on-surface-variant pb-1">
              {waitlist.seated}/{waitlist.total}
            </span>
          </div>
        </div>
        <div className="mt-4">
          <div className="h-3 rounded-full overflow-hidden bg-surface-container border border-outline-variant/20 flex">
            {segments.map((segment) => (
              <div
                key={segment.key}
                style={{ width: `${segment.pct}%`, backgroundColor: segment.color }}
                className="h-full"
              />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {segments.map((segment) => (
              <div key={segment.key} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
                <span className="text-on-surface-variant">{segment.label}</span>
                <span className="ml-auto font-semibold tabular-nums">{segment.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-outline-variant/25 bg-surface-container-high p-4">
          <div className="text-2xl font-semibold tabular-nums">{waitlist.total}</div>
          <div className="text-[11px] uppercase tracking-widest text-on-surface-variant mt-2">
            {am.analytics.wlTotal}
          </div>
          <div className="text-xs text-on-surface-variant/70 mt-1">
            {am.analytics.waitlistHint}
          </div>
        </div>
        <div className="rounded-lg border border-outline-variant/25 bg-surface-container-high p-4">
          <div className="text-2xl font-semibold tabular-nums">
            {waitlist.avgQuotedWait ? waitlist.avgQuotedWait : "-"}
          </div>
          <div className="text-[11px] uppercase tracking-widest text-on-surface-variant mt-2">
            {am.analytics.wlAvgWait}
          </div>
          <div className="text-xs text-on-surface-variant/70 mt-1">
            {waitlist.avgQuotedWait ? am.analytics.minUnit : am.analytics.noData}
          </div>
        </div>
        <div className={`rounded-lg border p-4 ${
          unresolved
            ? "border-amber-400/40 bg-amber-400/10"
            : "border-outline-variant/25 bg-surface-container-high"
        }`}>
          <div className="text-2xl font-semibold tabular-nums">{unresolved}</div>
          <div className="text-[11px] uppercase tracking-widest text-on-surface-variant mt-2">
            {am.analytics.wlNeedsAttention}
          </div>
          <div className="text-xs text-on-surface-variant/70 mt-1">
            {waitlist.waiting} {am.analytics.wlWaiting.toLowerCase()} / {waitlist.expired} {am.analytics.wlExpired.toLowerCase()}
          </div>
        </div>
      </div>
    </div>
  );
}

const section =
  "rounded-xl border border-outline-variant/30 bg-surface-container p-5 space-y-3";

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<"covers" | "reservations">("covers");
  const [offeringLabels, setOfferingLabels] = useState<Record<string, string>>({});

  // Page-level tooltip for inline bar rows (offering, service, feedback)
  const [pageTip, setPageTip] = useState<TipState>(null);
  const [pageHovered, setPageHovered] = useState<string | null>(null);
  const clearPageTip = useCallback(() => {
    setPageHovered(null);
    setPageTip(null);
  }, []);
  useAdminTooltipDismiss(clearPageTip);
  const periods: { value: Period; label: string }[] = [
    { value: "7d", label: am.analytics.period7 },
    { value: "30d", label: am.analytics.period30 },
    { value: "90d", label: am.analytics.period90 },
    { value: "365d", label: am.analytics.period365 },
  ];

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

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    adminJson<{ config: AvailabilityConfig }>("/api/admin/config")
      .then((d) =>
        setOfferingLabels(Object.fromEntries(offeringSummaries(d.config).map((o) => [o.id, o.label]))),
      )
      .catch(() => {});
  }, []);

  const multiOffering = (data?.byOffering?.length ?? 0) > 1;
  const offeringName = (id?: string) => offeringLabels[id || "main"] ?? (id || "main");

  const totalReservations = data?.byDay.reduce((s, d) => s + d.reservations, 0) ?? 0;
  const totalCovers = data?.byDay.reduce((s, d) => s + d.covers, 0) ?? 0;

  const statusSlices = Object.entries(data?.byStatus ?? {}).map(([k, v]) => ({
    label: k,
    value: v,
    color: STATUS_COLORS[k] ?? "#6b7280",
  }));

  const sourceBreakdown =
    data?.sourceBreakdown ??
    Object.entries(data?.bySource ?? {})
      .filter(([, value]) => value > 0)
      .map(([source, reservations]) => ({
        source,
        label: sourceDisplayName(source),
        external: source === "thefork" || source === "dish",
        reservations,
        activeReservations: reservations,
        covers: 0,
        cancelled: 0,
        noShow: 0,
        completed: 0,
        reservationShare: 0,
        coverShare: 0,
        cancellationRate: 0,
        noShowRate: 0,
      }));
  const sourceTotal = sourceBreakdown.reduce((sum, row) => sum + row.reservations, 0);
  const sourceSlices = sourceBreakdown.map((row) => ({
    label: sourceDisplayName(row.source, row.label),
    value: row.reservations,
    color: SOURCE_COLORS[row.source] ?? "#94a3b8",
  }));
  const externalSummary =
    data?.externalSummary ??
    (() => {
      const providers = sourceBreakdown.filter((row) => row.external);
      const reservations = providers.reduce((sum, row) => sum + row.reservations, 0);
      const covers = providers.reduce((sum, row) => sum + row.covers, 0);
      return {
        reservations,
        activeReservations: providers.reduce((sum, row) => sum + row.activeReservations, 0),
        covers,
        cancelled: providers.reduce((sum, row) => sum + row.cancelled, 0),
        noShow: providers.reduce((sum, row) => sum + row.noShow, 0),
        reservationShare: sourceTotal ? Math.round((reservations / sourceTotal) * 1000) / 10 : 0,
        coverShare: totalCovers ? Math.round((covers / totalCovers) * 1000) / 10 : 0,
        providers,
      };
    })();
  const maxExternalProviderReservations = Math.max(
    ...externalSummary.providers.map((row) => row.reservations),
    1,
  );

  const nvr = data?.newVsReturning;
  const nvrTotal = (nvr?.new ?? 0) + (nvr?.returning ?? 0);
  const nvrSlices = [
    { label: am.analytics.newGuests, value: nvr?.new ?? 0, color: "#34d399" },
    { label: am.analytics.returningGuests, value: nvr?.returning ?? 0, color: "#818cf8" },
  ];

  function inlineBarEnter(
    e: React.MouseEvent,
    key: string,
    title: string,
    lines: string[],
  ) {
    setPageHovered(key);
    setPageTip({ x: e.clientX, y: e.clientY, title, lines });
  }
  function inlineBarMove(e: React.MouseEvent) {
    setPageTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : null));
  }
  function inlineBarLeave() {
    clearPageTip();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">{am.analytics.title}</h1>
        <div className="flex gap-1">
          {periods.map((p) => (
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
                  hint={
                    totalReservations > 0
                      ? am.analytics.hintAvgPerDay(
                          (totalReservations / periodDays).toFixed(1),
                        )
                      : am.analytics.hintNoBookings
                  }
                />
                <StatCard
                  label={am.analytics.covers}
                  value={String(totalCovers)}
                  hint={
                    totalCovers > 0
                      ? am.analytics.hintAvgGuestsPerDay(
                          (totalCovers / periodDays).toFixed(1),
                        )
                      : undefined
                  }
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
                  sub={
                    data.rates
                      ? `${data.rates.noShow} no-shows of ${data.rates.total}`
                      : undefined
                  }
                />
                <StatCard
                  label={am.analytics.cancelRate}
                  value={data.rates ? `${data.rates.cancelledRate}%` : "—"}
                  hint={am.analytics.hintCancelRate}
                  sub={
                    data.rates
                      ? `${data.rates.cancelled} cancellations of ${data.rates.total}`
                      : undefined
                  }
                />
              </div>
            );
          })()}

          {/* Daily bar chart */}
          <div className={section}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm uppercase tracking-widest text-on-surface-variant">
                {metric === "covers" ? am.analytics.covers : am.analytics.reservations}{" "}
                {am.analytics.byDay}
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
                <span className="text-xs text-on-surface-variant/60">
                  {am.analytics.peakHint}
                </span>
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

          {/* External booking sources */}
          <div className={section}>
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h2 className="font-semibold text-sm uppercase tracking-widest text-on-surface-variant">
                {am.analytics.externalSources}
              </h2>
              <span className="text-xs text-on-surface-variant/60">
                {am.analytics.externalSourcesHint}
              </span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3 border-y border-outline-variant/20 py-3">
              <div>
                <div className="text-2xl font-semibold tabular-nums">
                  {externalSummary.reservations}
                </div>
                <div className="text-[11px] uppercase tracking-widest text-on-surface-variant mt-1">
                  {am.analytics.externalBookings}
                </div>
                <div className="text-[11px] text-on-surface-variant/60 mt-0.5">
                  {externalSummary.reservationShare}% {am.analytics.ofReservations}
                </div>
              </div>
              <div>
                <div className="text-2xl font-semibold tabular-nums">
                  {externalSummary.covers}
                </div>
                <div className="text-[11px] uppercase tracking-widest text-on-surface-variant mt-1">
                  {am.analytics.externalCovers}
                </div>
                <div className="text-[11px] text-on-surface-variant/60 mt-0.5">
                  {externalSummary.coverShare}% {am.analytics.ofCovers}
                </div>
              </div>
              <div>
                <div className="text-2xl font-semibold tabular-nums">
                  {externalSummary.cancelled}
                </div>
                <div className="text-[11px] uppercase tracking-widest text-on-surface-variant mt-1">
                  {am.analytics.cancelled}
                </div>
                <div className="text-[11px] text-on-surface-variant/60 mt-0.5">
                  {am.analytics.fromExternalSources}
                </div>
              </div>
              <div>
                <div className="text-2xl font-semibold tabular-nums">
                  {externalSummary.noShow}
                </div>
                <div className="text-[11px] uppercase tracking-widest text-on-surface-variant mt-1">
                  {am.analytics.noShow}
                </div>
                <div className="text-[11px] text-on-surface-variant/60 mt-0.5">
                  {am.analytics.fromExternalSources}
                </div>
              </div>
            </div>
            {externalSummary.providers.length > 0 ? (
              <div className="space-y-2" onMouseLeave={inlineBarLeave}>
                {externalSummary.providers.map((provider) => {
                  const pct = Math.round((provider.reservations / maxExternalProviderReservations) * 100);
                  const key = `source-${provider.source}`;
                  const label = sourceDisplayName(provider.source, provider.label);
                  return (
                    <HoverableBarRow
                      key={provider.source}
                      label={label}
                      pct={pct}
                      detail={`${provider.reservations} res · ${provider.covers} cov`}
                      tipTitle={label}
                      tipLines={[
                        `${provider.reservations} ${am.analytics.reservations.toLowerCase()}`,
                        `${provider.covers} ${am.analytics.covers.toLowerCase()}`,
                        `${provider.cancelled} ${am.analytics.cancelled.toLowerCase()} · ${provider.cancellationRate}%`,
                        `${provider.noShow} ${am.analytics.noShow.toLowerCase()} · ${provider.noShowRate}%`,
                      ]}
                      dimmed={pageHovered !== null && pageHovered !== key}
                      onEnter={(e) =>
                        inlineBarEnter(e, key, label, [
                          `${provider.reservations} ${am.analytics.reservations.toLowerCase()}`,
                          `${provider.covers} ${am.analytics.covers.toLowerCase()}`,
                          `${provider.reservationShare}% ${am.analytics.ofReservations}`,
                          `${provider.coverShare}% ${am.analytics.ofCovers}`,
                          `${provider.cancelled} ${am.analytics.cancelled.toLowerCase()} · ${provider.cancellationRate}%`,
                          `${provider.noShow} ${am.analytics.noShow.toLowerCase()} · ${provider.noShowRate}%`,
                        ])
                      }
                      onMove={inlineBarMove}
                      onLeave={inlineBarLeave}
                    />
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-on-surface-variant/60">
                {am.analytics.noExternalSources}
              </p>
            )}
          </div>

          {/* Review requests */}
          <div className={section}>
            <h2 className="font-semibold text-sm uppercase tracking-widest text-on-surface-variant mb-2">
              {am.analytics.feedbackTitle}
            </h2>
            {data.feedback.sent === 0 ? (
              <p className="text-sm text-on-surface-variant/60">
                {am.analytics.feedbackNone}
              </p>
            ) : (
              <div>
                <div className="text-2xl font-bold text-primary">{data.feedback.sent}</div>
                <div className="text-xs text-on-surface-variant mt-0.5">
                  {am.analytics.feedbackRequests(data.feedback.sent)}
                </div>
              </div>
            )}
          </div>
          {/* By offering */}
          {multiOffering && data.byOffering && data.byOffering.length > 0 && (
            <div className={section}>
              <h2 className="font-semibold text-sm uppercase tracking-widest text-on-surface-variant mb-1">
                {am.analytics.byOffering}
              </h2>
              <div className="space-y-2" onMouseLeave={inlineBarLeave}>
                {data.byOffering.map((o) => {
                  const maxCovers = Math.max(
                    ...data.byOffering!.map((x) => x.covers),
                    1,
                  );
                  const pct = Math.round((o.covers / maxCovers) * 100);
                  const key = `offering-${o.offering}`;
                  return (
                    <HoverableBarRow
                      key={o.offering}
                      label={offeringName(o.offering)}
                      pct={pct}
                      detail={`${o.reservations} res · ${o.covers} cov`}
                      tipTitle={offeringName(o.offering)}
                      tipLines={[
                        `${o.reservations} reservations`,
                        `${o.covers} covers`,
                      ]}
                      dimmed={pageHovered !== null && pageHovered !== key}
                      onEnter={(e) =>
                        inlineBarEnter(e, key, offeringName(o.offering), [
                          `${o.reservations} reservations`,
                          `${o.covers} covers`,
                        ])
                      }
                      onMove={inlineBarMove}
                      onLeave={inlineBarLeave}
                    />
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
              <div className="space-y-2" onMouseLeave={inlineBarLeave}>
                {data.byService.map((s) => {
                  const maxCovers = Math.max(
                    ...data.byService.map((x) => x.covers),
                    1,
                  );
                  const pct = Math.round((s.covers / maxCovers) * 100);
                  const key = `service-${s.offering || "main"}-${s.service}`;
                  const label = multiOffering
                    ? `${offeringName(s.offering)} · ${s.service}`
                    : s.service;
                  return (
                    <HoverableBarRow
                      key={key}
                      label={label}
                      pct={pct}
                      detail={`${s.reservations} res · ${s.covers} cov`}
                      tipTitle={label}
                      tipLines={[
                        `${s.reservations} reservations`,
                        `${s.covers} covers`,
                      ]}
                      dimmed={pageHovered !== null && pageHovered !== key}
                      onEnter={(e) =>
                        inlineBarEnter(e, key, label, [
                          `${s.reservations} reservations`,
                          `${s.covers} covers`,
                        ])
                      }
                      onMove={inlineBarMove}
                      onLeave={inlineBarLeave}
                    />
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

            {/* Table utilization */}
            {data.tableUtilization && data.tableUtilization.length > 0 && (
              <div className={section}>
                <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
                  <h2 className="font-semibold text-sm uppercase tracking-widest text-on-surface-variant">
                    {am.analytics.tableUtilization}
                  </h2>
                  <span className="text-xs text-on-surface-variant/60">
                    {am.analytics.tableUtilHint}
                  </span>
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

          {/* Waitlist summary */}
          {data.waitlist && data.waitlist.total > 0 && (
            <div className={section}>
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h2 className="font-semibold text-sm uppercase tracking-widest text-on-surface-variant">
                  {am.analytics.waitlistTitle}
                </h2>
                <span className="text-xs text-on-surface-variant/60">
                  {am.analytics.waitlistHint}
                </span>
              </div>
              <WaitlistFunnel waitlist={data.waitlist} />
              <div className="hidden">
                <StatCard
                  label={am.analytics.wlTotal}
                  value={String(data.waitlist.total)}
                />
                <StatCard
                  label={am.analytics.wlSeated}
                  value={String(data.waitlist.seated)}
                />
                <StatCard
                  label={am.analytics.wlLeft}
                  value={String(data.waitlist.left)}
                />
                <StatCard
                  label={am.analytics.wlConversion}
                  value={`${data.waitlist.conversionRate}%`}
                />
                <StatCard
                  label={am.analytics.wlAvgWait}
                  value={
                    data.waitlist.avgQuotedWait ? `${data.waitlist.avgQuotedWait}` : "—"
                  }
                  sub={
                    data.waitlist.avgQuotedWait ? am.analytics.minUnit : undefined
                  }
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Page-level tooltip for inline bar rows */}
      {pageTip && <Tip tip={pageTip} />}
    </div>
  );
}

function StarIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="m12 2.8 2.78 5.63 6.22.9-4.5 4.39 1.06 6.19L12 17l-5.56 2.91 1.06-6.19L3 9.33l6.22-.9L12 2.8z" />
    </svg>
  );
}
