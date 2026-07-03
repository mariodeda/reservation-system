import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import type { ReactNode } from "react";

export type PlatformDoc = {
  slug: string;
  title: string;
  titleIt: string;
  path: string;
  group: "Overview" | "Platform Admin" | "Tenant Admin";
};

export type PlatformDocLang = "en" | "it";

export const PLATFORM_DOCS: PlatformDoc[] = [
  { slug: "index", title: "Documentation Home", titleIt: "Home documentazione", path: "README.md", group: "Overview" },
  { slug: "system-overview", title: "System Overview", titleIt: "Panoramica sistema", path: "system-overview.md", group: "Overview" },
  { slug: "api-and-security", title: "API And Security Model", titleIt: "API e sicurezza", path: "api-and-security.md", group: "Overview" },
  { slug: "platform-admin", title: "Platform Admin Guide", titleIt: "Guida admin piattaforma", path: "platform-admin/README.md", group: "Platform Admin" },
  { slug: "platform-admin-tenant-management", title: "Tenant Management", titleIt: "Gestione ristoranti", path: "platform-admin/tenant-management.md", group: "Platform Admin" },
  { slug: "platform-admin-email-operations", title: "Email Operations", titleIt: "Operazioni email", path: "platform-admin/email-operations.md", group: "Platform Admin" },
  { slug: "platform-admin-logs-and-monitoring", title: "Logs And Monitoring", titleIt: "Log e monitoraggio", path: "platform-admin/logs-and-monitoring.md", group: "Platform Admin" },
  { slug: "tenant-admin", title: "Tenant Admin Guide", titleIt: "Guida admin tenant", path: "tenant-admin/README.md", group: "Tenant Admin" },
  { slug: "tenant-admin-dashboard-and-navigation", title: "Dashboard And Navigation", titleIt: "Dashboard e navigazione", path: "tenant-admin/dashboard-and-navigation.md", group: "Tenant Admin" },
  { slug: "tenant-admin-reservations", title: "Reservations", titleIt: "Prenotazioni", path: "tenant-admin/reservations.md", group: "Tenant Admin" },
  { slug: "tenant-admin-reservation-lifecycle", title: "Reservation Lifecycle And Actions", titleIt: "Ciclo vita e azioni prenotazione", path: "tenant-admin/reservation-lifecycle.md", group: "Tenant Admin" },
  { slug: "tenant-admin-availability-and-tables", title: "Availability And Tables", titleIt: "Disponibilita e tavoli", path: "tenant-admin/availability-and-tables.md", group: "Tenant Admin" },
  { slug: "tenant-admin-tables-and-floor", title: "Tables And Floor Operations", titleIt: "Tavoli e operazioni sala", path: "tenant-admin/tables-and-floor.md", group: "Tenant Admin" },
  { slug: "tenant-admin-customers-analytics-settings", title: "Customers, Analytics, And Settings", titleIt: "Clienti, statistiche e impostazioni", path: "tenant-admin/customers-analytics-settings.md", group: "Tenant Admin" },
  { slug: "tenant-admin-notifications-and-email", title: "Notifications And Email", titleIt: "Notifiche ed email", path: "tenant-admin/notifications-and-email.md", group: "Tenant Admin" },
  { slug: "tenant-admin-operational-playbooks", title: "Operational Playbooks", titleIt: "Playbook operativi", path: "tenant-admin/operational-playbooks.md", group: "Tenant Admin" },
  { slug: "tenant-admin-faq", title: "Staff FAQ", titleIt: "FAQ staff", path: "tenant-admin/faq.md", group: "Tenant Admin" },
];

const docsBySlug = new Map(PLATFORM_DOCS.map((doc) => [doc.slug, doc]));
const docsByPath = new Map(PLATFORM_DOCS.map((doc) => [doc.path, doc]));

export function platformDocBySlug(slug: string | undefined): PlatformDoc {
  return docsBySlug.get(slug ?? "") ?? PLATFORM_DOCS[0];
}

export function platformDocLang(input: string | undefined): PlatformDocLang {
  return input === "it" ? "it" : "en";
}

export function platformDocTitle(doc: PlatformDoc, lang: PlatformDocLang): string {
  return lang === "it" ? doc.titleIt : doc.title;
}

export function platformDocGroupLabel(group: PlatformDoc["group"], lang: PlatformDocLang): string {
  if (lang === "en") return group;
  switch (group) {
    case "Overview": return "Panoramica";
    case "Platform Admin": return "Admin piattaforma";
    case "Tenant Admin": return "Admin tenant";
  }
}

export async function readPlatformDoc(doc: PlatformDoc, lang: PlatformDocLang = "en"): Promise<string> {
  const docsRoot = path.join(process.cwd(), "docs");
  const absolute = path.resolve(docsRoot, lang === "it" ? path.join("it", doc.path) : doc.path);
  if (!absolute.startsWith(path.resolve(docsRoot))) {
    throw new Error("Invalid documentation path.");
  }
  return readFile(absolute, "utf8");
}

export function renderMarkdown(
  markdown: string,
  currentDoc: PlatformDoc,
  lang: PlatformDocLang = "en",
  basePath = "/platform/docs",
): ReactNode[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = /^```(\w+)?\s*$/.exec(line);
    if (fence) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(
        <pre key={blocks.length} className="overflow-x-auto rounded-lg border border-outline-variant/30 bg-surface-container-high p-3 text-xs leading-relaxed text-on-surface">
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const children = renderInline(heading[2], currentDoc, lang, basePath);
      const className = level === 1
        ? "text-2xl font-semibold text-on-surface"
        : level === 2
          ? "mt-8 text-lg font-semibold text-on-surface"
          : "mt-5 text-sm font-semibold uppercase text-on-surface-variant";
      if (level === 1) blocks.push(<h1 key={blocks.length} className={className}>{children}</h1>);
      else if (level === 2) blocks.push(<h2 key={blocks.length} className={className}>{children}</h2>);
      else blocks.push(<h3 key={blocks.length} className={className}>{children}</h3>);
      i += 1;
      continue;
    }

    if (isTableStart(lines, i)) {
      const header = splitTableRow(lines[i]);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      blocks.push(
        <div key={blocks.length} className="overflow-x-auto rounded-lg border border-outline-variant/30">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-container-high text-left text-on-surface">
              <tr>{header.map((cell, idx) => <th key={idx} className="px-3 py-2 font-semibold">{renderInline(cell, currentDoc, lang, basePath)}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {rows.map((row, rowIdx) => (
                <tr key={rowIdx}>
                  {header.map((_, cellIdx) => (
                    <td key={cellIdx} className="px-3 py-2 text-on-surface-variant align-top">
                      {renderInline(row[cellIdx] ?? "", currentDoc, lang, basePath)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^-\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ul key={blocks.length} className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-on-surface-variant">
          {items.map((item, idx) => <li key={idx}>{renderInline(item, currentDoc, lang, basePath)}</li>)}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ol key={blocks.length} className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-on-surface-variant">
          {items.map((item, idx) => <li key={idx}>{renderInline(item, currentDoc, lang, basePath)}</li>)}
        </ol>,
      );
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines, i)) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push(
      <p key={blocks.length} className="text-sm leading-relaxed text-on-surface-variant">
        {renderInline(paragraph.join(" "), currentDoc, lang, basePath)}
      </p>,
    );
  }

  return blocks;
}

function isBlockStart(lines: string[], index: number): boolean {
  const line = lines[index];
  return /^```/.test(line) || /^#{1,4}\s+/.test(line) || /^-\s+/.test(line) || /^\d+\.\s+/.test(line) || isTableStart(lines, index);
}

function isTableStart(lines: string[], index: number): boolean {
  return /^\|/.test(lines[index] ?? "") && /^\|\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(lines[index + 1] ?? "");
}

function splitTableRow(row: string): string[] {
  return row.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function renderInline(text: string, currentDoc: PlatformDoc, lang: PlatformDocLang, basePath: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={parts.length} className="font-semibold text-on-surface">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      parts.push(<code key={parts.length} className="rounded bg-surface-container-high px-1 py-0.5 text-[0.85em] text-on-surface">{token.slice(1, -1)}</code>);
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (link) {
        const href = resolveDocHref(link[2], currentDoc, basePath);
        parts.push(
          <Link key={parts.length} href={href} className="font-medium text-primary hover:text-primary/70">
            {link[1]}
          </Link>,
        );
      }
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function resolveDocHref(href: string, currentDoc: PlatformDoc, basePath: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  const withoutAnchor = href.split("#")[0];
  if (!withoutAnchor.endsWith(".md")) return href;
  const normalized = path.posix.normalize(path.posix.join(path.posix.dirname(currentDoc.path), withoutAnchor.replace(/^\.\//, "")));
  const doc = docsByPath.get(normalized);
  return doc ? `${basePath}?doc=${encodeURIComponent(doc.slug)}` : basePath;
}
