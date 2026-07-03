import Link from "next/link";
import { renderMarkdown } from "@/lib/platform-docs";
import {
  readTenantDoc,
  tenantDocBySlug,
  tenantDocLang,
  tenantDocTitle,
  TENANT_DOCS,
} from "@/lib/tenant-docs";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tenant Documentation",
  robots: { index: false, follow: false },
};

export default async function TenantDocsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ doc?: string; lang?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const activeDoc = tenantDocBySlug(query?.doc);
  const lang = tenantDocLang(query?.lang);
  const basePath = `/admin/${encodeURIComponent(slug)}/docs`;
  const markdown = await readTenantDoc(activeDoc, lang);
  const copy = lang === "it"
    ? {
        title: "Guida staff",
        subtitle: "Documentazione operativa per usare il pannello del ristorante, gestire prenotazioni, tavoli, disponibilita, clienti, notifiche ed email.",
        section: "Admin ristorante",
      }
    : {
        title: "Staff Guide",
        subtitle: "Operational documentation for using the restaurant panel, reservations, tables, availability, customers, notifications, and email.",
        section: "Restaurant Admin",
      };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">{copy.title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-on-surface-variant">
            {copy.subtitle}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="rounded-xl border border-outline-variant/30 bg-surface-container p-2 lg:sticky lg:top-20 lg:self-start">
          <div className="mb-3 last:mb-0">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/70">
              {copy.section}
            </div>
            <div className="space-y-1">
              {TENANT_DOCS.map((doc) => {
                const active = doc.slug === activeDoc.slug;
                return (
                  <Link
                    key={doc.slug}
                    href={`${basePath}?doc=${encodeURIComponent(doc.slug)}${lang === "it" ? "&lang=it" : ""}`}
                    className={`block rounded-lg px-2.5 py-2 text-sm transition ${
                      active
                        ? "bg-primary/15 text-primary"
                        : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                    }`}
                  >
                    {tenantDocTitle(doc, lang)}
                  </Link>
                );
              })}
            </div>
          </div>
        </aside>

        <article className="rounded-xl border border-outline-variant/30 bg-surface-container p-4 sm:p-6">
          <div className="mx-auto max-w-3xl space-y-4">
            {renderMarkdown(markdown, activeDoc, lang, basePath)}
          </div>
        </article>
      </div>
    </div>
  );
}
