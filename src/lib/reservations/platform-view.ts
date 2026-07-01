/** Serialises a tenant for the platform console — hosts included, secrets stripped. */
import type { TenantStore } from "./tenant-store";
import type { Tenant, TenantSettings } from "./tenant";
import { redactSettings } from "./sanitize-tenant";
import { getSmtpHealth, type SmtpHealth } from "./smtp-health-store";

export interface TenantView {
  id: string;
  slug: string;
  name: string;
  status: Tenant["status"];
  /** Stable public key marketing sites send to select this tenant. */
  publicKey: string;
  createdAt: string;
  hosts: string[];
  settings: TenantSettings & { smtpPassSet: boolean };
  smtpHealth: SmtpHealth | { status: "unknown" };
}

export async function tenantView(store: TenantStore, t: Tenant): Promise<TenantView> {
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    status: t.status,
    publicKey: t.publicKey,
    createdAt: t.createdAt,
    hosts: await store.listDomains(t.id),
    settings: redactSettings(t.settings),
    smtpHealth: (await getSmtpHealth(t.id)) ?? { status: "unknown" },
  };
}
