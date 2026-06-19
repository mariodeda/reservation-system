"use client";

/** Platform-console client helpers: a 401-aware fetch (redirects to the platform
 *  login) and the shared toast. */
export { toast } from "@/components/admin/api";

export async function platformFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, { cache: "no-store", ...init });
  if (res.status === 401 && typeof window !== "undefined") {
    const next = encodeURIComponent(window.location.pathname);
    window.location.href = `/platform/login?next=${next}`;
    throw new Error("Session expired");
  }
  return res;
}

export async function platformJson<T = unknown>(input: string, init?: RequestInit): Promise<T> {
  const res = await platformFetch(input, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Request failed");
  return data as T;
}

export interface TenantView {
  id: string;
  slug: string;
  name: string;
  status: "active" | "disabled";
  publicKey: string;
  createdAt: string;
  hosts: string[];
  settings: {
    name: string;
    url: string;
    contactEmail: string;
    contactPhone: string;
    locale: string;
    timezone: string;
    autoConfirm: boolean;
    emailEnabled: boolean;
    feedbackEnabled?: boolean;
    emailFrom?: string;
    theme?: { primary?: string; onPrimary?: string };
    logoUrl?: string;
    allowedOrigins?: string[];
    smtp?: { host: string; port: number; secure: boolean; user?: string; from?: string };
    smtpPassSet: boolean;
    emailTemplates?: {
      confirmation?: { subject: string; text: string; html: string };
      feedbackRequest?: { subject: string; text: string; html: string };
    };
  };
}
