"use client";

export const DISMISS_ADMIN_TOOLTIPS_EVENT = "reservation-system:admin-tooltips-dismiss";

export function dismissAdminTooltips() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DISMISS_ADMIN_TOOLTIPS_EVENT));
}
