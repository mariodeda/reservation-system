// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useBodyScrollLock } from "@/components/ui/useBodyScrollLock";

function Lock({ active = true }: { active?: boolean }) {
  useBodyScrollLock(active);
  return null;
}

afterEach(() => {
  document.body.removeAttribute("style");
  vi.restoreAllMocks();
});

describe("useBodyScrollLock", () => {
  it("locks body scrolling while active and restores on unmount", () => {
    vi.spyOn(window, "scrollY", "get").mockReturnValue(128);
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    const { unmount } = render(<Lock />);

    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.top).toBe("-128px");
    expect(document.body.style.width).toBe("100%");

    unmount();

    expect(document.body.style.overflow).toBe("");
    expect(document.body.style.position).toBe("");
    expect(document.body.style.top).toBe("");
    expect(document.body.style.width).toBe("");
    expect(scrollTo).toHaveBeenCalledWith(0, 128);
  });

  it("keeps scrolling locked until the last nested lock is released", () => {
    vi.spyOn(window, "scrollY", "get").mockReturnValue(64);
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    const first = render(<Lock />);
    const second = render(<Lock />);

    second.unmount();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.style.position).toBe("fixed");

    first.unmount();
    expect(document.body.style.overflow).toBe("");
    expect(document.body.style.position).toBe("");
  });
});
