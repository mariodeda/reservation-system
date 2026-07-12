import { describe, expect, it } from "vitest";
import { requiresManualConfirmationForParty } from "@/lib/reservations/booking-policy";

describe("booking policy", () => {
  it("requires manual confirmation only for over-max web bookings", () => {
    const config = { maxPartySize: 8 };

    expect(requiresManualConfirmationForParty(8, config, "web")).toBe(false);
    expect(requiresManualConfirmationForParty(9, config, "web")).toBe(true);
    expect(requiresManualConfirmationForParty(9, config, "admin")).toBe(false);
    expect(requiresManualConfirmationForParty(9, config, "thefork")).toBe(false);
    expect(requiresManualConfirmationForParty(9, config, "dish")).toBe(false);
    expect(requiresManualConfirmationForParty(9.5, config, "web")).toBe(false);
  });
});
