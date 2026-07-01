import { NextResponse } from "next/server";
import { IMPERSONATION_COOKIE, SESSION_COOKIE } from "@/lib/reservations/auth";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(IMPERSONATION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
