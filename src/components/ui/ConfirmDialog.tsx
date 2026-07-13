"use client";

import { useEffect } from "react";
import { useBodyScrollLock } from "./useBodyScrollLock";

export function ConfirmDialog({
  open,
  title,
  body,
  warning,
  confirmLabel,
  cancelLabel = "Cancel",
  busy = false,
  busyLabel,
  destructive = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  warning?: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  busyLabel?: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel, open]);

  if (!open) return null;

  const tone = destructive
    ? {
        border: "border-rose-500/35",
        header: "bg-rose-500/10",
        icon: "border-rose-500/35 bg-rose-500/15 text-rose-300",
        warning: "border-rose-500/30 bg-rose-500/10 text-rose-300",
        action: "border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/20",
      }
    : {
        border: "border-outline-variant/40",
        header: "bg-primary/10",
        icon: "border-primary/35 bg-primary/15 text-primary",
        warning: "border-amber-400/30 bg-amber-400/10 text-amber-300",
        action: "border-primary/40 bg-primary/15 text-primary hover:bg-primary/20",
      };

  return (
    <div
      className="fixed inset-0 z-[260] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className={`w-full max-w-md overflow-hidden rounded-xl border ${tone.border} bg-surface-container text-on-surface shadow-2xl`}
      >
        <div className={`flex items-start gap-3 border-b border-outline-variant/30 px-4 py-4 ${tone.header}`}>
          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${tone.icon}`}>
            {destructive ? <TrashIcon /> : <ConfirmIcon />}
          </span>
          <div className="min-w-0">
            <h2 id="confirm-dialog-title" className="text-base font-semibold text-on-surface">
              {title}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
              {body}
            </p>
          </div>
        </div>
        <div className="space-y-4 px-4 py-4">
          {warning && (
            <div className={`rounded-lg border px-3 py-2 text-sm font-medium ${tone.warning}`}>
              {warning}
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="h-10 rounded-lg border border-outline-variant/40 px-4 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className={`h-10 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50 ${tone.action}`}
            >
              {busy ? busyLabel || confirmLabel : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 4h11" />
      <path d="M6.5 2.5h3L10.5 4h-5l1-1.5Z" />
      <path d="M4 4.5 4.6 13h6.8l.6-8.5" />
      <path d="M6.8 6.5v4.5M9.2 6.5v4.5" />
    </svg>
  );
}

function ConfirmIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 8.2 6.6 11.3 12.5 4.7" />
    </svg>
  );
}
