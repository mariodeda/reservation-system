import { redirect } from "next/navigation";

// The reservation service has no public landing page; send the root to the
// staff admin (which redirects to /admin/login when unauthenticated).
export default function Home() {
  redirect("/admin");
}
