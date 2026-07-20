// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const { adminJson, toast } = vi.hoisted(() => ({
  adminJson: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/components/admin/api", () => ({ adminJson, toast }));

import AnalyticsPage from "@/app/admin/[slug]/(panel)/analytics/page";

beforeEach(() => {
  adminJson.mockReset();
  toast.mockReset();
  adminJson.mockImplementation((url: string) => {
    if (url.startsWith("/api/admin/analytics")) {
      return Promise.resolve({
        period: "30d",
        from: "2026-06-01",
        to: "2026-06-30",
        byDay: [{ date: "2026-06-12", reservations: 2, covers: 6 }],
        byDayService: [],
        byStatus: { confirmed: 2 },
        bySource: { web: 2, admin: 0, thefork: 0, dish: 0 },
        sourceBreakdown: [{
          source: "web",
          label: "Online",
          external: false,
          reservations: 2,
          activeReservations: 2,
          covers: 6,
          cancelled: 0,
          noShow: 0,
          completed: 0,
          reservationShare: 100,
          coverShare: 100,
          cancellationRate: 0,
          noShowRate: 0,
        }],
        externalSummary: {
          reservations: 0,
          activeReservations: 0,
          covers: 0,
          cancelled: 0,
          noShow: 0,
          reservationShare: 0,
          coverShare: 0,
          providers: [],
        },
        originSummary: {
          webReservations: 2,
          attributedReservations: 1,
          attributionRate: 50,
        },
        originBreakdown: [{
          origin: "instagram",
          label: "Instagram",
          reservations: 1,
          activeReservations: 1,
          covers: 4,
          cancelled: 0,
          noShow: 0,
          completed: 0,
          reservationShare: 100,
          coverShare: 100,
          cancellationRate: 0,
          noShowRate: 0,
        }],
        byService: [],
        avgPartySize: 3,
        avgLeadDays: 2,
        newVsReturning: { new: 1, returning: 1 },
        feedback: { sent: 0 },
        byOffering: [],
        rates: { total: 2, noShow: 0, cancelled: 0, noShowRate: 0, cancelledRate: 0 },
        heatmap: [],
        partySizes: [],
        tableUtilization: [],
        waitlist: { total: 0, seated: 0, left: 0, expired: 0, waiting: 0, avgQuotedWait: 0, conversionRate: 0 },
      });
    }
    if (url === "/api/admin/config") {
      return Promise.resolve({ config: { offerings: [], weekly: {}, dateOverrides: {}, blockedSlots: {} } });
    }
    return Promise.reject(new Error(`Unexpected URL ${url}`));
  });
});

describe("AnalyticsPage", () => {
  it("renders attributed online booking origins separately from booking source", async () => {
    render(<AnalyticsPage />);

    await waitFor(() => expect(screen.getByText("Online booking origins")).toBeInTheDocument());
    expect(screen.getByText("Attributed online bookings")).toBeInTheDocument();
    expect(screen.getByText("Attribution rate")).toBeInTheDocument();
    expect(screen.getAllByText("Instagram").length).toBeGreaterThan(0);
    expect(screen.getAllByText("50%").length).toBeGreaterThan(0);
  });
});
