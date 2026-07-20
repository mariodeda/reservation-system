// Set locale to English for all component tests so English string matchers keep working.
export {};

const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const existingLocalStorage = localStorageDescriptor && "value" in localStorageDescriptor
  ? localStorageDescriptor.value as Storage | undefined
  : undefined;

if (
  typeof existingLocalStorage?.getItem !== "function" ||
  typeof existingLocalStorage?.setItem !== "function"
) {
  // Node 25 exposes a lazy global localStorage accessor that warns unless
  // --localstorage-file points at a valid path. Test code only needs an
  // in-memory shim, so install it before anything reads the native accessor.
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, String(value)),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    },
  });
}
globalThis.localStorage.setItem("admin-locale", "en");
const { hydrateLocale } = await import("@/i18n");
hydrateLocale();

// jsdom exposes scrollTo but does not implement it. Modal scroll-lock tests
// exercise scroll restoration, so provide a quiet no-op for DOM test files.
if (typeof window !== "undefined") {
  window.scrollTo = () => {};
}

// jsdom doesn't ship EventSource — stub it so AdminShell renders without crashing.
if (typeof EventSource === "undefined") {
  (globalThis as Record<string, unknown>).EventSource = class {
    addEventListener() {}
    removeEventListener() {}
    close() {}
    onerror: null = null;
  };
}
