import { describe, expect, it } from "vitest";
import { canonicalServiceLabel, localizedServiceLabel, serviceLabelsFor, serviceNameFor } from "@/lib/reservations/service-catalog";

describe("service catalog", () => {
  it("returns English and Italian names for known service ids", () => {
    expect(serviceNameFor("lunch")).toEqual({ id: "lunch", en: "Lunch", it: "Pranzo" });
    expect(serviceLabelsFor({ id: "dinner", label: "Dinner" })).toEqual({ labelEn: "Dinner", labelIt: "Cena" });
  });

  it("falls back to custom labels for unknown service ids", () => {
    expect(serviceNameFor("chef_table", "Chef table")).toEqual({ id: "chef_table", en: "Chef table", it: "Chef table" });
    expect(canonicalServiceLabel("chef_table", "Chef table")).toBe("Chef table");
  });

  it("selects localized labels by locale", () => {
    expect(localizedServiceLabel({ id: "dinner", label: "Dinner" }, "it-IT")).toBe("Cena");
    expect(localizedServiceLabel({ id: "dinner", label: "Dinner" }, "en-US")).toBe("Dinner");
  });
});
