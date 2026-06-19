import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/reservations/auth";
import { tenantByHost } from "@/lib/reservations/tenant-context";
import AdminShell from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  // Resolve the tenant by host and require a session minted for THAT tenant
  // (defense in depth — the proxy already gates these paths).
  const host = (await headers()).get("host")?.split(":")[0].trim().toLowerCase() ?? "";
  const tenant = await tenantByHost(host);
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!tenant || !session || session.tid !== tenant.id) redirect("/admin/login");

  return <AdminShell brandName={tenant.name}>{children}</AdminShell>;
}
