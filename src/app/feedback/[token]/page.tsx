"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";

export const dynamic = "force-dynamic";

interface FeedbackData {
  token: string;
  filled: boolean;
  rating?: number;
  comment?: string;
  restaurantName: string;
  date: string;
  guestName: string;
}

function StarIcon({ filled, size = 32 }: { filled: boolean; size?: number }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill={filled ? "var(--brand-primary, #f2ca50)" : "none"}
      stroke="var(--brand-primary, #f2ca50)"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M10 1l2.4 6.3H19l-5.3 4 2 6.3L10 14l-5.7 3.6 2-6.3L1 7.3h6.6z" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--brand-primary, #f2ca50)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function BrokenLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--fb-muted, #888)" }}>
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

const RATING_LABELS = ["", "Poor", "Below average", "Average", "Good", "Excellent"];

function FeedbackForm({ token, data }: { token: string; data: FeedbackData }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(data.filled);
  const [error, setError] = useState("");

  if (done) {
    return (
      <div className="text-center space-y-4 py-8">
        <div className="flex justify-center">
          <CheckCircleIcon />
        </div>
        <h2 className="text-xl font-semibold" style={{ color: "var(--fb-heading, #1a1a1a)" }}>
          Thank you!
        </h2>
        <p style={{ color: "var(--fb-muted, #666)" }}>
          Your feedback means a lot to us.
        </p>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) { setError("Please select a rating."); return; }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/feedback/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed");
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit.");
    } finally {
      setBusy(false);
    }
  }

  const active = hover || rating;

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <p className="text-sm font-medium mb-3" style={{ color: "var(--fb-label, #444)" }}>
          How was your experience?
        </p>
        <div className="flex gap-1.5" role="group" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setRating(s)}
              onMouseEnter={() => setHover(s)}
              onMouseLeave={() => setHover(0)}
              className="transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 rounded"
              style={{ outlineColor: "var(--brand-primary, #f2ca50)" }}
              aria-label={`${s} star${s > 1 ? "s" : ""}`}
              aria-pressed={rating === s}
            >
              <StarIcon filled={s <= active} />
            </button>
          ))}
        </div>
        {active > 0 && (
          <p className="text-sm mt-1.5 font-medium" style={{ color: "var(--brand-primary, #f2ca50)", filter: "brightness(0.85)" }}>
            {RATING_LABELS[active]}
          </p>
        )}
      </div>

      <div>
        <label className="text-sm font-medium block mb-1.5" style={{ color: "var(--fb-label, #444)" }}>
          Any comments?{" "}
          <span className="font-normal" style={{ color: "var(--fb-muted, #888)" }}>
            (optional)
          </span>
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="What did you enjoy? Anything we can improve?"
          className="w-full rounded-lg px-3 py-2 text-sm resize-none transition-colors focus:outline-none"
          style={{
            border: "1.5px solid var(--fb-border, #d4d0c8)",
            color: "var(--fb-text, #1a1a1a)",
            background: "var(--fb-input-bg, #fff)",
          }}
          onFocus={(e) => (e.target.style.borderColor = "var(--brand-primary, #f2ca50)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--fb-border, #d4d0c8)")}
        />
      </div>

      {error && (
        <p className="text-sm font-medium" style={{ color: "var(--fb-error, #b91c1c)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !rating}
        className="w-full font-semibold py-3 rounded-lg transition-all disabled:opacity-50"
        style={{
          background: "var(--brand-primary, #f2ca50)",
          color: "var(--brand-on-primary, #3c2f00)",
        }}
        onMouseEnter={(e) => { if (!busy && rating) (e.currentTarget.style.filter = "brightness(1.08)"); }}
        onMouseLeave={(e) => { e.currentTarget.style.filter = ""; }}
      >
        {busy ? "Submitting…" : "Submit feedback"}
      </button>
    </form>
  );
}

function FeedbackPage() {
  const params = useParams();
  const token = String(params.token);
  const [data, setData] = useState<FeedbackData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/feedback/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Could not load feedback form."));
  }, [token]);

  /* Light-first design — uses CSS custom properties so the brand color
     propagates automatically if ever set via tenant theming.             */
  const pageStyle: React.CSSProperties = {
    "--fb-bg": "#f6f3ed",
    "--fb-card-bg": "#ffffff",
    "--fb-border": "#e0dbd0",
    "--fb-heading": "#1c1b17",
    "--fb-label": "#3c3830",
    "--fb-text": "#1c1b17",
    "--fb-muted": "#7a7060",
    "--fb-input-bg": "#fafaf8",
    "--fb-error": "#b91c1c",
  } as React.CSSProperties;

  const containerCls = "min-h-screen flex items-center justify-center p-4";
  const cardCls = "rounded-2xl p-8 w-full max-w-md shadow-sm";
  const cardStyle: React.CSSProperties = {
    background: "var(--fb-card-bg, #fff)",
    border: "1px solid var(--fb-border, #e0dbd0)",
  };

  if (error) {
    const isExpired = /invalid|expired|not found/i.test(error) || error === "Could not load feedback form.";
    return (
      <div style={{ ...pageStyle, background: "var(--fb-bg, #f6f3ed)" }} className={containerCls}>
        <div style={cardStyle} className={`${cardCls} text-center space-y-4`}>
          {isExpired ? (
            <>
              <div className="flex justify-center opacity-60">
                <BrokenLinkIcon />
              </div>
              <h2 className="text-base font-semibold" style={{ color: "var(--fb-heading, #1c1b17)" }}>
                Link unavailable
              </h2>
              <p className="text-sm" style={{ color: "var(--fb-muted, #7a7060)" }}>
                This feedback link has expired or is no longer valid. If you&rsquo;d like to share
                your experience, please contact the restaurant directly.
              </p>
            </>
          ) : (
            <p className="text-sm" style={{ color: "var(--fb-muted, #7a7060)" }}>{error}</p>
          )}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ ...pageStyle, background: "var(--fb-bg, #f6f3ed)" }} className={containerCls}>
        <div style={cardStyle} className={cardCls}>
          <div className="space-y-3 animate-pulse">
            <div className="h-4 rounded w-1/2" style={{ background: "var(--fb-border, #e0dbd0)" }} />
            <div className="h-3 rounded w-3/4" style={{ background: "var(--fb-border, #e0dbd0)" }} />
            <div className="h-3 rounded w-2/3" style={{ background: "var(--fb-border, #e0dbd0)" }} />
          </div>
        </div>
      </div>
    );
  }

  function formatDate(d: string) {
    if (!d) return "";
    const dt = new Date(`${d}T12:00:00Z`);
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }).format(dt);
  }

  return (
    <div style={{ ...pageStyle, background: "var(--fb-bg, #f6f3ed)" }} className={containerCls}>
      <div style={cardStyle} className={cardCls}>
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold" style={{ color: "var(--fb-heading, #1c1b17)" }}>
            {data.restaurantName}
          </h1>
          {data.guestName && data.date && (
            <p className="text-sm mt-1" style={{ color: "var(--fb-muted, #7a7060)" }}>
              {data.guestName} · {formatDate(data.date)}
            </p>
          )}
        </div>
        <FeedbackForm token={token} data={data} />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <FeedbackPage />
    </Suspense>
  );
}
