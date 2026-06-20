import { am as en } from "./admin";
import { it } from "./it";

export type Locale = "en" | "it";

const LOCALE_KEY = "admin-locale";

export function getLocale(): Locale {
  if (typeof window === "undefined") return "it";
  try {
    return (localStorage.getItem(LOCALE_KEY) as Locale) ?? "it";
  } catch {
    return "it";
  }
}

export function setLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // ignore
  }
  window.location.reload();
}

export const am = getLocale() === "it" ? it : en;
