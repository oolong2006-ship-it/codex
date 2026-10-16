import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, type SessionInfo } from "./domain/auth";
import { resolveCtx, type TenantCtx } from "./domain/tenant";
import { isDomainError } from "./errors";
import { ZodError } from "zod";

export const SESSION_COOKIE = "iso_session";

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function sessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function currentSession(): Promise<SessionInfo | null> {
  return getSession(await sessionToken());
}

export async function requireUser(): Promise<SessionInfo> {
  const s = await currentSession();
  if (!s) redirect("/login");
  if (s.mustChangePassword) redirect("/change-password");
  return s;
}

export async function requireCtx(): Promise<{ session: SessionInfo; ctx: TenantCtx }> {
  const session = await requireUser();
  if (!session.activeOrgId) redirect("/onboarding");
  try {
    return { session, ctx: await resolveCtx(session.userId, session.activeOrgId) };
  } catch {
    redirect("/onboarding");
  }
}

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
}

/** Human-readable message for an error thrown by the domain layer. Never leaks internals. */
export function errorMessage(e: unknown): string {
  if (isDomainError(e)) return e.message;
  if (e instanceof ZodError) return e.issues.map((i) => i.message).join("، ");
  console.error(e);
  return "حدث خطأ غير متوقع";
}

/** Redirect back to `path` with a flash message. */
export function back(path: string, kind: "ok" | "err", message: string): never {
  const [base, hash] = path.split("#");
  const sep = base.includes("?") ? "&" : "?";
  redirect(`${base}${sep}${kind}=${encodeURIComponent(message)}${hash ? `#${hash}` : ""}`);
}

/** Run a mutation and redirect with a flash message; next/navigation redirects propagate. */
export async function act(path: string, okMessage: string, fn: () => Promise<unknown>): Promise<never> {
  try {
    await fn();
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
    back(path, "err", errorMessage(e));
  }
  back(path, "ok", okMessage);
}

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
