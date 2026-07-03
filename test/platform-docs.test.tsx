// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PLATFORM_DOCS, platformDocBySlug, readPlatformDoc, renderMarkdown } from "@/lib/platform-docs";
import PlatformDocsPage from "@/app/platform/(console)/docs/page";
import PlatformShell from "@/components/platform/PlatformShell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/platform/docs",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

describe("platform documentation", () => {
  it("renders repository markdown without raw html", async () => {
    const doc = platformDocBySlug("api-and-security");
    render(<div>{renderMarkdown("# Hello\n\nUse `code` and [docs](./system-overview.md).", doc)}</div>);

    expect(screen.getByRole("heading", { name: "Hello" })).toBeInTheDocument();
    expect(screen.getByText("code")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "docs" })).toHaveAttribute("href", "/platform/docs?doc=system-overview");
  });

  it("loads a selected documentation page", async () => {
    const page = await PlatformDocsPage({ searchParams: Promise.resolve({ doc: "tenant-admin-reservations" }) });
    render(page);

    expect(screen.getByRole("heading", { name: "Documentation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reservations" })).toHaveAttribute("href", "/platform/docs?doc=tenant-admin-reservations");
    expect(screen.getByRole("heading", { name: "Tenant Reservations" })).toBeInTheDocument();
  });

  it("keeps every configured doc readable", async () => {
    for (const doc of PLATFORM_DOCS) {
      await expect(readPlatformDoc(doc)).resolves.toContain("#");
    }
  });

  it("adds Docs to the platform shell navigation", () => {
    render(<PlatformShell username="ops"><span>body</span></PlatformShell>);
    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute("href", "/platform/docs");
  });
});
