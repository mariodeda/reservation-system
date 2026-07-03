import type { Locale } from "@/i18n";

export default function LanguageFlag({ locale }: { locale: Locale }) {
  if (locale === "it") {
    return (
      <span data-testid={`language-flag-${locale}`} className="inline-flex h-4 w-6 overflow-hidden rounded-sm border border-outline-variant/40 shadow-sm" aria-hidden="true">
        <span className="h-full flex-1 bg-emerald-600" />
        <span className="h-full flex-1 bg-white" />
        <span className="h-full flex-1 bg-red-600" />
      </span>
    );
  }

  return (
    <span data-testid={`language-flag-${locale}`} className="relative inline-block h-4 w-6 overflow-hidden rounded-sm border border-outline-variant/40 bg-[#1f3f8b] shadow-sm" aria-hidden="true">
      <span className="absolute left-1/2 top-1/2 h-1 w-9 -translate-x-1/2 -translate-y-1/2 rotate-[34deg] bg-white" />
      <span className="absolute left-1/2 top-1/2 h-1 w-9 -translate-x-1/2 -translate-y-1/2 -rotate-[34deg] bg-white" />
      <span className="absolute left-1/2 top-1/2 h-0.5 w-9 -translate-x-1/2 -translate-y-1/2 rotate-[34deg] bg-red-600" />
      <span className="absolute left-1/2 top-1/2 h-0.5 w-9 -translate-x-1/2 -translate-y-1/2 -rotate-[34deg] bg-red-600" />
      <span className="absolute left-0 top-1/2 h-1.5 w-full -translate-y-1/2 bg-white" />
      <span className="absolute left-1/2 top-0 h-full w-1.5 -translate-x-1/2 bg-white" />
      <span className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-red-600" />
      <span className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-red-600" />
    </span>
  );
}
