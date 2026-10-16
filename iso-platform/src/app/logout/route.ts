import { NextResponse } from "next/server";
import { logout } from "@/server/domain/auth";
import { SESSION_COOKIE, sessionToken } from "@/server/web";

export async function POST(req: Request) {
  const t = await sessionToken();
  if (t) await logout(t);
  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
