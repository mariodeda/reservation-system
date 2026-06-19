import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/reservations/auth";
import { resolveAdminPage } from "@/lib/reservations/tenant-context";
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
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const ctx = await resolveAdminPage(slug, token);
  if (!ctx) redirect(`/admin/${encodeURIComponent(slug)}/login`);

  return (
    <AdminShell slug={slug} brandName={ctx.tenant.name} logoUrl={ctx.tenant.settings.logoUrl}>
      {children}
    </AdminShell>
  );
}
