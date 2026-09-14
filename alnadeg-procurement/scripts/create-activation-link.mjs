#!/usr/bin/env node
/**
 * توليد رابط تفعيل حقيقي لمدير النظام.
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… APP_BASE_URL=… \
 *   node scripts/create-activation-link.mjs [--phone 0559847714] [--name "الاسم"]
 *
 * الرمز يُولَّد عشوائيًا هنا، ويُخزَّن هاشه فقط في قاعدة البيانات.
 * الرابط صالح 24 ساعة ويُستخدم مرة واحدة فقط.
 */
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  APP_BASE_URL,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("✖ يجب ضبط SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في البيئة.");
  console.error("  لا تضع المفتاح في أي ملف داخل المستودع.");
  process.exit(1);
}
if (!APP_BASE_URL) {
  console.error("✖ يجب ضبط APP_BASE_URL — عنوان الواجهة المنشورة.");
  console.error("  مثال: APP_BASE_URL=https://alnadeg-procurement.vercel.app");
  process.exit(1);
}

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const phone = argOf("--phone", "0559847714");
const name = argOf("--name", "محمد صالح باعمر");
const role = argOf("--role", "super_admin");
const locationCode = argOf("--location", "CN-06");
const hours = Number(argOf("--hours", "24"));

// رمز عشوائي قوي (256 بت)
const token = randomBytes(32).toString("base64url");
const tokenHash = createHash("sha256").update(token).digest("hex");

const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await svc.rpc("create_activation_token", {
  p_token_hash: tokenHash,
  p_full_name: name,
  p_phone: phone,
  p_role: role,
  p_location_code: locationCode,
  p_hours: hours,
});

if (error) {
  console.error("✖ تعذر إنشاء رمز التفعيل:", error.message);
  process.exit(1);
}

const link = `${APP_BASE_URL.replace(/\/$/, "")}/activate/?token=${token}`;
const expires = new Date(Date.now() + hours * 3600_000);

console.log(`
╔════════════════════════════════════════════════════════════════╗
║               رابط تفعيل حساب مدير النظام                      ║
╚════════════════════════════════════════════════════════════════╝

  الاسم        : ${name}
  رقم الجوال   : ${phone}
  الدور        : ${role}
  الموقع       : ${locationCode}
  معرّف الرمز  : ${data}
  ينتهي في     : ${expires.toISOString()}  (${hours} ساعة)

  الرابط:

  ${link}

──────────────────────────────────────────────────────────────────
  • هذا الرابط يُستخدم مرة واحدة فقط.
  • الرمز نفسه غير مخزَّن في قاعدة البيانات — الهاش فقط.
  • لن يُعرض الرابط مرة أخرى؛ انسخه الآن.
  • إنشاء رابط جديد لنفس الرقم يُبطل الرابط السابق تلقائيًا.
  • اختر كلمة المرور داخل صفحة التفعيل — لا تكتبها في أي مكان آخر.
──────────────────────────────────────────────────────────────────
`);
