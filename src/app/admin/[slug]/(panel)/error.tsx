"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-5 text-center px-4">
      <div className="w-12 h-12 rounded-full bg-rose-500/15 flex items-center justify-center text-rose-400 text-xl">
        !</div>
      <div>
        <h2 className="text-lg font-semibold mb-1">Something went wrong</h2>
        <p className="text-sm text-on-surface-variant max-w-sm">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
      </div>
      <button
        onClick={reset}
        className="bg-primary text-on-primary px-5 py-2 rounded-lg text-sm font-semibold hover:brightness-110"
      >
        Try again
      </button>
    </div>
  );
}
