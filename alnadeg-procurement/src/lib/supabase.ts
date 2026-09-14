"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * عميل Supabase للمتصفح.
 * يستخدم المفتاح العام (anon) فقط — وهو مفتاح مخصص للنشر العلني
 * ومحمي بالكامل بسياسات RLS. مفتاح الخدمة لا يظهر هنا إطلاقًا.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "إعدادات الاتصال غير مكتملة: يجب ضبط NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
}

export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: "alnadeg-procurement-auth",
  },
});

/** عنوان الواجهة البرمجية (Edge Function) */
export const API_BASE = `${url}/functions/v1/procurement-portal`;

/** النطاق الاصطناعي المستخدم لتحويل رقم الجوال إلى بريد داخلي */
export const PHONE_EMAIL_DOMAIN = "phone.alnadeg.local";
