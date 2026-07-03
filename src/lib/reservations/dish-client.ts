import type { DishIntegration } from "./dish-store";

const DISH_BASE_URL = "https://reservation.dish.co";
const DISH_SSO_URL = "https://sso.dish.co";
const DISH_HTTP_TIMEOUT_MS = 20_000;
const DISH_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

export interface DishReservationListItem {
  externalId: string;
  status: string;
  origin?: string;
  email?: string;
  language?: string;
  startDate: string;
  editUrl: string;
  name: string;
  partySize: number;
  notes?: string;
  rowText: string;
}

export interface DishReservationDetail {
  externalId: string;
  status?: string;
  source?: string;
  partySize?: number;
  startDate?: string;
  endDate?: string;
  createdAt?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  phone?: string;
  email?: string;
  occasion?: string;
  notes?: string;
  internalGuestInformation?: string;
  allergies?: string;
  diet?: string;
  visits?: string;
  rawText: string;
}

interface CookieJar {
  header(url: string): string;
  store(url: string, headers: Headers): void;
}

function createCookieJar(): CookieJar {
  const cookies = new Map<string, string>();
  return {
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    store(_url, headers) {
      const headersWithSetCookie = headers as Headers & { getSetCookie?: () => string[] };
      const setCookie = typeof headersWithSetCookie.getSetCookie === "function"
        ? headersWithSetCookie.getSetCookie()
        : (headers.get("set-cookie") ? [headers.get("set-cookie")!] : []);
      for (const raw of setCookie) {
        const [pair] = raw.split(";");
        const eq = pair.indexOf("=");
        if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
    },
  };
}

function absoluteUrl(pathOrUrl: string): string {
  return pathOrUrl.startsWith("http") ? pathOrUrl : `${DISH_BASE_URL}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

function withEstablishment(url: string, establishmentId?: string): string {
  if (!establishmentId) return url;
  const next = new URL(url);
  if (!next.searchParams.has("est")) next.searchParams.set("est", establishmentId);
  return next.toString();
}

function resolveUrl(pathOrUrl: string, baseUrl: string): string {
  return new URL(decodeHtml(pathOrUrl), baseUrl).toString();
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISH_HTTP_TIMEOUT_MS);
  try {
    const headers = new Headers(init.headers);
    if (!headers.has("user-agent")) headers.set("user-agent", DISH_USER_AGENT);
    if (!headers.has("accept")) headers.set("accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
    if (!headers.has("accept-language")) headers.set("accept-language", "en-US,en;q=0.9,it-IT;q=0.8,it;q=0.7");
    return await fetch(url, { ...init, headers, signal: init.signal ?? controller.signal, redirect: "manual" });
  } catch (err) {
    if (controller.signal.aborted) throw new Error("DISH request timed out.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function request(jar: CookieJar, url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const cookie = jar.header(url);
  if (cookie) headers.set("cookie", cookie);
  const res = await fetchWithTimeout(url, { ...init, headers });
  jar.store(url, res.headers);
  return res;
}

function redirectLocation(res: Response): string | null {
  return res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
}

function assertNotRedirected(res: Response, context: string): void {
  const location = redirectLocation(res);
  if (location) {
    const target = location.startsWith("http") ? new URL(location) : null;
    const host = target?.host ? ` to ${target.host}` : "";
    throw new Error(`${context} redirected${host}; DISH login/session is not valid.`);
  }
}

function attr(html: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}="([^"]*)"`, "i").exec(html);
  return match ? decodeHtml(match[1]) : undefined;
}

function parseFormValues(html: string): URLSearchParams {
  const params = new URLSearchParams();
  const inputRe = /<input\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = inputRe.exec(html))) {
    const input = match[0];
    const name = attr(input, "name");
    if (!name) continue;
    params.set(name, attr(input, "value") ?? "");
  }
  return params;
}

export function buildDishLoginBody(html: string, email: string, password: string): URLSearchParams {
  const body = parseFormValues(html);
  body.set("username", email.trim());
  body.set("password", password);
  body.set("login", body.get("login") || "Log In");

  // DISH's SSO page disables this hidden input when the email tab is used.
  // URLSearchParams has no disabled-input concept, so omit it explicitly.
  body.delete("is_mobile");
  if (!body.has("country_code")) body.set("country_code", "");
  return body;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function stripTags(html: string): string {
  return decodeHtml(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function fieldAfter(text: string, label: string): string | undefined {
  const labels = ["Status", "'#' Guests", "Date", "Source", "Occasion", "Created", "Last name", "First name", "Phone", "Email", "Visits", "Reservation notes", "Internal guest information", "Allergies", "Diet"];
  const start = text.indexOf(label);
  if (start < 0) return undefined;
  const after = text.slice(start + label.length).trim();
  let end = after.length;
  for (const next of labels) {
    if (next === label) continue;
    const idx = after.indexOf(next);
    if (idx >= 0 && idx < end) end = idx;
  }
  const value = after.slice(0, end).trim();
  return value || undefined;
}

function parsePartySize(text: string): number {
  const match = /(\d+)\s+guest\(s\)/i.exec(text) ?? /'#'\s+Guests\s+(\d+)/i.exec(text);
  return match ? Math.max(1, Math.trunc(Number(match[1])) || 1) : 1;
}

function cleanDishGuestName(value: string | undefined): string | undefined {
  const cleaned = (value ?? "")
    // DISH can render responsive contact labels inside reservation rows; after
    // tag stripping they show up as guest-name text like "Ph o ne Em a il".
    .replace(/(^|\s)["'“”]?\s*P\s*h\s*o\s*n\s*e\s+E\s*m\s*a\s*i\s*l\s*["'“”]?(?=\s|$)/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();
  return cleaned || undefined;
}

function parseNameFromRow(text: string): string {
  return cleanDishGuestName(text
    .replace(/^\d{1,2}:\d{2}\s*(AM|PM)\s*/i, "")
    .replace(/\s+\d+\s+guest\(s\)[\s\S]*$/i, "")
    .trim()) || "DISH guest";
}

function parseNotes(text: string): string | undefined {
  const notes = [...text.matchAll(/"([^"]+)"\s+\((Reservation Note|Guest request)\)/g)]
    .map((m) => `${m[2]}: ${m[1].trim()}`)
    .filter(Boolean);
  return notes.length ? notes.join("\n") : undefined;
}

export function parseDishReservationList(html: string): DishReservationListItem[] {
  const out: DishReservationListItem[] = [];
  const rowRe = /<[^>]+data-reservation-id="([^"]+)"[\s\S]*?(?=<[^>]+data-reservation-id="|<\/body>|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = rowRe.exec(html))) {
    const block = match[0];
    const text = stripTags(block);
    const externalId = decodeHtml(match[1]);
    const startDate = attr(block, "data-reservation-start-date");
    const editUrl = attr(block, "data-edit-url") ?? `/reservation/${externalId}`;
    if (!externalId || !startDate) continue;
    out.push({
      externalId,
      status: attr(block, "data-reservation-status") ?? "",
      origin: attr(block, "data-reservation-origin"),
      email: attr(block, "data-reservation-email"),
      language: attr(block, "data-reservation-languagecode"),
      startDate,
      editUrl,
      name: parseNameFromRow(text),
      partySize: parsePartySize(text),
      notes: parseNotes(text),
      rowText: text,
    });
  }
  return out;
}

export function parseDishReservationDetail(html: string, externalId: string): DishReservationDetail {
  const text = stripTags(html);
  const dateField = fieldAfter(text, "Date");
  const dateMatch = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s+(AM|PM)\s+-\s+(\d{1,2}):(\d{2})\s+(AM|PM)/i.exec(dateField ?? "");
  const toIso = (h: string, m: string, ampm: string) => {
    let hour = Number(h) % 12;
    if (ampm.toUpperCase() === "PM") hour += 12;
    return `${dateMatch?.[3]}-${dateMatch?.[2]}-${dateMatch?.[1]}T${String(hour).padStart(2, "0")}:${m}:00`;
  };
  const firstName = fieldAfter(text, "First name");
  const lastName = fieldAfter(text, "Last name");
  const name = cleanDishGuestName([firstName, lastName].filter(Boolean).join(" "));
  return {
    externalId,
    status: fieldAfter(text, "Status"),
    source: fieldAfter(text, "Source"),
    partySize: Number(fieldAfter(text, "'#' Guests") ?? "") || undefined,
    startDate: dateMatch ? toIso(dateMatch[4], dateMatch[5], dateMatch[6]) : undefined,
    endDate: dateMatch ? toIso(dateMatch[7], dateMatch[8], dateMatch[9]) : undefined,
    createdAt: fieldAfter(text, "Created"),
    firstName,
    lastName,
    name,
    phone: fieldAfter(text, "Phone"),
    email: fieldAfter(text, "Email"),
    occasion: fieldAfter(text, "Occasion"),
    notes: fieldAfter(text, "Reservation notes"),
    internalGuestInformation: fieldAfter(text, "Internal guest information"),
    allergies: fieldAfter(text, "Allergies"),
    diet: fieldAfter(text, "Diet"),
    visits: fieldAfter(text, "Visits"),
    rawText: text.slice(0, 5000),
  };
}

export class DishClient {
  private readonly jar = createCookieJar();

  constructor(private readonly integration: DishIntegration) {}

  async login(): Promise<void> {
    if (!this.integration.email || !this.integration.password) throw new Error("DISH credentials are not configured.");
    const landing = await request(this.jar, `${DISH_BASE_URL}/oauth2/authorization/dish-sso`);
    const loginUrl = landing.headers.get("location") ? resolveUrl(landing.headers.get("location")!, landing.url || DISH_BASE_URL) : landing.url;
    const loginPage = await request(this.jar, loginUrl.startsWith("http") ? loginUrl : `${DISH_SSO_URL}${loginUrl}`);
    const html = await loginPage.text();
    const action = /<form[^>]+action="([^"]+)"/i.exec(html)?.[1];
    if (!action) throw new Error("Could not find DISH login form.");
    const body = buildDishLoginBody(html, this.integration.email, this.integration.password);
    let currentUrl = resolveUrl(action, loginPage.url || DISH_SSO_URL);
    const loginRes = await request(this.jar, currentUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "origin": DISH_SSO_URL,
        "referer": loginPage.url,
      },
      body,
    });
    if (loginRes.status >= 400) {
      const text = stripTags(await loginRes.text());
      const invalidCredentials = /invalid\s+(email|username|login).*password|invalid.*password/i.test(text);
      throw new Error(invalidCredentials ? "DISH login failed: invalid email or password." : `DISH login failed (${loginRes.status}).`);
    }
    let next = loginRes.headers.get("location");
    let guard = 0;
    while (next && guard < 8) {
      currentUrl = resolveUrl(next, currentUrl);
      const res = await request(this.jar, currentUrl);
      if (res.status >= 400) throw new Error(`DISH login redirect failed (${res.status}).`);
      next = res.headers.get("location");
      guard += 1;
      if (!next && res.url.includes("/reservations")) return;
    }
    const check = await this.fetchReservationsHtml(new Date().toISOString().slice(0, 10));
    if (!check.includes("data-reservation-id") && /Log in|password/i.test(check)) {
      throw new Error("DISH login failed.");
    }
  }

  async fetchReservationsHtml(date: string): Promise<string> {
    const url = withEstablishment(
      `${DISH_BASE_URL}/reservations?date=${encodeURIComponent(date)}&endDate=${encodeURIComponent(date)}`,
      this.integration.establishmentId,
    );
    const res = await request(this.jar, url);
    assertNotRedirected(res, "DISH reservations request");
    if (res.status >= 400) throw new Error(`DISH reservations request failed (${res.status}).`);
    return res.text();
  }

  async fetchReservationDetailHtml(editUrl: string): Promise<string> {
    const res = await request(this.jar, withEstablishment(absoluteUrl(editUrl), this.integration.establishmentId));
    assertNotRedirected(res, "DISH reservation detail request");
    if (res.status >= 400) throw new Error(`DISH reservation detail request failed (${res.status}).`);
    return res.text();
  }
}

export async function testDishCredentials(integration: DishIntegration): Promise<void> {
  const client = new DishClient(integration);
  await client.login();
}
