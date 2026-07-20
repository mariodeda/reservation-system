import { redirect } from "next/navigation";

// The reservation service has no public landing page; send the root to the
// platform operator console (which redirects to /platform/login when
// unauthenticated).
export default function Home() {
  redirect("/platform");
}
