"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * عميل Supabase للمتصفح — المفتاح العام (anon) فقط، وكل الحماية في RLS.
 * إن لم تُضبط المتغيرات تعرض الواجهة رسالة إعداد بدل أن ينهار البناء.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isConfigured) throw new Error("NOT_CONFIGURED");
  client ??= createClient(url!, anonKey!, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "mawrid-auth" },
  });
  return client;
}
