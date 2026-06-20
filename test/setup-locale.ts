// Set locale to English for all component tests so English string matchers keep working.
if (typeof localStorage !== "undefined") {
  localStorage.setItem("admin-locale", "en");
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
