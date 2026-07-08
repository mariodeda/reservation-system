// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { adminJson, toast } = vi.hoisted(() => ({ adminJson: vi.fn(), toast: vi.fn() }));
vi.mock("@/components/admin/api", () => ({ adminJson, toast }));

import SettingsPage from "@/app/admin/[slug]/(panel)/settings/page";

beforeEach(() => {
  adminJson.mockReset();
  toast.mockReset();
});

describe("tenant settings page", () => {
  it("disables feedback auto-send when platform feedback emails are disabled", async () => {
    adminJson.mockImplementation((url: string) => {
      if (url === "/api/admin/settings/email") return Promise.resolve({ feedbackRequestsEnabled: false, feedbackAutoSendEnabled: true });
      if (url === "/api/admin/settings/capacity") return Promise.resolve({ capacityMode: "tables" });
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    render(<SettingsPage />);

    expect(await screen.findByText("Email preferences")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /automatically send review emails/i })).toBeDisabled();
    expect(screen.getByText(/disabled by the platform/i)).toBeInTheDocument();
  });

  it("saves the feedback auto-send preference when enabled", async () => {
    const user = userEvent.setup();
    adminJson.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/admin/settings/email" && init?.method === "PATCH") {
        return Promise.resolve({ feedbackRequestsEnabled: true, feedbackAutoSendEnabled: false });
      }
      if (url === "/api/admin/settings/email") return Promise.resolve({ feedbackRequestsEnabled: true, feedbackAutoSendEnabled: true });
      if (url === "/api/admin/settings/capacity") return Promise.resolve({ capacityMode: "tables" });
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    render(<SettingsPage />);

    const toggle = await screen.findByRole("checkbox", { name: /automatically send review emails/i });
    await user.click(toggle);

    await waitFor(() =>
      expect(adminJson).toHaveBeenCalledWith("/api/admin/settings/email", expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ feedbackAutoSendEnabled: false }),
      })),
    );
    expect(toast).toHaveBeenCalledWith("Email preferences saved.");
  });

  it("saves the tenant capacity mode preference", async () => {
    const user = userEvent.setup();
    adminJson.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/admin/settings/email") return Promise.resolve({ feedbackRequestsEnabled: true, feedbackAutoSendEnabled: true });
      if (url === "/api/admin/settings/capacity" && init?.method === "PATCH") return Promise.resolve({ capacityMode: "manual" });
      if (url === "/api/admin/settings/capacity") return Promise.resolve({ capacityMode: "tables" });
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    render(<SettingsPage />);

    const manual = await screen.findByRole("radio", { name: /use manual slot capacity/i });
    await user.click(manual);

    await waitFor(() =>
      expect(adminJson).toHaveBeenCalledWith("/api/admin/settings/capacity", expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ capacityMode: "manual" }),
      })),
    );
    expect(toast).toHaveBeenCalledWith("Capacity preferences saved.");
  });
});
