import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/reservations/auth";
import { resolveAdminPage } from "@/lib/reservations/tenant-context";
import PrintSheet from "./PrintSheet";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Run sheet",
  robots: { index: false, follow: false },
};

export default async function PrintPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const ctx = await resolveAdminPage(slug, token);
  if (!ctx) redirect(`/admin/${encodeURIComponent(slug)}/login`);

  return <PrintSheet restaurantName={ctx.tenant.name} />;
}
