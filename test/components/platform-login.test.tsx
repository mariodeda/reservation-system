// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { replace, refresh } = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
  useSearchParams: () => new URLSearchParams("next=/platform"),
}));

import PlatformLoginPage from "@/app/platform/login/page";

beforeEach(() => {
  replace.mockReset();
  refresh.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("PlatformLoginPage", () => {
  it("posts to the platform login endpoint and redirects on success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_u?: string, _i?: RequestInit) => ({ ok: true, json: async () => ({ ok: true }) }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    render(<PlatformLoginPage />);
    await user.type(screen.getByLabelText(/username/i), "ops");
    await user.type(screen.getByLabelText(/password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(fetchMock).toHaveBeenCalledWith("/api/platform/login", expect.objectContaining({ method: "POST" }));
    expect(replace).toHaveBeenCalledWith("/platform");
  });

  it("shows the error on failure and does not redirect", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ error: "Incorrect username or password." }) })) as unknown as typeof fetch);
    render(<PlatformLoginPage />);
    await user.type(screen.getByLabelText(/username/i), "ops");
    await user.type(screen.getByLabelText(/password/i), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByText("Incorrect username or password.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
