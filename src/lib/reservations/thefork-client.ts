import type { TheForkIntegration } from "./thefork-store";

export interface TheForkReservationDetail {
  reservationUuid: string;
  restaurantUuid: string;
  mealDate: string | null;
  mealStatus?: "PARTIALLY_ARRIVED" | "ARRIVED" | "SEATED" | "BILL" | "LEFT" | null;
  partySize: number;
  status: "RECORDED" | "CANCELED" | "NO_SHOW" | "REQUESTED" | "REFUSED";
  offerUuid?: string | null;
  customerNote?: string | null;
  restaurantNote?: string | null;
  customerUuid?: string | null;
  customFields?: unknown;
  offerDetails?: unknown;
  utmTrackingInformation?: unknown;
  billAmount?: unknown;
  reservationChannel?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TheForkCustomerDetail {
  customerUuid?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
}

interface TokenEntry {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenEntry>();
const THEFORK_HTTP_TIMEOUT_MS = 20_000;

function requireCredentials(integration: TheForkIntegration): { clientId: string; clientSecret: string } {
  if (!integration.clientId || !integration.clientSecret) {
    throw new Error("TheFork credentials are not configured.");
  }
  return { clientId: integration.clientId, clientSecret: integration.clientSecret };
}

export function clearTheForkTokenCache(): void {
  tokenCache.clear();
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = THEFORK_HTTP_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: init.signal ?? controller.signal });
  } catch (err) {
    if (controller.signal.aborted) throw new Error("TheFork API request timed out.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function getTheForkAccessToken(integration: TheForkIntegration): Promise<string> {
  const cached = tokenCache.get(integration.tenantId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const { clientId, clientSecret } = requireCredentials(integration);
  const body = new URLSearchParams({
    audience: "https://api.thefork.io",
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetchWithTimeout("https://auth.thefork.io/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || typeof data.access_token !== "string") {
    throw new Error(`TheFork token request failed (${res.status}).`);
  }
  const ttl = Math.min(8600, Math.max(60, Number(data.expires_in ?? 8600)));
  tokenCache.set(integration.tenantId, { token: data.access_token, expiresAt: Date.now() + ttl * 1000 });
  return data.access_token;
}

async function theForkJson<T>(integration: TheForkIntegration, path: string): Promise<T> {
  const token = await getTheForkAccessToken(integration);
  const res = await fetchWithTimeout(`https://api.thefork.io/manager${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`TheFork API request failed (${res.status}).`);
  return data as T;
}

export async function fetchTheForkReservation(
  integration: TheForkIntegration,
  reservationUuid: string,
): Promise<TheForkReservationDetail> {
  return theForkJson<TheForkReservationDetail>(integration, `/v1/reservations/${encodeURIComponent(reservationUuid)}`);
}

export async function fetchTheForkCustomer(
  integration: TheForkIntegration,
  customerUuid: string,
): Promise<TheForkCustomerDetail | null> {
  try {
    return await theForkJson<TheForkCustomerDetail>(integration, `/v1/customers/${encodeURIComponent(customerUuid)}`);
  } catch {
    return null;
  }
}

export interface TheForkReservationListPage {
  data: string[];
  totalCount: number;
  page: number;
  limit: number;
}

export async function fetchTheForkReservationIds(
  integration: TheForkIntegration,
  params: { startDate: string; endDate: string; filterBy?: "updatedDate" | "mealDate"; page?: number; limit?: number },
): Promise<TheForkReservationListPage> {
  const sp = new URLSearchParams({
    startDate: params.startDate,
    endDate: params.endDate,
    filterBy: params.filterBy ?? "updatedDate",
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 100),
  });
  if (integration.restaurantUuid) sp.set("restaurantUuid", integration.restaurantUuid);
  else if (integration.groupUuid) sp.set("groupUuid", integration.groupUuid);
  else throw new Error("TheFork restaurant UUID or group UUID is required.");
  return theForkJson<TheForkReservationListPage>(integration, `/v1/reservations?${sp.toString()}`);
}

export async function testTheForkCredentials(integration: TheForkIntegration): Promise<void> {
  await getTheForkAccessToken(integration);
  if (integration.restaurantUuid || integration.groupUuid) {
    const today = new Date().toISOString().slice(0, 10);
    await fetchTheForkReservationIds(integration, {
      startDate: today,
      endDate: today,
      filterBy: "updatedDate",
      page: 1,
      limit: 1,
    });
  }
}
