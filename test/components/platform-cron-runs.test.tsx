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

import PlatformCronRunsPage from "@/app/platform/(console)/cron-runs/page";

beforeEach(() => {
  platformJson.mockReset();
  platformJson.mockResolvedValue({
    jobs: [
      {
        name: "dish-sync",
        label: "DISH sync",
        description: "Imports enabled DISH tenants.",
        cadence: "Every 15 minutes internally, or external POST /api/platform/cron/dish-sync.",
        endpoint: "/api/platform/cron/dish-sync",
        lastRun: {
          id: "run-1",
          job: "dish-sync",
          label: "DISH sync",
          status: "warning",
          trigger: "external",
          event: "platform.cron.completed",
          createdAt: "2026-07-01T10:00:00.000Z",
          durationMs: 1234,
          summary: { tenants: 2, successful: 1, failed: 1, imported: 3 },
        },
      },
      {
        name: "feedback-requests",
        label: "Review request emails",
        description: "Sends due post-visit review requests.",
        cadence: "Every 30 minutes internally.",
        endpoint: "/api/platform/cron/feedback-requests",
      },
    ],
    runs: [
      {
        id: "run-1",
        job: "dish-sync",
        label: "DISH sync",
        status: "warning",
        trigger: "external",
        event: "platform.cron.completed",
        createdAt: "2026-07-01T10:00:00.000Z",
        durationMs: 1234,
        summary: { tenants: 2, successful: 1, failed: 1, imported: 3 },
      },
      {
        id: "run-2",
        job: "smtp-health",
        label: "SMTP health checks",
        status: "success",
        trigger: "internal",
        event: "internal_scheduler.job_completed",
        createdAt: "2026-07-01T09:30:00.000Z",
        durationMs: 250,
        summary: {},
      },
    ],
  });
});

describe("PlatformCronRunsPage", () => {
  it("renders cron job status and applies a job filter", async () => {
    const user = userEvent.setup();
    render(<PlatformCronRunsPage />);

    expect(await screen.findByRole("heading", { name: "Cron jobs" })).toBeInTheDocument();
    expect(screen.getAllByText("DISH sync").length).toBeGreaterThan(0);
    expect(screen.getByText("External cron endpoint")).toBeInTheDocument();
    expect(screen.getByText("Internal scheduler")).toBeInTheDocument();
    expect(screen.getByText(/tenants: 2/)).toBeInTheDocument();
    expect(screen.getByText(/failed: 1/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Job"), "dish-sync");

    await waitFor(() => expect(platformJson).toHaveBeenCalledTimes(2));
    const url = platformJson.mock.calls.at(-1)?.[0] as string;
    expect(url).toContain("/api/platform/cron-runs?");
    expect(url).toContain("job=dish-sync");
  });

  it("shows an empty state when no cron runs are recorded", async () => {
    platformJson.mockResolvedValueOnce({ jobs: [], runs: [] });
    render(<PlatformCronRunsPage />);
    expect(await screen.findByText("No cron runs recorded yet.")).toBeInTheDocument();
  });
});
