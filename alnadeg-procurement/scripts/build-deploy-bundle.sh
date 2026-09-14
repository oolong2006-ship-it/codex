#!/usr/bin/env bash
# =====================================================================
# يبني ملف SQL واحدًا يجمع كل الهجرات + تقرير تحقق نهائي.
# الهدف: أن يكون التنصيب لصقة واحدة في Supabase SQL Editor.
# يُعاد تشغيله كلما تغيّرت الهجرات ليبقى الملف متزامنًا.
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=deploy/01-database.sql

cat > "$OUT" <<'HEADER'
-- =====================================================================
--  بوابة مشتريات فروع شركة مطاعم الناضج
--  ملف التنصيب الكامل — الصقه في Supabase SQL Editor واضغط Run
--
--  ⚠️  هذا الملف مُولَّد آليًا — لا تعدّله يدويًا.
--      المصدر: supabase/migrations/*.sql
--      البناء: ./scripts/build-deploy-bundle.sh
--
--  آمن تمامًا على قاعدة بيانات تحتوي بيانات:
--    • لا يوجد فيه أمر DROP واحد
--    • لا يحذف أي صف ولا أي عمود
--    • قابل لإعادة التشغيل أكثر من مرة دون ضرر
--
--  في نهاية التنفيذ سيظهر جدول تحقق يبيّن نجاح كل بند.
-- =====================================================================

HEADER

for f in supabase/migrations/*.sql; do
  {
    echo ""
    echo "-- ═══════════════════════════════════════════════════════════════"
    echo "--  $(basename "$f")"
    echo "-- ═══════════════════════════════════════════════════════════════"
    echo ""
    cat "$f"
    echo ""
  } >> "$OUT"
done

cat >> "$OUT" <<'FOOTER'

-- =====================================================================
--  تقرير التحقق النهائي
--  كل بند يجب أن تكون حالته ✅ — أي ❌ يعني وجود مشكلة تحتاج مراجعة.
-- =====================================================================
with checks(ترتيب, البند, المتوقع, الفعلي) as (
  values
    (1, 'عدد المواقع النشطة المعتمدة', 27,
        (select count(*)::int from public.locations
          where is_active and code ~ '^(BR|CN)-[0-9]{2}$')),
    (2, 'عدد الفروع', 21,
        (select count(*)::int from public.locations
          where is_active and kind = 'branch')),
    (3, 'عدد المواقع التشغيلية والمركزية', 6,
        (select count(*)::int from public.locations
          where is_active and kind = 'central')),
    (4, 'مواقع مكررة بالاسم (يجب أن تكون صفرًا)', 0,
        (select count(*)::int from (
           select name_ar from public.locations where is_active
            group by name_ar having count(*) > 1) d)),
    (5, 'جداول النظام الأساسية', 8,
        (select count(*)::int from information_schema.tables
          where table_schema = 'public'
            and table_name in ('locations','profiles','purchase_requests',
                'request_documents','approvals','audit_logs',
                'activation_tokens','ref_values'))),
    (6, 'جداول بلا حماية RLS (يجب أن تكون صفرًا)', 0,
        (select count(*)::int from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r'
            and not c.relrowsecurity)),
    (7, 'دوال بلا search_path مثبّت (يجب أن تكون صفرًا)', 0,
        (select count(*)::int from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.prosecdef
            and (p.proconfig is null
                 or not exists (select 1 from unnest(p.proconfig) cfg
                                 where cfg like 'search_path=%')))),
    (8, 'وصول الزوار لجدول الطلبات (يجب أن يكون ممنوعًا)', 0,
        (select case when has_table_privilege('anon','public.purchase_requests','SELECT')
                     then 1 else 0 end)),
    (9, 'مخزن المرفقات خاص وليس عامًا', 1,
        (select case when exists (select 1 from storage.buckets
                                   where id = 'procurement-documents' and not public)
                     then 1 else 0 end)),
    (10, 'حد حجم الملف في المخزن (بايت)', 10485760,
        (select coalesce(file_size_limit, 0)::int from storage.buckets
          where id = 'procurement-documents')),
    (11, 'عدد سياسات الحماية المطبّقة (15 فأكثر)', 15,
        (select least(count(*), 15)::int from pg_policies
          where schemaname = 'public')),
    (12, 'القوائم المرجعية العربية', 47,
        (select count(*)::int from public.ref_values))
)
select
  ترتيب as "#",
  البند,
  المتوقع,
  الفعلي,
  case when الفعلي = المتوقع then '✅ سليم' else '❌ يحتاج مراجعة' end as "الحالة"
from checks
order by ترتيب;
FOOTER

echo "✅ تم بناء $OUT ($(wc -l < "$OUT") سطرًا)"
