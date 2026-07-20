// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminFetch, adminJson, toast } from "@/components/admin/api";

function mockFetch(status: number, body: unknown = {}) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

afterEach(() => vi.restoreAllMocks());

describe("adminFetch", () => {
  beforeEach(() => {
    // jsdom won't navigate; provide a writable location stub.
    Object.defineProperty(window, "location", {
      value: { pathname: "/admin/acme/reservations", href: "" },
      writable: true,
      configurable: true,
    });
  });

  it("returns the response on success", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { ok: true }));
    const res = await adminFetch("/api/admin/reservations");
    expect(res.status).toBe(200);
  });

  it("redirects to the tenant's login and throws on 401", async () => {
    vi.stubGlobal("fetch", mockFetch(401));
    await expect(adminFetch("/api/admin/reservations")).rejects.toThrow(/session expired/i);
    expect(window.location.href).toBe("/admin/acme/login?next=%2Fadmin%2Facme%2Freservations");
  });
});

describe("adminJson", () => {
  it("parses JSON on success", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { reservations: [1, 2] }));
    const data = await adminJson<{ reservations: number[] }>("/x");
    expect(data.reservations).toEqual([1, 2]);
  });
  it("throws the server error message on non-2xx", async () => {
    vi.stubGlobal("fetch", mockFetch(500, { error: "Boom" }));
    await expect(adminJson("/x")).rejects.toThrow("Boom");
  });
  it("throws a generic message when no error field is present", async () => {
    vi.stubGlobal("fetch", mockFetch(400, {}));
    await expect(adminJson("/x")).rejects.toThrow(/request failed/i);
  });
});

describe("toast", () => {
  afterEach(() => {
    document.getElementById("admin-toast")?.remove();
  });
  it("creates a single reusable toast element and updates its content", () => {
    toast("Saved");
    const el = document.getElementById("admin-toast");
    expect(el).toBeInTheDocument();
    expect(el).toHaveTextContent("Saved");

    toast("Could not save", "error");
    expect(document.querySelectorAll("#admin-toast")).toHaveLength(1); // reused, not duplicated
    expect(document.getElementById("admin-toast")).toHaveTextContent("Could not save");
  });

  it("animates in then auto-hides via timers", () => {
    vi.useFakeTimers();
    try {
      toast("Hi");
      const el = document.getElementById("admin-toast")!;
      vi.advanceTimersByTime(20); // show
      expect(el.style.opacity).toBe("1");
      vi.advanceTimersByTime(3000); // auto-hide
      expect(el.style.opacity).toBe("0");
    } finally {
      vi.useRealTimers();
    }
  });
});
