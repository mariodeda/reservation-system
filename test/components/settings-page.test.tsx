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
    adminJson.mockResolvedValueOnce({ feedbackRequestsEnabled: false, feedbackAutoSendEnabled: true });
    render(<SettingsPage />);

    expect(await screen.findByText("Email preferences")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /automatically send review emails/i })).toBeDisabled();
    expect(screen.getByText(/disabled by the platform/i)).toBeInTheDocument();
  });

  it("saves the feedback auto-send preference when enabled", async () => {
    const user = userEvent.setup();
    adminJson
      .mockResolvedValueOnce({ feedbackRequestsEnabled: true, feedbackAutoSendEnabled: true })
      .mockResolvedValueOnce({ feedbackRequestsEnabled: true, feedbackAutoSendEnabled: false });
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
});
