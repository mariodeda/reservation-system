// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PLATFORM_DOCS, platformDocBySlug, readPlatformDoc, renderMarkdown } from "@/lib/platform-docs";
import PlatformDocsPage from "@/app/platform/(console)/docs/page";
import TenantDocsPage from "@/app/admin/[slug]/(panel)/docs/page";
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

  it("preserves Italian language on internal documentation links", async () => {
    const doc = platformDocBySlug("api-and-security");
    render(<div>{renderMarkdown("[docs](./system-overview.md)", doc, "it")}</div>);
    expect(screen.getByRole("link", { name: "docs" })).toHaveAttribute("href", "/platform/docs?doc=system-overview&lang=it");
  });

  it("can render internal documentation links against a tenant docs base path", async () => {
    const doc = platformDocBySlug("tenant-admin-reservations");
    render(<div>{renderMarkdown("[tables](./tables-and-floor.md)", doc, "it", "/admin/acme/docs")}</div>);
    expect(screen.getByRole("link", { name: "tables" })).toHaveAttribute("href", "/admin/acme/docs?doc=tenant-admin-tables-and-floor&lang=it");
  });

  it("loads a selected documentation page", async () => {
    const page = await PlatformDocsPage({ searchParams: Promise.resolve({ doc: "tenant-admin-reservations" }) });
    render(page);

    expect(screen.getByRole("heading", { name: "Documentation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reservations" })).toHaveAttribute("href", "/platform/docs?doc=tenant-admin-reservations");
    expect(screen.getByRole("heading", { name: "Reservations" })).toBeInTheDocument();
  });

  it("loads Italian documentation when requested", async () => {
    const page = await PlatformDocsPage({ searchParams: Promise.resolve({ doc: "tenant-admin-reservations", lang: "it" }) });
    render(page);

    expect(screen.getByRole("heading", { name: "Documentazione" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Prenotazioni" })).toHaveAttribute("href", "/platform/docs?doc=tenant-admin-reservations&lang=it");
    expect(screen.getByRole("heading", { name: "Prenotazioni" })).toBeInTheDocument();
  });

  it("loads tenant documentation under the admin tenant route", async () => {
    const page = await TenantDocsPage({
      params: Promise.resolve({ slug: "acme" }),
      searchParams: Promise.resolve({ doc: "tenant-admin-reservations", lang: "it" }),
    });
    render(page);

    expect(screen.getByRole("heading", { name: "Guida staff" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Prenotazioni" })).toHaveAttribute("href", "/admin/acme/docs?doc=tenant-admin-reservations&lang=it");
    expect(screen.getByRole("heading", { name: "Prenotazioni" })).toBeInTheDocument();
  });

  it("keeps every configured doc readable", async () => {
    for (const doc of PLATFORM_DOCS) {
      await expect(readPlatformDoc(doc)).resolves.toContain("#");
      await expect(readPlatformDoc(doc, "it")).resolves.toContain("#");
    }
  });

  it("adds Docs to the platform shell navigation", () => {
    render(<PlatformShell username="ops"><span>body</span></PlatformShell>);
    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute("href", "/platform/docs");
  });
});
