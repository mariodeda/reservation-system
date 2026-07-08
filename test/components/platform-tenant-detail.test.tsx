// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { platformJson, platformFetch, toast, push } = vi.hoisted(() => ({
  platformJson: vi.fn(),
  platformFetch: vi.fn(),
  toast: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "tenant-1" }),
  useRouter: () => ({ push }),
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

import TenantDetail from "@/app/platform/(console)/tenants/[id]/page";
import { hydrateLocale } from "@/i18n";

const tenant = {
  id: "tenant-1",
  slug: "acme",
  name: "Acme Osteria",
  status: "active",
  publicKey: "pk_acme",
  createdAt: "2026-07-01T10:00:00Z",
  hosts: ["acme.example.com"],
  settings: {
    name: "Acme Osteria",
    url: "https://acme.example.com",
    contactEmail: "hello@acme.example.com",
    contactPhone: "+390000000",
    locale: "it-IT",
    timezone: "Europe/Rome",
    autoConfirm: true,
    emailEnabled: true,
    emailEvents: { bookingConfirmation: true, feedbackRequest: true, reservationReminder: true, cancellationConfirmation: true },
    feedbackRequestDelayHours: 24,
    reminderLeadHours: 12,
    feedbackEnabled: true,
    allowedOrigins: ["https://acme.example.com"],
    reviewUrl: "https://reviews.example.com/acme",
    smtpPassSet: true,
    smtp: { host: "smtp.acme.com", port: 587, secure: false, user: "mailer", from: "Acme <book@acme.example.com>" },
    emailTemplates: {
      confirmation: { subject: "Confirmed", text: "Text", html: "<p>Html</p>" },
      feedbackRequest: { subject: "Review", text: "Text", html: "<p>Html</p>" },
      reminder: { subject: "Reminder", text: "Text", html: "<p>Html</p>" },
      cancellation: { subject: "Cancelled", text: "Text", html: "<p>Html</p>" },
    },
  },
};

beforeEach(() => {
  localStorage.setItem("admin-locale", "it");
  hydrateLocale();
  platformJson.mockReset();
  platformFetch.mockReset();
  toast.mockReset();
  push.mockReset();
  platformJson.mockImplementation((url: string) => {
    if (url === "/api/platform/tenants/tenant-1") return Promise.resolve({ tenant });
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TenantDetail", () => {
  it("renders all email event toggles in the platform email flow panel", async () => {
    render(<TenantDetail />);

    await screen.findByRole("heading", { name: "Acme Osteria" });
    expect(screen.getByRole("checkbox", { name: "Email di conferma prenotazione" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Email di richiesta recensione post-visita" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Email promemoria pre-visita" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Email di cancellazione" })).toBeInTheDocument();
    expect(screen.getByLabelText("Anticipo promemoria (ore prima della prenotazione)")).toHaveAttribute("min", "1");
  });

  it("loads reminder and cancellation email presets into their template fields", async () => {
    const user = userEvent.setup();
    render(<TenantDetail />);

    await screen.findByRole("heading", { name: "Acme Osteria" });
    const subjectInputs = screen.getAllByLabelText("Oggetto");

    await user.click(screen.getByRole("button", { name: "Friendly Reminder" }));
    expect(subjectInputs[2]).toHaveValue("Reminder: your reservation at {{restaurantName}}");
    expect(toast).toHaveBeenCalledWith('Preimpostazione "Friendly Reminder" caricata');

    await user.click(screen.getByRole("button", { name: "Clear Cancellation" }));
    expect(subjectInputs[3]).toHaveValue("Your reservation at {{restaurantName}} has been cancelled");
    expect(toast).toHaveBeenCalledWith('Preimpostazione "Clear Cancellation" caricata');
  });

  it("starts impersonation from the tenant detail action bar", async () => {
    const user = userEvent.setup();
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("operator-pass");
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    platformFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, url: "/admin/acme" }),
    });

    render(<TenantDetail />);

    await screen.findByRole("heading", { name: "Acme Osteria" });
    await user.click(screen.getByRole("button", { name: "Impersona" }));

    expect(prompt).toHaveBeenCalled();
    expect(platformFetch).toHaveBeenCalledWith("/api/platform/tenants/tenant-1/impersonation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operatorPassword: "operator-pass" }),
    });
    expect(open).toHaveBeenCalledWith("/admin/acme", "_blank", "noopener");
  });
});
