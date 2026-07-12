// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Spy on the admin api module used by the component.
const { adminFetch, toast } = vi.hoisted(() => ({ adminFetch: vi.fn(), toast: vi.fn() }));
vi.mock("@/components/admin/api", () => ({ adminFetch, toast }));

import ReservationRow from "@/components/admin/ReservationRow";
import type { AdminReservation } from "@/components/admin/shared";

function row(over: Partial<AdminReservation> = {}): AdminReservation {
  return {
    id: "id-1", reference: "ABC123", date: "2026-06-12", time: "20:00", service: "dinner",
    partySize: 4, name: "Jane Doe", email: "jane@x.io", phone: "555", occasion: "Birthday",
    notes: "window seat", status: "pending", source: "web", createdAt: "", updatedAt: "", ...over,
  };
}

const okResponse = { ok: true, json: async () => ({ ok: true }) };

beforeEach(() => {
  adminFetch.mockReset();
  toast.mockReset();
  adminFetch.mockResolvedValue(okResponse);
});
afterEach(() => vi.restoreAllMocks());

describe("ReservationRow", () => {
  it("renders the core reservation details", () => {
    render(<ReservationRow r={row()} onChanged={() => {}} />);
    expect(screen.getAllByText("Jane Doe").length).toBeGreaterThan(0);
    expect(screen.getByText(/4 guests/)).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("shows booking origin only for internal web reservations", () => {
    const { rerender } = render(<ReservationRow r={row({ reservationOrigin: "instagram" })} onChanged={() => {}} />);
    expect(screen.getByText("Instagram")).toBeInTheDocument();

    rerender(<ReservationRow r={row({ source: "admin", reservationOrigin: "instagram" })} onChanged={() => {}} />);
    expect(screen.queryByText("Instagram")).not.toBeInTheDocument();
  });

  it("offers the quick actions for the current status and PATCHes on click", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    render(<ReservationRow r={row({ status: "pending" })} onChanged={onChanged} />);

    // pending -> Confirmed | Cancelled
    await user.click(screen.getByRole("button", { name: "Confirmed" }));

    expect(adminFetch).toHaveBeenCalledWith(
      "/api/admin/reservations/id-1",
      expect.objectContaining({ method: "PATCH" }),
    );
    const body = JSON.parse(adminFetch.mock.calls[0][1].body);
    expect(body.status).toBe("confirmed");
    expect(onChanged).toHaveBeenCalled();
  });

  it("expands details and saves edits, blocking an empty name", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    render(<ReservationRow r={row()} onChanged={onChanged} />);

    // Details are open by default — go straight to Edit reservation
    await user.click(screen.getByRole("button", { name: "Edit reservation" }));

    const name = screen.getByPlaceholderText("Name") as HTMLInputElement;
    await user.clear(name);
    await user.click(screen.getByRole("button", { name: "Save" }));
    // empty name -> validation toast, no network call
    expect(toast).toHaveBeenCalledWith("Name is required.", "error");
    expect(adminFetch).not.toHaveBeenCalled();

    // fix the name and save -> PATCH with the edited fields
    await user.type(name, "Janet");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(adminFetch).toHaveBeenCalledWith(
      "/api/admin/reservations/id-1",
      expect.objectContaining({ method: "PATCH" }),
    );
    const body = JSON.parse(adminFetch.mock.calls.at(-1)![1].body);
    expect(body.name).toBe("Janet");
    expect(onChanged).toHaveBeenCalled();
  });

  it("deletes only after confirmation", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<ReservationRow r={row()} onChanged={onChanged} />);

    // Details are open by default — Delete reservation button is already visible
    // first click: user cancels the confirm -> no request
    await user.click(screen.getByRole("button", { name: "Delete reservation" }));
    expect(adminFetch).not.toHaveBeenCalled();

    // second click: user confirms -> DELETE
    await user.click(screen.getByRole("button", { name: "Delete reservation" }));
    expect(adminFetch).toHaveBeenCalledWith(
      "/api/admin/reservations/id-1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(onChanged).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it.each(["seated", "completed"] as const)("disables edit and delete once a reservation is %s", async (status) => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<ReservationRow r={row({ status })} onChanged={() => {}} />);

    if (status === "completed") {
      await user.click(screen.getByRole("button", { name: /Expand/ }));
    }

    const edit = screen.getByRole("button", { name: "Edit reservation" });
    const del = screen.getByRole("button", { name: "Delete reservation" });
    expect(edit).toBeDisabled();
    expect(del).toBeDisabled();

    await user.click(edit);
    await user.click(del);

    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(adminFetch).not.toHaveBeenCalled();
  });

  it("shows completed reservations collapsed by default with minimal staff info", async () => {
    const user = userEvent.setup();
    render(<ReservationRow r={row({ status: "completed", tableLabel: "Patio 2" })} onChanged={() => {}} />);

    expect(screen.getByText("20:00")).toBeInTheDocument();
    expect(screen.getAllByText("Jane Doe").length).toBeGreaterThan(0);
    expect(screen.getByText(/4 guests/)).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.queryByText("Table: Patio 2")).not.toBeInTheDocument();
    expect(screen.queryByText("555")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit reservation" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Expand/ }));
    expect(screen.getByRole("button", { name: "Edit reservation" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete reservation" })).toBeDisabled();
  });

  it("shows cancelled reservations collapsed by default with a light red card treatment", async () => {
    const user = userEvent.setup();
    const { container } = render(<ReservationRow r={row({ status: "cancelled", tableLabel: "Patio 2" })} onChanged={() => {}} />);

    expect(container.firstElementChild).toHaveClass("border-rose-400/30", "bg-rose-400/10");
    expect(container.firstElementChild).not.toHaveClass("opacity-60");
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.queryByText("Table: Patio 2")).not.toBeInTheDocument();
    expect(screen.queryByText("555")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit reservation" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reinstate" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Expand/ }));
    expect(screen.getByRole("button", { name: "Edit reservation" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete reservation" })).toBeEnabled();
  });

  it("shows a 'manual' badge for admin-sourced bookings and a Reinstate action when cancelled", async () => {
    const user = userEvent.setup();
    render(<ReservationRow r={row({ source: "admin", status: "cancelled" })} onChanged={() => {}} />);
    expect(screen.getByText("manual")).toBeInTheDocument();
    // cancelled -> confirmed quick action is labelled "Reinstate"
    await user.click(screen.getByRole("button", { name: "Reinstate" }));
    const body = JSON.parse(adminFetch.mock.calls[0][1].body);
    expect(body.status).toBe("confirmed");
  });

  it("renders TheFork reservations as external bookings with only table assignment available", () => {
    const { container } = render(
      <ReservationRow
        r={row({
          source: "thefork",
          service: "Dinner",
          status: "confirmed",
          external: { provider: "thefork", label: "TheFork", externalId: "tf-res-1", externalStatus: "RECORDED" },
        })}
        onChanged={() => {}}
        tables={[{ id: "t1", offering: null, label: "1", capacity: 4, minParty: 1, sortOrder: 0, joinable: false, active: true, createdAt: "" }]}
      />,
    );

    expect(screen.getByText("TheFork")).toBeInTheDocument();
    expect(screen.queryByText("Dinner")).not.toBeInTheDocument();
    expect(screen.queryByText("External - TheFork")).not.toBeInTheDocument();
    expect(container.querySelector('img[src="/integrations/thefork_logo.png"]')).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit reservation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete reservation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send review email" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Seated" })).not.toBeInTheDocument();
  });

  it("renders DISH reservations as external bookings with only table assignment available", () => {
    const { container } = render(
      <ReservationRow
        r={row({
          source: "dish",
          service: "Dinner",
          status: "confirmed",
          external: { provider: "dish", label: "DISH", externalId: "dish-res-1", externalStatus: "CONFIRMED" },
        })}
        onChanged={() => {}}
        tables={[{ id: "t1", offering: null, label: "1", capacity: 4, minParty: 1, sortOrder: 0, joinable: false, active: true, createdAt: "" }]}
      />,
    );

    expect(screen.getByText("DISH")).toBeInTheDocument();
    expect(screen.queryByText("Dinner")).not.toBeInTheDocument();
    expect(screen.queryByText("External - DISH")).not.toBeInTheDocument();
    expect(container.querySelector('img[src="/integrations/dish_co.png"]')).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit reservation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete reservation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send review email" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Seated" })).not.toBeInTheDocument();
  });

  it("toggles details open and closed", async () => {
    const user = userEvent.setup();
    render(<ReservationRow r={row()} onChanged={() => {}} />);
    // Details are open by default
    expect(screen.getAllByText(/jane@x.io/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /Collapse/ }));
    expect(screen.queryByText(/jane@x.io/)).not.toBeInTheDocument();
    // Expand again
    await user.click(screen.getByRole("button", { name: /Expand/ }));
    expect(screen.getAllByText(/jane@x.io/).length).toBeGreaterThan(0);
  });

  it("shows a call-followup warning when the guest email is unreachable", () => {
    render(
      <ReservationRow
        r={row({
          emails: {
            bookingConfirmation: {
              status: "failed",
              reason: "recipient_rejected",
              error: "SMTP rejected recipient",
              at: "2026-07-01T10:00:00Z",
              attempts: 1,
            },
          },
        })}
        onChanged={() => {}}
      />,
    );
    expect(screen.getByText("Email unreachable")).toBeInTheDocument();
    expect(screen.getByText(/Follow up with a phone call/i)).toBeInTheDocument();
  });

  it("shows a clear booking email failure warning when confirmation sending fails", () => {
    render(
      <ReservationRow
        r={row({
          emails: {
            bookingConfirmation: {
              status: "failed",
              reason: "smtp_error",
              error: "SMTP authentication failed",
              at: "2026-07-01T10:00:00Z",
              attempts: 2,
            },
          },
        })}
        onChanged={() => {}}
      />,
    );

    expect(screen.getByText("Booking email failed")).toBeInTheDocument();
    expect(screen.getByText(/guest may not have received the booking confirmation/i)).toBeInTheDocument();
    expect(screen.getByText(/Confirmation: SMTP authentication failed/)).toBeInTheDocument();
  });

  it("lets staff send a review email only from a completed reservation row", async () => {
    const user = userEvent.setup();
    render(<ReservationRow r={row({ status: "completed", feedbackSentAt: null })} onChanged={() => {}} />);

    await user.click(screen.getByRole("button", { name: /Expand/ }));
    await user.click(screen.getByRole("button", { name: "Send review email" }));

    expect(adminFetch).toHaveBeenCalledWith(
      "/api/admin/reservations/id-1/feedback",
      expect.objectContaining({ method: "POST" }),
    );
    expect(toast).toHaveBeenCalledWith("Review email sent");
    expect(screen.getByRole("button", { name: "Feedback request already sent" })).toBeDisabled();
  });

  it("shows a disabled already-sent review email button when feedback was sent before", async () => {
    const user = userEvent.setup();
    render(<ReservationRow r={row({ status: "completed", feedbackSentAt: "2026-07-01T12:00:00Z" })} onChanged={() => {}} />);

    await user.click(screen.getByRole("button", { name: /Expand/ }));
    expect(screen.getByRole("button", { name: "Feedback request already sent" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Send review email" })).not.toBeInTheDocument();
  });

  it("does not show the review email action before completion", () => {
    render(<ReservationRow r={row({ status: "confirmed" })} onChanged={() => {}} />);

    expect(screen.queryByRole("button", { name: "Send review email" })).not.toBeInTheDocument();
  });

  it("edits every field and sends them all in the PATCH", async () => {
    const user = userEvent.setup();
    render(
      <ReservationRow
        r={row({ service: "brunch" /* not in services list -> extra option rendered */ })}
        onChanged={() => {}}
        offerings={[{ id: "main", label: "Dining", services: [{ id: "lunch", label: "Lunch" }, { id: "dinner", label: "Dinner" }] }]}
      />,
    );
    // Details open by default
    await user.click(screen.getByRole("button", { name: "Edit reservation" }));

    await user.selectOptions(screen.getByDisplayValue("brunch"), "dinner");
    const party = screen.getByRole("spinbutton") as HTMLInputElement;
    await user.clear(party);
    await user.type(party, "8");
    const phone = screen.getByPlaceholderText("Phone") as HTMLInputElement;
    await user.clear(phone);
    await user.type(phone, "999");
    const occasion = screen.getByPlaceholderText("Occasion") as HTMLInputElement;
    await user.clear(occasion);
    await user.type(occasion, "Wedding");

    await user.click(screen.getByRole("button", { name: "Save" }));
    const body = JSON.parse(adminFetch.mock.calls.at(-1)![1].body);
    expect(body.service).toBe("dinner");
    expect(body.partySize).toBe(8);
    expect(body.phone).toBe("999");
    expect(body.occasion).toBe("Wedding");
  });

  it("cancels editing without sending a request", async () => {
    const user = userEvent.setup();
    render(<ReservationRow r={row()} onChanged={() => {}} />);
    // Details open by default
    await user.click(screen.getByRole("button", { name: "Edit reservation" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(adminFetch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Edit reservation" })).toBeInTheDocument();
  });

  it("shows an error toast when the update request fails", async () => {
    const user = userEvent.setup();
    adminFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    render(<ReservationRow r={row({ status: "seated" })} onChanged={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Completed" }));
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/could not update/i), "error");
  });

  it("keeps quick actions stacked on mobile and as a right rail on desktop", () => {
    render(<ReservationRow r={row({ status: "seated" })} onChanged={() => {}} />);

    const completed = screen.getByRole("button", { name: "Completed" });
    const rail = completed.closest(".border-t");

    expect(rail).toHaveClass("border-t");
    expect(rail).toHaveClass("md:w-[150px]");
    expect(rail).toHaveClass("md:border-l");
    expect(rail).toHaveClass("md:border-t-0");
  });
});
