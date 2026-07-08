// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlatformUnsavedChanges } from "@/components/platform/usePlatformUnsavedChanges";

function GuardFixture({ dirty }: { dirty: boolean }) {
  usePlatformUnsavedChanges(dirty);
  return <a href="/platform/logs">Logs</a>;
}

afterEach(() => {
  vi.restoreAllMocks();
  window.__platformUnsavedChanges = false;
});

describe("usePlatformUnsavedChanges", () => {
  it("warns on browser unload while platform state is dirty", () => {
    render(<GuardFixture dirty />);

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("blocks same-tab platform navigation when the operator rejects the warning", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<GuardFixture dirty />);

    const allowed = fireEvent.click(screen.getByRole("link", { name: "Logs" }));

    expect(confirm).toHaveBeenCalledWith("You have unsaved platform admin changes. Leave without saving?");
    expect(allowed).toBe(false);
  });

  it("does not warn when state is clean", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<GuardFixture dirty={false} />);

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(confirm).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
