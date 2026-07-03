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
    if (saved === "en" || saved === "it") return saved;
    const cookie = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${LOCALE_KEY}=`))
      ?.split("=")[1];
    return cookie === "en" || cookie === "it" ? cookie : "it";
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
    document.cookie = `${LOCALE_KEY}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // ignore
  }
  const url = new URL(window.location.href);
  url.searchParams.delete("lang");
  window.location.href = url.toString();
}

export const am = new Proxy({} as Messages, {
  get(_target, prop: keyof Messages) {
    const messages = getLocale() === "it" ? it : en;
    return messages[prop];
  },
});
