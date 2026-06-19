// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { replace, refresh } = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
const pathname = vi.hoisted(() => ({ value: "/admin/reservations" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
  usePathname: () => pathname.value,
}));
// next/link -> plain anchor for the test environment.
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import AdminShell from "@/components/admin/AdminShell";

beforeEach(() => {
  replace.mockReset();
  refresh.mockReset();
  pathname.value = "/admin/reservations";
});
afterEach(() => vi.restoreAllMocks());

describe("AdminShell", () => {
  it("renders the brand, nav links and children", () => {
    render(<AdminShell brandName="Osteria"><p>content</p></AdminShell>);
    expect(screen.getByText("Osteria")).toBeInTheDocument();
    // nav appears twice (desktop + mobile)
    expect(screen.getAllByRole("link", { name: "Dashboard" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("marks the active route (prefix match, with /admin exact)", () => {
    pathname.value = "/admin/reservations";
    render(<AdminShell brandName="O"><span /></AdminShell>);
    const reservations = screen.getAllByRole("link", { name: "Reservations" })[0];
    const dashboard = screen.getAllByRole("link", { name: "Dashboard" })[0];
    expect(reservations.className).toContain("text-primary");
    expect(dashboard.className).not.toContain("bg-primary/15"); // /admin not active on a subpath
  });

  it("logs out: POSTs then redirects to login", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    render(<AdminShell brandName="O"><span /></AdminShell>);

    await user.click(screen.getByRole("button", { name: /sign out/i }));
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/logout", { method: "POST" });
    expect(replace).toHaveBeenCalledWith("/admin/login");
    expect(refresh).toHaveBeenCalled();
  });
});
