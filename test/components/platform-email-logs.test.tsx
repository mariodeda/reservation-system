// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { platformJson } = vi.hoisted(() => ({ platformJson: vi.fn() }));

vi.mock("@/components/platform/api", async () => {
  const actual = await vi.importActual<typeof import("@/components/platform/api")>("@/components/platform/api");
  return {
    ...actual,
    platformJson,
  };
});

import PlatformEmailLogsPage from "@/app/platform/(console)/email-logs/page";

beforeEach(() => {
  platformJson.mockReset();
  platformJson.mockResolvedValue({
    tenants: [
      { id: "tenant-1", slug: "acme", name: "Acme Osteria", status: "active" },
    ],
    emails: [
      {
        id: "email-1",
        tenantId: "tenant-1",
        reservationId: "reservation-1",
        type: "bookingConfirmation",
        status: "failed",
        reason: "recipient_rejected",
        error: "SMTP rejected recipient",
        toEmail: "guest@example.com",
        createdAt: "2026-07-01T10:00:00.000Z",
      },
    ],
  });
});

describe("PlatformEmailLogsPage", () => {
  it("renders email attempts and applies filters", async () => {
    const user = userEvent.setup();
    render(<PlatformEmailLogsPage />);

    expect(await screen.findByText("Booking confirmation")).toBeInTheDocument();
    expect(screen.getByText("guest@example.com")).toBeInTheDocument();
    expect(screen.getByText("recipient_rejected")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Tenant"), "tenant-1");
    await user.selectOptions(screen.getByLabelText("Type"), "bookingConfirmation");
    await user.selectOptions(screen.getByLabelText("Status"), "failed");
    await user.type(screen.getByLabelText("Search"), "guest");
    await user.click(screen.getByRole("button", { name: /apply filters/i }));

    await waitFor(() => expect(platformJson).toHaveBeenCalledTimes(2));
    const url = platformJson.mock.calls.at(-1)?.[0] as string;
    expect(url).toContain("/api/platform/email-logs?");
    expect(url).toContain("tenantId=tenant-1");
    expect(url).toContain("type=bookingConfirmation");
    expect(url).toContain("status=failed");
    expect(url).toContain("q=guest");
  });

  it("shows empty state when no email attempts match", async () => {
    platformJson.mockResolvedValueOnce({ tenants: [], emails: [] });
    render(<PlatformEmailLogsPage />);
    expect(await screen.findByText("No email attempts match the current filters.")).toBeInTheDocument();
  });
});
