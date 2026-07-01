// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { adminJson } = vi.hoisted(() => ({ adminJson: vi.fn() }));
vi.mock("@/components/admin/api", () => ({ adminJson }));

import AdminEmailLogsPage from "@/app/admin/[slug]/(panel)/email-logs/page";

beforeEach(() => {
  adminJson.mockReset();
  adminJson.mockResolvedValue({
    emails: [
      {
        id: "email-1",
        tenantId: "tenant-1",
        reservationId: "reservation-1",
        type: "bookingConfirmation",
        status: "sent",
        toEmail: "sent@example.com",
        createdAt: "2026-07-01T10:00:00.000Z",
      },
      {
        id: "email-2",
        tenantId: "tenant-1",
        reservationId: "reservation-2",
        type: "feedbackRequest",
        status: "failed",
        reason: "recipient_rejected",
        error: "SMTP rejected recipient",
        toEmail: "failed@example.com",
        createdAt: "2026-07-01T11:00:00.000Z",
      },
      {
        id: "email-3",
        tenantId: "tenant-1",
        reservationId: "reservation-3",
        type: "bookingConfirmation",
        status: "skipped",
        reason: "no_smtp",
        toEmail: "skipped@example.com",
        createdAt: "2026-07-01T12:00:00.000Z",
      },
    ],
  });
});

describe("AdminEmailLogsPage", () => {
  it("renders all email states and applies filters", async () => {
    const user = userEvent.setup();
    render(<AdminEmailLogsPage />);

    expect(await screen.findByText("sent")).toBeInTheDocument();
    expect(screen.getAllByText("failed").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("skipped").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("recipient_rejected")).toBeInTheDocument();
    expect(screen.getByText("no_smtp")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Type"), "feedbackRequest");
    await user.selectOptions(screen.getByLabelText("Status"), "failed");
    await user.type(screen.getByLabelText("Search"), "failed@example.com");
    await user.click(screen.getByRole("button", { name: /apply filters/i }));

    await waitFor(() => expect(adminJson).toHaveBeenCalledTimes(2));
    const url = adminJson.mock.calls.at(-1)?.[0] as string;
    expect(url).toContain("/api/admin/email-logs?");
    expect(url).toContain("type=feedbackRequest");
    expect(url).toContain("status=failed");
    expect(url).toContain("q=failed%40example.com");
  });

  it("shows empty state when no email attempts match", async () => {
    adminJson.mockResolvedValueOnce({ emails: [] });
    render(<AdminEmailLogsPage />);
    expect(await screen.findByText("No email attempts match the current filters.")).toBeInTheDocument();
  });
});
