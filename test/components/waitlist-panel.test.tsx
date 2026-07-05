// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { adminFetch, adminJson, toast } = vi.hoisted(() => ({
  adminFetch: vi.fn(),
  adminJson: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/components/admin/api", () => ({ adminFetch, adminJson, toast }));

import WaitlistPanel from "@/components/admin/WaitlistPanel";
import type { WaitlistEntry } from "@/lib/reservations/types";

const offerings = [{ id: "main", label: "Dining", services: [{ id: "dinner", label: "Dinner" }] }];

function entry(over: Partial<WaitlistEntry> = {}): WaitlistEntry {
  return {
    id: "w1", offering: "main", date: "2026-06-12", name: "Rossi", partySize: 3,
    status: "waiting", quotedWaitMin: 15, createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(), ...over,
  };
}

beforeEach(() => {
  adminFetch.mockReset();
  adminJson.mockReset();
  toast.mockReset();
  adminFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  adminJson.mockResolvedValue({ waitlist: [entry()] });
});
afterEach(() => vi.restoreAllMocks());

function renderPanel() {
  return render(
    <WaitlistPanel date="2026-06-12" offerings={offerings} tables={[]} tz="Europe/Rome" refreshKey={0} onSeated={() => {}} />,
  );
}

describe("WaitlistPanel", () => {
  it("loads and lists the day's active queue", async () => {
    renderPanel();
    expect(await screen.findByText("Rossi")).toBeInTheDocument();
    expect(screen.getByText(/same-day queue/i)).toBeInTheDocument();
    expect(screen.getByText("Active queue")).toBeInTheDocument();
    expect(adminJson).toHaveBeenCalledWith("/api/admin/waitlist?date=2026-06-12&active=1");
  });

  it("notifies a waiting party via PATCH", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Rossi");
    await user.click(screen.getByRole("button", { name: "Mark notified" }));
    expect(adminFetch).toHaveBeenCalledWith(
      "/api/admin/waitlist/w1",
      expect.objectContaining({ method: "PATCH" }),
    );
    const body = JSON.parse(adminFetch.mock.calls.at(-1)![1].body);
    expect(body.status).toBe("notified");
  });

  it("seats a party via the seat endpoint", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Rossi");
    await user.click(screen.getByRole("button", { name: "Seat now" }));
    expect(screen.getByText("Create reservation from waitlist")).toBeInTheDocument();
    // SeatForm appears with a Confirm button
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(adminFetch).toHaveBeenCalledWith(
        "/api/admin/waitlist/w1/seat",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("adds a party through the add form", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Rossi");
    await user.click(screen.getByRole("button", { name: /Add to waitlist/i }));
    await user.type(screen.getByPlaceholderText(/Guest name/i), "Bianchi");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(adminJson).toHaveBeenCalledWith(
        "/api/admin/waitlist",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const call = adminJson.mock.calls.find((c) => c[1]?.method === "POST")!;
    expect(JSON.parse(call[1].body).name).toBe("Bianchi");
  });

  it("shows the empty state when no one is waiting", async () => {
    adminJson.mockResolvedValue({ waitlist: [] });
    renderPanel();
    expect(await screen.findByText(/No one waiting/i)).toBeInTheDocument();
  });
});
