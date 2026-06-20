// Set locale to English for all component tests so English string matchers keep working.
if (typeof localStorage !== "undefined") {
  localStorage.setItem("admin-locale", "en");
}
