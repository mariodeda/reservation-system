// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { replace, refresh } = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
  useSearchParams: () => new URLSearchParams("next=/admin/reservations"),
}));

import AdminLoginPage from "@/app/admin/login/page";

beforeEach(() => {
  replace.mockReset();
  refresh.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("AdminLoginPage", () => {
  it("submits credentials and redirects to the `next` target on success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_url?: string, _init?: RequestInit) => ({ ok: true, json: async () => ({ ok: true }) }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    render(<AdminLoginPage />);
    await user.type(screen.getByLabelText(/username/i), "staff");
    await user.type(screen.getByLabelText(/password/i), "s3cret");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/login", expect.objectContaining({ method: "POST" }));
    const body = JSON.parse((fetchMock.mock.calls[0][1]?.body ?? "{}") as string);
    expect(body).toEqual({ username: "staff", password: "s3cret" });
    expect(replace).toHaveBeenCalledWith("/admin/reservations");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the server error message and does not redirect on failure", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({ error: "Incorrect username or password." }) })) as unknown as typeof fetch,
    );

    render(<AdminLoginPage />);
    await user.type(screen.getByLabelText(/username/i), "staff");
    await user.type(screen.getByLabelText(/password/i), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Incorrect username or password.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows a network-error message when the request throws", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch);

    render(<AdminLoginPage />);
    await user.type(screen.getByLabelText(/username/i), "staff");
    await user.type(screen.getByLabelText(/password/i), "s3cret");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/network error/i)).toBeInTheDocument();
  });
});
