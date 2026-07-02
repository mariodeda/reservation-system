import type { ReservationStatus } from "@/lib/reservations/types";
import { am } from "@/i18n";

export interface AdminReservation {
  id: string;
  reference: string;
  date: string;
  time: string;
  /** Which offering this booking belongs to (defaults to "main"). */
  offering?: string;
  service: string;
  partySize: number;
  name: string;
  email: string;
  phone: string;
  occasion?: string;
  notes?: string;
  tableLabel?: string;
  tableId?: string;
  durationMinsOverride?: number | null;
  status: ReservationStatus;
  source: "web" | "admin";
  createdAt: string;
  updatedAt: string;
  /** Populated when loading a day list — total non-cancelled visits for this email. */
  visitCount?: number;
  /** True if the guest has a VIP customer profile. */
  customerVip?: boolean;
  /** Dietary / allergy notes from the customer profile. */
  dietaryNotes?: string;
  /** Set when a feedback email has been sent for this reservation. */
  feedbackSentAt?: string | null;
  /** Latest outcome of each transactional email type (for send tracking). */
  emails?: Partial<Record<EmailType, EmailStatus>>;
}

/** The transactional email kinds we track per reservation. */
export type EmailType = "bookingConfirmation" | "feedbackRequest";

/** At-a-glance latest send outcome for one email type. */
export interface EmailStatus {
  status: "sent" | "failed" | "skipped";
  reason?: string;
  error?: string;
  at: string;
  attempts: number;
}

export const STATUS_META: Record<
  ReservationStatus,
  { label: string; badge: string }
> = {
  pending:   { get label() { return am.status.pending; },   badge: "bg-amber-400/15 text-amber-300 border-amber-400/30" },
  confirmed: { get label() { return am.status.confirmed; }, badge: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30" },
  seated:    { get label() { return am.status.seated; },    badge: "bg-sky-400/15 text-sky-300 border-sky-400/30" },
  completed: { get label() { return am.status.completed; }, badge: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30" },
  cancelled: { get label() { return am.status.cancelled; }, badge: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  no_show:   { get label() { return am.status.no_show; },   badge: "bg-rose-700/20 text-rose-300 border-rose-700/40" },
};

export function StatusBadge({ status }: { status: ReservationStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${m.badge}`}>
      {m.label}
    </span>
  );
}

/** Quick one-tap actions offered for each status (keeps staff to one click). */
export const QUICK_ACTIONS: Record<ReservationStatus, ReservationStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["seated", "no_show", "cancelled"],
  seated: ["completed"],
  completed: [],
  cancelled: ["confirmed"],
  no_show: ["confirmed"],
};

export function formatDateLong(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export function todayInTz(tz = "Europe/Rome"): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}
