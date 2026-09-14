#!/usr/bin/env node
/**
 * يدمج ملفات Edge Function في ملف واحد قابل للّصق مباشرة في
 * لوحة تحكم Supabase (Edge Functions → Deploy new function).
 * الهدف: إلغاء الحاجة إلى الطرفية وإلى تثبيت Supabase CLI.
 *
 * يُعاد تشغيله كلما تغيّر كود الدالة ليبقى الملف متزامنًا.
 */
import { readFileSync, writeFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");

const http = read("supabase/functions/_shared/http.ts");
const validation = read("supabase/functions/_shared/validation.ts");
const index = read("supabase/functions/procurement-portal/index.ts");

// استخرج استيراد المكتبة الخارجية (يجب أن يبقى في أعلى الملف)
const externalImports = [...index.matchAll(/^import .*from "https:\/\/[^"]+";$/gm)]
  .map((m) => m[0]);

// أزل استيرادات الملفات المحلية — محتواها سيُدمج مباشرة
const stripImports = (src) =>
  src.replace(/^import [\s\S]*?from "(\.\.?\/[^"]+)";$/gm, "")
     .replace(/^import .*from "https:\/\/[^"]+";$/gm, "")
     .trimStart();

const banner = `// =====================================================================
//  procurement-portal — بوابة مشتريات فروع شركة مطاعم الناضج
//
//  ⚠️  ملف مُولَّد آليًا — لا تعدّله يدويًا.
//      المصدر: supabase/functions/
//      البناء: node scripts/build-edge-bundle.mjs
//
//  للنشر دون طرفية:
//    Supabase Dashboard → Edge Functions → Deploy a new function
//    الاسم: procurement-portal
//    الصق هذا الملف بالكامل ثم Deploy.
//
//  هذه الدالة تخدم JSON فقط ولا تُعيد صفحات HTML إطلاقًا.
// =====================================================================

`;

const out = banner +
  externalImports.join("\n") + "\n\n" +
  "// ─────────────────── أدوات HTTP والرسائل العربية ───────────────────\n" +
  stripImports(http) + "\n\n" +
  "// ─────────────────── التحقق من المدخلات ───────────────────\n" +
  stripImports(validation) + "\n\n" +
  "// ─────────────────── الموجّه والمسارات ───────────────────\n" +
  stripImports(index) + "\n";

writeFileSync("deploy/02-edge-function.ts", out);
console.log(`✅ تم بناء deploy/02-edge-function.ts (${out.split("\n").length} سطرًا)`);
