import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { actorFromToken } from "./domain/accounts";
import { AppError } from "./errors";
import { DEFAULT_LANG, LANG_COOKIE, t, type Lang } from "@/lib/i18n";
import type { Actor } from "./actor";

export const DASH_COOKIE = "khatm_session";
export const POS_COOKIE = "khatm_pos";

export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return v === "en" || v === "ar" ? v : DEFAULT_LANG;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
}

export async function userAgent(): Promise<string | null> {
  return (await headers()).get("user-agent");
}

export async function getDashboardActor(): Promise<Actor | null> {
  return actorFromToken((await cookies()).get(DASH_COOKIE)?.value, "dashboard");
}

export async function requireDashboardActor(): Promise<Actor> {
  const a = await getDashboardActor();
  if (!a) redirect("/login");
  return a;
}

export async function getPosActor(): Promise<Actor | null> {
  return actorFromToken((await cookies()).get(POS_COOKIE)?.value, "staff");
}

export async function setSessionCookie(name: string, token: string, days: number) {
  (await cookies()).set(name, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: days * 86400,
  });
}

export type ActionState = { error?: string; ok?: string; fieldErrors?: Record<string, string> } | undefined;

/** Translates domain/validation errors into a user-facing message in the current language. */
export async function errorMessage(e: unknown): Promise<string> {
  const lang = await getLang();
  if (e instanceof AppError) return t(lang, e.code, e.params);
  if (e instanceof ZodError) {
    const first = e.issues[0]?.message;
    return t(lang, first?.startsWith("errors.") ? first : "errors.invalidInput");
  }
  // Re-throw Next.js control-flow errors (redirect/notFound).
  if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
  console.error(e);
  return t(lang, "errors.generic");
}

export async function apiError(e: unknown): Promise<Response> {
  const lang = await getLang();
  if (e instanceof AppError) return Response.json({ error: t(lang, e.code, e.params), code: e.code }, { status: e.status });
  if (e instanceof ZodError) return Response.json({ error: t(lang, "errors.invalidInput"), code: "errors.invalidInput" }, { status: 400 });
  console.error(e);
  return Response.json({ error: t(lang, "errors.generic"), code: "errors.generic" }, { status: 500 });
}

export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
