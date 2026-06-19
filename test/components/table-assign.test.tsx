// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { adminFetch, adminJson, toast } = vi.hoisted(() => ({
  adminFetch: vi.fn(),
  adminJson: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/components/admin/api", () => ({ adminFetch, adminJson, toast }));

import ReservationRow from "@/components/admin/ReservationRow";
import type { AdminReservation } from "@/components/admin/shared";
import type { RestaurantTable } from "@/lib/reservations/types";

function row(over: Partial<AdminReservation> = {}): AdminReservation {
  return {
    id: "res-1", reference: "ABC123", date: "2026-06-12", time: "20:00", service: "dinner",
    partySize: 2, name: "Jane", email: "j@x.io", phone: "555",
    status: "confirmed", source: "web", createdAt: "", updatedAt: "", ...over,
  };
}
function table(over: Partial<RestaurantTable> = {}): RestaurantTable {
  return {
    id: "t1", offering: null, label: "5", capacity: 4, minParty: 1,
    sortOrder: 0, joinable: false, active: true, createdAt: "", ...over,
  };
}

const okResponse = { ok: true, json: async () => ({ ok: true }) };

beforeEach(() => {
  adminFetch.mockReset();
  adminJson.mockReset();
  toast.mockReset();
  adminFetch.mockResolvedValue(okResponse);
});
afterEach(() => vi.restoreAllMocks());

describe("managed table assignment", () => {
  it("renders a managed select and PATCHes tableId on selection", async () => {
    const user = userEvent.setup();
    render(<ReservationRow r={row()} onChanged={() => {}} tables={[table({ id: "t1", label: "5" }), table({ id: "t2", label: "9", capacity: 6 })]} />);

    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "t2");

    expect(adminFetch).toHaveBeenCalledWith(
      "/api/admin/reservations/res-1",
      expect.objectContaining({ method: "PATCH" }),
    );
    const body = JSON.parse(adminFetch.mock.calls[0][1].body);
    expect(body.tableId).toBe("t2");
  });

  it("only offers tables for the reservation's offering (binding respected)", () => {
    render(
      <ReservationRow
        r={row({ offering: "main" })}
        onChanged={() => {}}
        tables={[table({ id: "t1", label: "5", offering: "main" }), table({ id: "t2", label: "S1", offering: "sushi" })]}
      />,
    );
    expect(screen.getByRole("option", { name: /5/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /S1/ })).not.toBeInTheDocument();
  });

  it("Suggest fetches a recommendation and assigns it", async () => {
    const user = userEvent.setup();
    adminJson.mockResolvedValueOnce({ table: { id: "t2", label: "9" } });
    render(<ReservationRow r={row()} onChanged={() => {}} tables={[table({ id: "t1" }), table({ id: "t2", label: "9" })]} />);

    await user.click(screen.getByRole("button", { name: "Suggest" }));

    expect(adminJson).toHaveBeenCalledWith("/api/admin/reservations/res-1/table");
    const body = JSON.parse(adminFetch.mock.calls.at(-1)![1].body);
    expect(body.tableId).toBe("t2");
  });

  it("toasts the server error on a table conflict (409)", async () => {
    const user = userEvent.setup();
    adminFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Table 5 is already taken at 20:00 (Bob)." }) });
    render(<ReservationRow r={row()} onChanged={() => {}} tables={[table({ id: "t1", label: "5" })]} />);

    await user.selectOptions(screen.getByRole("combobox"), "t1");
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/already taken/i), "error");
  });

  it("falls back to the free-text editor when there are no managed tables", () => {
    render(<ReservationRow r={row()} onChanged={() => {}} tables={[]} />);
    // free-text variant shows an "Assign a table…" affordance, not a <select>
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText(/Assign a table/i)).toBeInTheDocument();
  });
});
