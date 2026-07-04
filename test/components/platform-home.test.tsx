// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { platformJson, platformFetch, toast } = vi.hoisted(() => ({
  platformJson: vi.fn(),
  platformFetch: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/components/platform/api", async () => {
  const actual = await vi.importActual<typeof import("@/components/platform/api")>("@/components/platform/api");
  return {
    ...actual,
    platformJson,
    platformFetch,
    toast,
  };
});

import PlatformHome from "@/app/platform/(console)/page";
import { hydrateLocale } from "@/i18n";

beforeEach(() => {
  localStorage.setItem("admin-locale", "it");
  hydrateLocale();
  platformJson.mockReset();
  platformFetch.mockReset();
  toast.mockReset();
  platformJson.mockImplementation((url: string) => {
    if (url === "/api/platform/tenants") {
      return Promise.resolve({
        tenants: [
          {
            id: "tenant-1",
            slug: "acme",
            name: "Acme Osteria",
            status: "active",
            publicKey: "pk_acme",
            createdAt: "2026-07-01T10:00:00Z",
            hosts: ["acme.example.com"],
            settings: {
              name: "Acme Osteria",
              url: "",
              contactEmail: "",
              contactPhone: "",
              locale: "it-IT",
              timezone: "Europe/Rome",
              autoConfirm: true,
              emailEnabled: true,
              emailEvents: { bookingConfirmation: true, feedbackRequest: true },
              smtpPassSet: true,
              smtp: { host: "smtp.acme.com", port: 587, secure: false, user: "mailer" },
              emailTemplates: {
                confirmation: { subject: "Confirmed", text: "Text", html: "<p>Html</p>" },
              },
            },
            smtpHealth: {
              status: "ok",
              checkedAt: "2026-07-01T10:00:00Z",
              latencyMs: 42,
            },
            externalSync: {
              theFork: {
                enabled: true,
                configured: true,
                lastSyncAt: "2026-07-01T10:00:00Z",
              },
              dish: {
                enabled: true,
                configured: false,
                lastError: "Missing establishment id",
              },
            },
          },
          {
            id: "tenant-2",
            slug: "beta",
            name: "Beta Trattoria",
            status: "active",
            publicKey: "pk_beta",
            createdAt: "2026-07-01T10:00:00Z",
            hosts: [],
            settings: {
              name: "Beta Trattoria",
              url: "",
              contactEmail: "",
              contactPhone: "",
              locale: "it-IT",
              timezone: "Europe/Rome",
              autoConfirm: true,
              emailEnabled: false,
              smtpPassSet: false,
            },
            smtpHealth: { status: "unknown" },
            externalSync: {
              theFork: { enabled: false, configured: false },
              dish: { enabled: false, configured: false },
            },
          },
        ],
      });
    }
    if (url === "/api/platform/analytics") {
      return Promise.resolve({
        totals: { reservations: 0, last30: 0, tenants: 2 },
        byTenant: {},
      });
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PlatformHome", () => {
  it("shows each restaurant's email feature status on the summary card", async () => {
    render(<PlatformHome />);

    expect(await screen.findByText("Acme Osteria")).toBeInTheDocument();
    expect(screen.getByText("Conferme: Attiva")).toBeInTheDocument();
    expect(screen.getByText("Feedback: Disattiva")).toBeInTheDocument();
    expect(screen.getByText("SMTP: Connesso")).toBeInTheDocument();

    expect(screen.getByText("Beta Trattoria")).toBeInTheDocument();
    expect(screen.getByText("Email disattivate")).toBeInTheDocument();
    expect(screen.getAllByText("SMTP: Non configurato").length).toBeGreaterThan(0);
  });

  it("shows external sync status on each restaurant summary card", async () => {
    render(<PlatformHome />);

    expect(await screen.findByText("Acme Osteria")).toBeInTheDocument();
    expect(screen.getByText("TheFork: Sync attivo")).toBeInTheDocument();
    expect(screen.getByText("DISH: Non configurato")).toBeInTheDocument();

    expect(screen.getByText("Beta Trattoria")).toBeInTheDocument();
    expect(screen.getAllByText("TheFork: Sync disattivo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("DISH: Sync disattivo").length).toBeGreaterThan(0);
  });

  it("lets platform admins manually trigger SMTP checks", async () => {
    const user = userEvent.setup();
    platformFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, checked: 2 }),
    });
    render(<PlatformHome />);

    await screen.findByText("Acme Osteria");
    await user.click(screen.getByRole("button", { name: "Verifica SMTP" }));

    expect(platformFetch).toHaveBeenCalledWith("/api/platform/cron/smtp-health", { method: "POST" });
    expect(toast).toHaveBeenCalledWith("SMTP verificato per 2 ristoranti.");
    expect(platformJson).toHaveBeenCalledWith("/api/platform/tenants");
  });

  it("does not show impersonation actions on restaurant summary cards", async () => {
    render(<PlatformHome />);

    await screen.findByText("Acme Osteria");
    expect(screen.queryByRole("button", { name: /imperson/i })).not.toBeInTheDocument();
  });
});
