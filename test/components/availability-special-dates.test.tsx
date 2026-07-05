// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AvailabilityConfig } from "@/lib/reservations/types";

const { adminFetch, adminJson, toast } = vi.hoisted(() => ({
  adminFetch: vi.fn(),
  adminJson: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/components/admin/api", () => ({ adminFetch, adminJson, toast }));

import AvailabilityPage from "@/app/admin/[slug]/(panel)/availability/page";

function config(): AvailabilityConfig {
  const weekly: AvailabilityConfig["weekly"] = {};
  for (let d = 0; d < 7; d++) weekly[d] = { closed: false, services: [{ id: "lunch", label: "Lunch", start: "12:00", end: "14:00", interval: 60, capacity: 10 }] };
  return { timezone: "UTC", bookingWindowDays: 60, minPartySize: 1, maxPartySize: 12, leadMinutes: 0, weekly, closures: [], dateOverrides: {}, blockedSlots: {} };
}

beforeEach(() => {
  adminJson.mockReset();
  adminFetch.mockReset();
  toast.mockReset();
  adminJson.mockResolvedValue({ config: config() });
  adminFetch.mockImplementation(async (_url: string, init: RequestInit) => ({
    ok: true,
    json: async () => JSON.parse(init.body as string), // echo back what we sent
  }));
});
afterEach(() => vi.restoreAllMocks());

describe("Availability — Special dates", () => {
  it("loads config and renders the Special dates section", async () => {
    render(<AvailabilityPage />);
    const heading = await screen.findByRole("heading", { name: "Special dates" });
    const section = heading.closest("section")!;
    expect(within(section).getByText("None.")).toBeInTheDocument(); // no overrides yet
  });

  it("shows resolved duration values instead of default labels", async () => {
    const cfg = config();
    cfg.turnMinutes = 90;
    adminJson.mockResolvedValueOnce({ config: cfg });
    render(<AvailabilityPage />);

    const globalDuration = await screen.findByLabelText("Default table duration") as HTMLSelectElement;
    expect(globalDuration.selectedOptions[0].textContent).toBe("1h 30min");

    const serviceDuration = screen.getAllByLabelText("Duration")[0] as HTMLSelectElement;
    expect(serviceDuration.value).toBe("");
    expect(serviceDuration.selectedOptions[0].textContent).toBe("1h 30min");
  });

  it("shows the concrete system duration when the global duration is unset", async () => {
    render(<AvailabilityPage />);

    const globalDuration = await screen.findByLabelText("Default table duration") as HTMLSelectElement;
    expect(globalDuration.value).toBe("");
    expect(globalDuration.selectedOptions[0].textContent).toBe("2h");
  });

  it("edits service windows with explicit 24-hour time controls", async () => {
    const user = userEvent.setup();
    render(<AvailabilityPage />);

    const fromHours = await screen.findAllByLabelText("From hour") as HTMLSelectElement[];
    const fromMinutes = screen.getAllByLabelText("From minute") as HTMLSelectElement[];
    const toHours = screen.getAllByLabelText("To hour") as HTMLSelectElement[];
    const toMinutes = screen.getAllByLabelText("To minute") as HTMLSelectElement[];

    expect(fromHours[0].value).toBe("12");
    expect(fromMinutes[0].value).toBe("00");
    expect(toHours[0].value).toBe("14");
    expect(toMinutes[0].value).toBe("00");

    await user.selectOptions(fromHours[0], "18");
    await user.selectOptions(fromMinutes[0], "30");
    await user.selectOptions(toHours[0], "22");
    await user.selectOptions(toMinutes[0], "45");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(adminFetch).toHaveBeenCalled());
    const putCall = adminFetch.mock.calls.find((c) => (c[1] as RequestInit)?.method === "PUT")!;
    const sent = JSON.parse((putCall[1] as RequestInit).body as string);
    const mondayService = sent.config.offerings[0].weekly["1"].services[0];
    expect(mondayService.start).toBe("18:30");
    expect(mondayService.end).toBe("22:45");
  });

  it("warns before leaving with unsaved availability changes and clears after save", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AvailabilityPage />);

    const saveButton = await screen.findByRole("button", { name: /save changes/i });
    expect(saveButton).toBeDisabled();

    const fromHours = await screen.findAllByLabelText("From hour") as HTMLSelectElement[];
    await user.selectOptions(fromHours[0], "18");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(saveButton).toBeEnabled();

    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    const link = document.createElement("a");
    link.href = "/admin/acme/reservations";
    document.body.appendChild(link);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    const allowed = link.dispatchEvent(click);
    expect(allowed).toBe(false);
    expect(confirm).toHaveBeenCalledWith("You have unsaved availability changes. Leave without saving?");

    await user.click(saveButton);
    await waitFor(() => expect(adminFetch).toHaveBeenCalled());
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
    expect(await screen.findByText("✓ Saved")).toBeInTheDocument();
    expect(saveButton).toBeDisabled();

    const cleanUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanUnload);
    expect(cleanUnload.defaultPrevented).toBe(false);
  });

  it("adds a special date with a default service editor, then removes it", async () => {
    const user = userEvent.setup();
    render(<AvailabilityPage />);
    const heading = await screen.findByRole("heading", { name: "Special dates" });
    const section = heading.closest("section")!;

    const dateInput = section.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2026-12-25" } });
    await user.click(within(section).getByRole("button", { name: "Add special date" }));

    // override card appears with the date and an editable service window
    expect(within(section).getByText("2026-12-25")).toBeInTheDocument();
    expect(within(section).getByText("+ Add service")).toBeInTheDocument();

    // the card-level "Remove" is the first one in DOM order (before the service row's Remove)
    const removeButtons = within(section).getAllByRole("button", { name: "Remove" });
    await user.click(removeButtons[0]);
    expect(within(section).queryByText("2026-12-25")).not.toBeInTheDocument();
  });

  it("refuses to add a duplicate special date", async () => {
    const user = userEvent.setup();
    render(<AvailabilityPage />);
    const heading = await screen.findByRole("heading", { name: "Special dates" });
    const section = heading.closest("section")!;
    const dateInput = section.querySelector('input[type="date"]') as HTMLInputElement;

    fireEvent.change(dateInput, { target: { value: "2026-12-31" } });
    await user.click(within(section).getByRole("button", { name: "Add special date" }));
    fireEvent.change(dateInput, { target: { value: "2026-12-31" } });
    await user.click(within(section).getByRole("button", { name: "Add special date" }));

    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/already has special hours/i), "error");
    expect(within(section).getAllByText("2026-12-31")).toHaveLength(1);
  });

  it("persists the new override when saving", async () => {
    const user = userEvent.setup();
    render(<AvailabilityPage />);
    const heading = await screen.findByRole("heading", { name: "Special dates" });
    const section = heading.closest("section")!;
    const dateInput = section.querySelector('input[type="date"]') as HTMLInputElement;

    fireEvent.change(dateInput, { target: { value: "2026-08-15" } });
    await user.click(within(section).getByRole("button", { name: "Add special date" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(adminFetch).toHaveBeenCalled());
    const putCall = adminFetch.mock.calls.find((c) => (c[1] as RequestInit)?.method === "PUT")!;
    const sent = JSON.parse((putCall[1] as RequestInit).body as string);
    // Overrides are now per-offering; the editor writes to offerings[0]. The
    // server mirrors offerings[0] back to top-level on sanitize.
    const primary = sent.config.offerings[0];
    expect(primary.dateOverrides["2026-08-15"]).toBeTruthy();
    expect(primary.dateOverrides["2026-08-15"].services).toHaveLength(1);
  });
});
