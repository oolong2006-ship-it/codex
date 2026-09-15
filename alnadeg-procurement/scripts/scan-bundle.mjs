#!/usr/bin/env node
/**
 * يفحص مخرجات البناء بحثًا عن مفاتيح خدمة مسرَّبة.
 *
 * لا يبحث عن كلمة "service_role" كنص — فذلك يعطي إنذارات كاذبة على
 * شيفرة التحقق نفسها. بدل ذلك يستخرج كل رمز JWT من الحزمة، يفك ترميز
 * حمولته، ويرفض أي رمز دوره ليس anon. هذا يكشف المفتاح المسرَّب فعليًا
 * بغض النظر عن الطريقة التي وصل بها.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? "out";
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const SECRET_PREFIX = /\bsb_secret_[A-Za-z0-9_-]{8,}/g;

const findings = [];
let scanned = 0;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { walk(full); continue; }
    if (!/\.(js|mjs|cjs|json|html|css|map|txt)$/.test(entry)) continue;

    const content = readFileSync(full, "utf8");
    scanned++;

    for (const token of content.match(JWT) ?? []) {
      let role = null;
      try {
        const body = Buffer.from(
          token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64",
        ).toString("utf8");
        role = JSON.parse(body)?.role ?? null;
      } catch { /* ليس رمزًا صالحًا — نتجاهله */ }

      if (role && role !== "anon") {
        findings.push(`${full}: رمز دوره «${role}» — يجب ألا يصل المتصفح`);
      }
    }

    for (const m of content.match(SECRET_PREFIX) ?? []) {
      findings.push(`${full}: مفتاح سرّي بصيغة ${m.slice(0, 12)}…`);
    }

    if (content.includes("SUPABASE_SERVICE_ROLE_KEY=")) {
      findings.push(`${full}: قيمة مسندة لمتغير مفتاح الخدمة`);
    }
  }
}

walk(root);

if (findings.length) {
  console.error(`❌ عُثر على ${findings.length} تسريبًا محتملًا:`);
  findings.forEach((f) => console.error("   " + f));
  process.exit(1);
}
console.log(`✅ فُحص ${scanned} ملفًا — لا مفاتيح خادم في الحزمة`);
