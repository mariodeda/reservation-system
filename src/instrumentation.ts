/**
 * Next.js instrumentation hook — runs once on Node runtime startup.
 * Applies any pending schema migrations before the first request arrives.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureSchema } = await import("./lib/reservations/mysql-schema");
    await ensureSchema();
    // Self-healing platform-admin seed: recreates the default operator whenever
    // platform_admins is empty (e.g. after a manual reset). Idempotent.
    const { ensureBootstrapPlatformAdmin } = await import("./lib/reservations/bootstrap");
    await ensureBootstrapPlatformAdmin();
  }
}
