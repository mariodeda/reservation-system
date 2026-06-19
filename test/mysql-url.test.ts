import { describe, it, expect } from "vitest";
import { parseDatabaseUrl, normalizeHost } from "@/lib/reservations/mysql-pool";

describe("normalizeHost", () => {
  it("forces localhost to IPv4 loopback (avoids ::1 grant mismatch)", () => {
    expect(normalizeHost("localhost")).toBe("127.0.0.1");
  });
  it("leaves other hosts untouched", () => {
    expect(normalizeHost("127.0.0.1")).toBe("127.0.0.1");
    expect(normalizeHost("db.host")).toBe("db.host");
    expect(normalizeHost(undefined)).toBeUndefined();
  });
});

describe("parseDatabaseUrl", () => {
  it("parses a plain URL", () => {
    expect(parseDatabaseUrl("mysql://user:pass@db.host:3306/reservations")).toEqual({
      host: "db.host",
      port: 3306,
      user: "user",
      password: "pass",
      database: "reservations",
    });
  });

  it("accepts a raw password with URL-significant characters", () => {
    // The reported case: "x/V0|=N9" — breaks new URL(), must work raw here.
    const opts = parseDatabaseUrl("mysql://dbuser:x/V0|=N9@db.host:3306/reservations");
    expect(opts?.password).toBe("x/V0|=N9");
    expect(opts?.user).toBe("dbuser");
    expect(opts?.host).toBe("db.host");
    expect(opts?.port).toBe(3306);
    expect(opts?.database).toBe("reservations");
  });

  it("takes the password up to the LAST '@'", () => {
    const opts = parseDatabaseUrl("mysql://u:p@ss/w@rd@db.host/reservations");
    expect(opts?.password).toBe("p@ss/w@rd");
    expect(opts?.host).toBe("db.host");
  });

  it("still decodes already percent-encoded credentials (back-compat)", () => {
    const opts = parseDatabaseUrl("mysql://user:x%2FV0%7C%3DN9@db.host:3306/reservations");
    expect(opts?.password).toBe("x/V0|=N9");
  });

  it("omits database when the path is empty", () => {
    const opts = parseDatabaseUrl("mysql://user:pass@db.host:3306");
    expect(opts?.database).toBeUndefined();
    expect(opts?.host).toBe("db.host");
  });

  it("defaults the port to undefined when absent", () => {
    const opts = parseDatabaseUrl("mysql://user:pass@db.host/reservations");
    expect(opts?.port).toBeUndefined();
    expect(opts?.host).toBe("db.host");
  });

  it("normalizes a localhost URL host to 127.0.0.1", () => {
    expect(parseDatabaseUrl("mysql://user:pass@localhost:3306/db")?.host).toBe("127.0.0.1");
  });

  it("handles a URL with no credentials", () => {
    const opts = parseDatabaseUrl("mysql://db.host:3306/reservations");
    expect(opts?.user).toBeUndefined();
    expect(opts?.password).toBeUndefined();
    expect(opts?.host).toBe("db.host");
  });

  it("handles bracketed IPv6 hosts", () => {
    const opts = parseDatabaseUrl("mysql://user:pass@[::1]:3306/reservations");
    expect(opts?.host).toBe("::1");
    expect(opts?.port).toBe(3306);
  });

  it("enables TLS from the query string", () => {
    expect(parseDatabaseUrl("mysql://u:p@h/db?ssl=true")?.ssl).toEqual({
      rejectUnauthorized: false,
    });
    expect(parseDatabaseUrl("mysql://u:p@h/db?sslmode=verify-full")?.ssl).toEqual({
      rejectUnauthorized: true,
    });
    expect(parseDatabaseUrl("mysql://u:p@h/db?sslmode=disable")?.ssl).toBeUndefined();
  });

  it("returns null for non-mysql strings", () => {
    expect(parseDatabaseUrl("postgres://u:p@h/db")).toBeNull();
    expect(parseDatabaseUrl("not-a-url")).toBeNull();
  });
});
