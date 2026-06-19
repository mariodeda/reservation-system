"use client";

/**
 * Admin client helpers: a 401-aware fetch (auto-redirects to login when the
 * session lapses) and a tiny self-contained toast for action feedback.
 */

export async function adminFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, { cache: "no-store", ...init });
  if (res.status === 401 && typeof window !== "undefined") {
    // Bounce to the current tenant's login (/admin/<slug>/login), inferred from
    // the path we're on. Fall back to the bare /admin landing if absent.
    const slug = window.location.pathname.match(/^\/admin\/([^/]+)/)?.[1];
    const next = encodeURIComponent(window.location.pathname);
    window.location.href = slug ? `/admin/${slug}/login?next=${next}` : "/admin";
    throw new Error("Session expired");
  }
  return res;
}

/** adminFetch + JSON parse; throws Error(message) on non-2xx. */
export async function adminJson<T = unknown>(input: string, init?: RequestInit): Promise<T> {
  const res = await adminFetch(input, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Request failed");
  return data as T;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(message: string, type: "ok" | "error" = "ok"): void {
  if (typeof document === "undefined") return;
  let el = document.getElementById("admin-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "admin-toast";
    el.style.cssText =
      "position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(8px);z-index:300;" +
      "padding:10px 18px;border-radius:8px;font:600 14px/1.3 var(--font-montserrat),system-ui,sans-serif;" +
      "box-shadow:0 12px 40px rgba(0,0,0,.45);opacity:0;transition:opacity .25s,transform .25s;" +
      "pointer-events:none;max-width:90vw;text-align:center";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.style.background = type === "error" ? "#7f1d1d" : "var(--brand-primary, #f2ca50)";
  el.style.color = type === "error" ? "#fff" : "var(--brand-on-primary, #3c2f00)";
  setTimeout(() => {
    el!.style.opacity = "1";
    el!.style.transform = "translateX(-50%) translateY(0)";
  }, 10);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el!.style.opacity = "0";
    el!.style.transform = "translateX(-50%) translateY(8px)";
  }, 2600);
}
