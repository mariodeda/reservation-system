// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { adminJson, adminFetch, toast } = vi.hoisted(() => ({
  adminJson: vi.fn(),
  adminFetch: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/components/admin/api", () => ({ adminJson, adminFetch, toast }));

import CustomersPage from "@/app/admin/[slug]/(panel)/customers/page";

beforeEach(() => {
  adminJson.mockReset();
  adminFetch.mockReset();
  toast.mockReset();
  adminJson.mockResolvedValue({
    customers: [{
      email: "jane@example.com",
      name: "Doe, Jane",
      phone: "555",
      vip: false,
      visitCount: 2,
      totalCovers: 4,
      noShowCount: 0,
      cancelledCount: 0,
      firstVisit: "2026-06-01",
      lastVisit: "2026-06-12",
    }],
    total: 1,
  });
});

describe("CustomersPage", () => {
  it("displays comma-form customer names as first name then last name", async () => {
    render(<CustomersPage />);

    expect(await screen.findAllByText("Jane Doe")).toHaveLength(2);
    expect(screen.queryByText("Doe, Jane")).not.toBeInTheDocument();
  });
});
