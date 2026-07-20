// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import Tooltip from "@/components/ui/Tooltip";

describe("Tooltip", () => {
  it("renders tooltip content in a fixed body portal so popover overflow cannot clip it", async () => {
    const user = userEvent.setup();

    render(
      <div data-testid="popover" className="overflow-hidden">
        <Tooltip content="Full clipped label">
          <button type="button">Hover me</button>
        </Tooltip>
      </div>,
    );

    await user.hover(screen.getByRole("button", { name: "Hover me" }));

    const tooltip = screen.getByRole("tooltip", { name: "Full clipped label" });
    expect(tooltip.parentElement).toBe(document.body);
    expect(tooltip).toHaveClass("fixed");
    expect(tooltip).toHaveClass("z-[300]");
  });
});
