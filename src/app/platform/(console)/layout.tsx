import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PLATFORM_COOKIE, verifyPlatformSession } from "@/lib/reservations/platform-auth";
import PlatformShell from "@/components/platform/PlatformShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Platform",
  robots: { index: false, follow: false },
};

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await verifyPlatformSession((await cookies()).get(PLATFORM_COOKIE)?.value);
  if (!session) redirect("/platform/login");
  return <PlatformShell username={session.u}>{children}</PlatformShell>;
}
