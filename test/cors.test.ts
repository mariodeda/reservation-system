import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { allowedOrigin, preflight, withCors } from "@/lib/reservations/cors";
import type { Tenant } from "@/lib/reservations/tenant";

function tenant(origins?: string[]): Tenant {
  return {
    id: "t1",
    slug: "t1",
    name: "T1",
    status: "active",
    publicKey: "pk_test",
    settings: {
      name: "T1", url: "", contactEmail: "", contactPhone: "",
      locale: "en-US", timezone: "Europe/Rome", autoConfirm: true, emailEnabled: false,
      ...(origins ? { allowedOrigins: origins } : {}),
    },
    adminUsername: "staff",
    adminPasswordHash: "scrypt$x$y",
    createdAt: new Date(0).toISOString(),
  };
}

const reqWith = (origin?: string) =>
  new NextRequest("http://reservations.example.com/api/availability?tenant=pk_test", {
    headers: origin ? { origin } : {},
  });

describe("CORS per-tenant", () => {
  it("echoes an allowed origin, rejects others, ignores absent Origin", () => {
    const t = tenant(["https://www.osteria.com"]);
    expect(allowedOrigin(reqWith("https://www.osteria.com"), t)).toBe("https://www.osteria.com");
    expect(allowedOrigin(reqWith("https://evil.com"), t)).toBeNull();
    expect(allowedOrigin(reqWith(), t)).toBeNull(); // same-origin / server-to-server
  });

  it("matches origins case-insensitively", () => {
    const t = tenant(["https://www.osteria.com"]);
    expect(allowedOrigin(reqWith("https://WWW.Osteria.com"), t)).toBe("https://WWW.Osteria.com");
  });

  it("never allows cross-origin when the tenant has no allow-list", () => {
    expect(allowedOrigin(reqWith("https://www.osteria.com"), tenant())).toBeNull();
  });

  it("withCors sets ACAO + Vary only when an origin is given", () => {
    const yes = withCors(NextResponse.json({ ok: true }), "https://www.osteria.com");
    expect(yes.headers.get("access-control-allow-origin")).toBe("https://www.osteria.com");
    expect(yes.headers.get("vary")).toContain("Origin");
    const no = withCors(NextResponse.json({ ok: true }), null);
    expect(no.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("preflight returns 204 + headers for an allowed origin, 403 otherwise", () => {
    const t = tenant(["https://www.osteria.com"]);
    const ok = preflight(reqWith("https://www.osteria.com"), t);
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-methods")).toContain("POST");
    expect(preflight(reqWith("https://evil.com"), t).status).toBe(403);
    expect(preflight(reqWith("https://www.osteria.com"), null).status).toBe(403);
  });
});
