"use server";

import { login, logout } from "@majlis/db";
import { isLocale } from "@majlis/i18n";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SESSION_COOKIE, db } from "@/lib/server";

const LoginInput = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

export async function loginAction(
  locale: string,
  _prev: { error: boolean },
  form: FormData,
): Promise<{ error: boolean }> {
  const parsed = LoginInput.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success || !isLocale(locale)) return { error: true };
  const token = await login(db(), parsed.data.email, parsed.data.password);
  if (!token) return { error: true };
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 86_400,
  });
  redirect(`/${locale}/dashboard`);
}

export async function logoutAction(locale: string): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await logout(db(), token);
  jar.delete(SESSION_COOKIE);
  redirect(`/${isLocale(locale) ? locale : "ar"}/login`);
}
