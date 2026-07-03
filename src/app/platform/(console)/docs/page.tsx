import Link from "next/link";
import { PLATFORM_DOCS, platformDocBySlug, readPlatformDoc, renderMarkdown } from "@/lib/platform-docs";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Platform Documentation",
  robots: { index: false, follow: false },
};

export default async function PlatformDocsPage({
  searchParams,
}: {
  searchParams?: Promise<{ doc?: string }>;
}) {
  const params = await searchParams;
  const activeDoc = platformDocBySlug(params?.doc);
  const markdown = await readPlatformDoc(activeDoc);
  const groups = Array.from(new Set(PLATFORM_DOCS.map((doc) => doc.group)));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-on-surface">Documentation</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Platform and tenant-admin operating guide generated from the repository Markdown docs.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="rounded-xl border border-outline-variant/30 bg-surface-container p-2 lg:sticky lg:top-20 lg:self-start">
          {groups.map((group) => (
            <div key={group} className="mb-3 last:mb-0">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/70">
                {group}
              </div>
              <div className="space-y-1">
                {PLATFORM_DOCS.filter((doc) => doc.group === group).map((doc) => {
                  const active = doc.slug === activeDoc.slug;
                  return (
                    <Link
                      key={doc.slug}
                      href={`/platform/docs?doc=${encodeURIComponent(doc.slug)}`}
                      className={`block rounded-lg px-2.5 py-2 text-sm transition ${
                        active
                          ? "bg-primary/15 text-primary"
                          : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                      }`}
                    >
                      {doc.title}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>

        <article className="rounded-xl border border-outline-variant/30 bg-surface-container p-4 sm:p-6">
          <div className="mx-auto max-w-3xl space-y-4">
            {renderMarkdown(markdown, activeDoc)}
          </div>
        </article>
      </div>
    </div>
  );
}

