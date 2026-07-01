import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { IMPERSONATION_COOKIE, SESSION_COOKIE } from "@/lib/reservations/auth";
import { isImpersonationSession, resolveAdminPage } from "@/lib/reservations/tenant-context";
import AdminShell from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function PanelLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  // Resolve the tenant by URL slug and require a session minted for THAT tenant
  // (the slug<->session match is the cross-tenant guard; the proxy already
  // ensured a session cookie is present).
  const { slug } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const impersonationToken = cookieStore.get(IMPERSONATION_COOKIE)?.value;
  const ctx = await resolveAdminPage(slug, token, impersonationToken);
  if (!ctx) redirect(`/admin/${encodeURIComponent(slug)}/login`);

  return (
    <AdminShell
      slug={slug}
      brandName={ctx.tenant.name}
      logoUrl={ctx.tenant.settings.logoUrl}
      impersonation={isImpersonationSession(ctx.session) ? { operator: ctx.session.impersonatedBy } : undefined}
    >
      {children}
    </AdminShell>
  );
}
