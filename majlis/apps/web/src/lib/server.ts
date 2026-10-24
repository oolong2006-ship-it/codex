import "server-only";
import { createDb, userForToken, type DbHandle, type SessionUser } from "@majlis/db";
import { createProviders, type LlmProvider } from "@majlis/providers";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const SESSION_COOKIE = "majlis_session";

const globalForDb = globalThis as unknown as { majlisDb?: DbHandle };

/** One pool per server process (survives dev hot reloads). */
export function db() {
  globalForDb.majlisDb ??= createDb(process.env.DATABASE_URL);
  return globalForDb.majlisDb.db;
}

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return userForToken(db(), token);
}

export async function requireUser(locale: string): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect(`/${locale}/login`);
  return user;
}

/** The interviewer LLM, if a self-hosted one is configured; guide generation falls back to templates. */
export function guideLlm(): LlmProvider | undefined {
  if (!process.env.LLM_PROVIDER || process.env.LLM_PROVIDER === "mock") return undefined;
  return createProviders().llm;
}

export function publicBaseUrl(): string {
  return (process.env.WEB_PUBLIC_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function gatewayUrl(): string {
  return (process.env.WEB_PUBLIC_VOICE_GATEWAY_URL ?? "ws://localhost:4100").replace(/\/+$/, "");
}
