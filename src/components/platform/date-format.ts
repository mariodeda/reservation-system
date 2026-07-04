export function formatPlatformDateTime(value?: string | null, empty = "never"): string {
  if (!value) return empty;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const formatted = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);

  return `${formatted} (${formatRelativeTime(date)})`;
}

function formatRelativeTime(date: Date): string {
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (abs < 45) return rtf.format(0, "second");
  if (abs < 90) return rtf.format(Math.sign(diffSeconds), "minute");
  if (abs < 45 * 60) return rtf.format(Math.round(diffSeconds / 60), "minute");
  if (abs < 90 * 60) return rtf.format(Math.sign(diffSeconds), "hour");
  if (abs < 22 * 60 * 60) return rtf.format(Math.round(diffSeconds / 3600), "hour");
  if (abs < 36 * 60 * 60) return rtf.format(Math.sign(diffSeconds), "day");
  if (abs < 26 * 24 * 60 * 60) return rtf.format(Math.round(diffSeconds / 86400), "day");
  if (abs < 45 * 24 * 60 * 60) return rtf.format(Math.sign(diffSeconds), "month");
  if (abs < 320 * 24 * 60 * 60) return rtf.format(Math.round(diffSeconds / (30 * 86400)), "month");
  if (abs < 548 * 24 * 60 * 60) return rtf.format(Math.sign(diffSeconds), "year");
  return rtf.format(Math.round(diffSeconds / (365 * 86400)), "year");
}
