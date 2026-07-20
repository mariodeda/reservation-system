/** Serialises a tenant for the platform console — hosts included, secrets stripped. */
import type { TenantStore } from "./tenant-store";
import type { Tenant, TenantSettings } from "./tenant";
import { redactSettings } from "./sanitize-tenant";
import { getSmtpHealth, type SmtpHealth } from "./smtp-health-store";
import { getTheForkIntegration } from "./thefork-store";
import { getDishIntegration } from "./dish-store";

export interface ExternalSyncSummary {
  enabled: boolean;
  configured: boolean;
  lastSyncAt?: string;
  lastError?: string;
}

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
  externalSync: {
    theFork: ExternalSyncSummary;
    dish: ExternalSyncSummary;
  };
}

export async function tenantView(store: TenantStore, t: Tenant): Promise<TenantView> {
  const [hosts, smtpHealth, theFork, dish] = await Promise.all([
    store.listDomains(t.id),
    getSmtpHealth(t.id),
    getTheForkIntegration(t.id),
    getDishIntegration(t.id),
  ]);
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    status: t.status,
    publicKey: t.publicKey,
    createdAt: t.createdAt,
    hosts,
    settings: redactSettings(t.settings),
    smtpHealth: smtpHealth ?? { status: "unknown" },
    externalSync: {
      theFork: {
        enabled: Boolean(theFork?.enabled),
        configured: Boolean(theFork?.clientId && theFork.clientSecretSet && theFork.restaurantUuid),
        lastSyncAt: theFork?.lastSyncAt,
        lastError: theFork?.lastError,
      },
      dish: {
        enabled: Boolean(dish?.enabled),
        configured: Boolean(dish?.email && dish.passwordSet && dish.establishmentId),
        lastSyncAt: dish?.lastSyncAt,
        lastError: dish?.lastError,
      },
    },
  };
}
