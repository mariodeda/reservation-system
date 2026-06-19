import { notFound } from "next/navigation";
import { tenantBySlug } from "@/lib/reservations/tenant-context";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Staff sign in",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await tenantBySlug(slug);
  if (!tenant) notFound();

  return (
    <LoginForm
      slug={slug}
      brandName={tenant.name}
      logoUrl={tenant.settings.logoUrl}
      themePrimary={tenant.settings.theme?.primary}
    />
  );
}
