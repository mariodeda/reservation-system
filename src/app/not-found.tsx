import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
      <p className="font-display-lg text-primary text-5xl">404</p>
      <h1 className="text-xl font-semibold text-on-surface">Page not found</h1>
      <Link href="/admin" className="text-primary underline underline-offset-4">
        Go to the admin console
      </Link>
    </div>
  );
}
