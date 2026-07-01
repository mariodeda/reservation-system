import { smtpTransport } from "./email";
import { getTenantStore } from "./tenant-store";
import type { Tenant } from "./tenant";
import { upsertSmtpHealth, type SmtpHealth } from "./smtp-health-store";

const MAX_REASON = 160;

function reasonOf(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || "SMTP check failed");
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_REASON) || "SMTP check failed";
}

export async function checkTenantSmtp(tenant: Tenant): Promise<SmtpHealth> {
  const checkedAt = new Date().toISOString();
  const smtp = tenant.settings.smtp;
  if (!smtp?.host || !smtp.port) {
    return { tenantId: tenant.id, status: "not_configured", reason: "SMTP host or port missing", checkedAt };
  }
  if (smtp.user && !smtp.pass) {
    return { tenantId: tenant.id, status: "not_configured", reason: "SMTP password missing", checkedAt };
  }

  const started = Date.now();
  try {
    const transport = smtpTransport(smtp);
    await transport.verify();
    return {
      tenantId: tenant.id,
      status: "ok",
      checkedAt,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      tenantId: tenant.id,
      status: "failed",
      reason: reasonOf(err),
      checkedAt,
      latencyMs: Date.now() - started,
    };
  }
}

export async function runSmtpHealthChecks(): Promise<SmtpHealth[]> {
  const tenants = await getTenantStore().list();
  const results: SmtpHealth[] = [];
  for (const tenant of tenants) {
    const result = await checkTenantSmtp(tenant);
    await upsertSmtpHealth(result);
    results.push(result);
  }
  return results;
}
