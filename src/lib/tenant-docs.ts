import {
  PLATFORM_DOCS,
  platformDocBySlug,
  platformDocLang,
  platformDocTitle,
  readPlatformDoc,
  type PlatformDoc,
  type PlatformDocLang,
} from "./platform-docs";

export type TenantDoc = PlatformDoc;
export type TenantDocLang = PlatformDocLang;

export const TENANT_DOCS: TenantDoc[] = PLATFORM_DOCS.filter((doc) => doc.group === "Tenant Admin");

export function tenantDocBySlug(slug: string | undefined): TenantDoc {
  const doc = platformDocBySlug(slug);
  return doc.group === "Tenant Admin" ? doc : TENANT_DOCS[0];
}

export const tenantDocLang = platformDocLang;
export const tenantDocTitle = platformDocTitle;
export const readTenantDoc = readPlatformDoc;
