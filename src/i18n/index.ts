import { am as en } from "./admin";
import { it } from "./it";

export type Locale = "en" | "it";

const LOCALE_KEY = "admin-locale";
type Messages = typeof en;

let activeLocale: Locale = "it";
let hydrated = false;

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return "it";
  try {
    const saved = localStorage.getItem(LOCALE_KEY);
    return saved === "en" || saved === "it" ? saved : "it";
  } catch {
    return "it";
  }
}

export function getLocale(): Locale {
  return hydrated ? activeLocale : "it";
}

export function hydrateLocale(): Locale {
  hydrated = true;
  activeLocale = readStoredLocale();
  return activeLocale;
}

export function setLocale(locale: Locale): void {
  activeLocale = locale;
  hydrated = true;
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // ignore
  }
  window.location.reload();
}

export const am = new Proxy({} as Messages, {
  get(_target, prop: keyof Messages) {
    const messages = getLocale() === "it" ? it : en;
    return messages[prop];
  },
});
