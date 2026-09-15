"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * عميل Supabase للمتصفح.
 *
 * يستخدم المفتاح العام (anon) فقط — وهو مفتاح مخصص للنشر العلني
 * ومحمي بالكامل بسياسات RLS. مفتاح الخدمة لا يظهر هنا إطلاقًا.
 *
 * مصدر الإعدادات بالترتيب:
 *   1) متغيرات البناء NEXT_PUBLIC_* — الوضع المعتمد للنشر.
 *   2) إعدادات محفوظة في المتصفح — لتجربة البوابة قبل ضبط المتغيرات.
 * إن لم يتوفر أي منهما تعرض البوابة شاشة الربط بدل الانهيار.
 */

export interface RuntimeConfig {
  url: string;
  anonKey: string;
  /** true إذا جاءت الإعدادات من البناء لا من هذا المتصفح */
  fromBuild: boolean;
}

const STORAGE_KEY = "alnadeg-runtime-config";

/** النطاق الاصطناعي المستخدم لتحويل رقم الجوال إلى بريد داخلي */
export const PHONE_EMAIL_DOMAIN = "phone.alnadeg.local";

function fromEnv(): RuntimeConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anonKey) return { url, anonKey, fromBuild: true };
  return null;
}

function fromBrowser(): RuntimeConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.url && parsed?.anonKey) {
      return { url: String(parsed.url), anonKey: String(parsed.anonKey), fromBuild: false };
    }
  } catch {
    /* تخزين محلي غير متاح أو تالف — نتجاهله */
  }
  return null;
}

export function getConfig(): RuntimeConfig | null {
  return fromEnv() ?? fromBrowser();
}

export function isConfigured(): boolean {
  return getConfig() !== null;
}

export function saveConfig(url: string, anonKey: string): void {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ url: url.trim().replace(/\/$/, ""), anonKey: anonKey.trim() }),
  );
}

export function clearConfig(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* تجاهل */
  }
}

let cached: SupabaseClient | null = null;

function client(): SupabaseClient {
  if (cached) return cached;
  const cfg = getConfig();
  if (!cfg) {
    throw new Error("إعدادات الاتصال غير مضبوطة — افتح صفحة الربط أولًا");
  }
  cached = createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "alnadeg-procurement-auth",
    },
  });
  return cached;
}

/**
 * العميل يُنشأ عند أول استخدام فعلي لا عند استيراد الوحدة، حتى تتمكن
 * البوابة من عرض شاشة الربط بدل أن تنهار عند التحميل.
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const real = client() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/** عنوان الواجهة البرمجية (Edge Function) */
export function apiBase(): string {
  const cfg = getConfig();
  if (!cfg) throw new Error("إعدادات الاتصال غير مضبوطة");
  return `${cfg.url}/functions/v1/procurement-portal`;
}
