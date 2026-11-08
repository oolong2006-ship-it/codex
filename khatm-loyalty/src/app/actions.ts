"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LANG_COOKIE } from "@/lib/i18n";
import { getLang } from "@/server/web";

export async function toggleLang() {
  const next = (await getLang()) === "ar" ? "en" : "ar";
  (await cookies()).set(LANG_COOKIE, next, { path: "/", maxAge: 365 * 86400, sameSite: "lax" });
  revalidatePath("/", "layout");
}
