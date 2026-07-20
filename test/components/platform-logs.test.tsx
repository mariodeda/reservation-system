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

import PlatformLogsPage from "@/app/platform/(console)/logs/page";

beforeEach(() => {
  platformJson.mockReset();
  platformJson.mockResolvedValue({
    tenants: [
      { id: "tenant-1", slug: "acme", name: "Acme Osteria", status: "active" },
    ],
    events: [
      {
        id: "event-1",
        createdAt: "2026-07-01T10:00:00.000Z",
        level: "warn",
        event: "public.booking.rate_limited.ip",
        surface: "public",
        tenantId: "tenant-1",
        actorType: "guest",
        requestId: "req-1",
        reference: "ABC123",
        status: 429,
        reason: "ip",
        metadata: { safe: "visible" },
      },
    ],
  });
});

describe("PlatformLogsPage", () => {
  it("renders events and applies log filters", async () => {
    const user = userEvent.setup();
    render(<PlatformLogsPage />);

    expect(await screen.findByText("public.booking.rate_limited.ip")).toBeInTheDocument();
    expect(screen.getAllByText("Acme Osteria (acme)").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("ABC123")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Tenant"), "tenant-1");
    await user.selectOptions(screen.getByLabelText("Level"), "warn");
    await user.selectOptions(screen.getByLabelText("Surface"), "public");
    await user.type(screen.getByLabelText("Search"), "rate_limited");
    await user.type(screen.getByLabelText("Status"), "429");
    await user.click(screen.getByRole("button", { name: /apply filters/i }));

    await waitFor(() => expect(platformJson).toHaveBeenCalledTimes(2));
    const url = platformJson.mock.calls.at(-1)?.[0] as string;
    expect(url).toContain("/api/platform/logs?");
    expect(url).toContain("tenantId=tenant-1");
    expect(url).toContain("level=warn");
    expect(url).toContain("surface=public");
    expect(url).toContain("q=rate_limited");
    expect(url).toContain("status=429");
  });

  it("shows empty state when no events match", async () => {
    platformJson.mockResolvedValueOnce({ tenants: [], events: [] });
    render(<PlatformLogsPage />);
    expect(await screen.findByText("No events match the current filters.")).toBeInTheDocument();
  });
});
