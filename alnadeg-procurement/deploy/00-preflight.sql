-- =====================================================================
--  فحص ما قبل التنصيب — بوابة مشتريات الناضج
--
--  الصقه في Supabase SQL Editor واضغط Run. لا يعدّل أي شيء — قراءة فقط.
--
--  اقرأ السطر الأول «الخلاصة»:
--    ✅  → أكمل إلى الملف 01-database.sql
--    ❌  → أرسل النتيجة كاملة قبل تشغيل أي شيء آخر
--
--  ملاحظة تقنية: تُستخدم query_to_xml للعدّ لأن الإشارة المباشرة إلى
--  جدول غير موجود تُفشل الاستعلام كله عند التحليل، لا عند التنفيذ.
-- =====================================================================
with critical as (
  -- أعمدة يجب أن تكون نصية؛ وجودها كنوع مخصص (ENUM) يمنع الترقية الآمنة
  select c.table_name, c.column_name, c.data_type
    from information_schema.columns c
   where c.table_schema = 'public'
     and (c.table_name, c.column_name) in (
       ('profiles','role'), ('profiles','phone'),
       ('purchase_requests','status'), ('purchase_requests','current_stage'),
       ('purchase_requests','purchase_type'), ('purchase_requests','priority'),
       ('locations','kind'),
       ('approvals','decision'), ('approvals','stage'),
       ('request_documents','document_type')
     )
),
conflicts as (
  select * from critical where data_type not in ('text','character varying')
)
select 1 as "#", 'الخلاصة' as "القسم",
       'هل يمكن تشغيل ملف التنصيب مباشرة؟' as "البند",
       case when (select count(*) from conflicts) = 0
            then '✅ نعم — شغّل ملف 01-database.sql'
            else '❌ لا — ' || (select count(*) from conflicts)::text ||
                 ' عمودًا بنوع مخصص. أرسل هذه النتيجة قبل المتابعة.'
       end as "النتيجة"

union all
select 2, 'الخلاصة', 'أعمدة متعارضة (يجب أن تكون صفرًا)',
       (select count(*)::text from conflicts)

union all
select 3, 'تفاصيل التعارض', table_name || '.' || column_name,
       'النوع الحالي: ' || data_type || ' — المتوقع: text'
  from conflicts

union all
select 10, 'الجداول القائمة', t.table_name,
       (select count(*)::text || ' عمودًا' from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = t.table_name)
  from information_schema.tables t
 where t.table_schema = 'public' and t.table_type = 'BASE TABLE'

union all
select 20, 'حجم البيانات القائمة', 'عدد المواقع',
       case when to_regclass('public.locations') is null then '— الجدول غير موجود'
            else (xpath('/row/c/text()', query_to_xml(
                   'select count(*) as c from public.locations',
                   false, true, '')))[1]::text end

union all
select 21, 'حجم البيانات القائمة', 'عدد المستخدمين',
       case when to_regclass('public.profiles') is null then '— الجدول غير موجود'
            else (xpath('/row/c/text()', query_to_xml(
                   'select count(*) as c from public.profiles',
                   false, true, '')))[1]::text end

union all
select 22, 'حجم البيانات القائمة', 'عدد طلبات الشراء',
       case when to_regclass('public.purchase_requests') is null then '— الجدول غير موجود'
            else (xpath('/row/c/text()', query_to_xml(
                   'select count(*) as c from public.purchase_requests',
                   false, true, '')))[1]::text end

union all
select 23, 'حجم البيانات القائمة', 'مديرو نظام مفعّلون',
       case when not exists (select 1 from information_schema.columns
                              where table_schema='public' and table_name='profiles'
                                and column_name='role')
            then '— العمود غير موجود'
            else (xpath('/row/c/text()', query_to_xml(
                   'select count(*) as c from public.profiles where role::text = ''super_admin''',
                   false, true, '')))[1]::text end

union all
select 24, 'حجم البيانات القائمة', 'حسابات Auth القائمة',
       case when to_regclass('auth.users') is null then '— غير متاح'
            else (xpath('/row/c/text()', query_to_xml(
                   'select count(*) as c from auth.users', false, true, '')))[1]::text end

union all
select 30, 'الحماية', 'جداول بلا RLS',
       (select count(*)::text from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname='public' and c.relkind='r' and not c.relrowsecurity)

union all
select 31, 'الحماية', 'عدد سياسات RLS القائمة',
       (select count(*)::text from pg_policies where schemaname='public')

union all
select 40, 'المخزن', coalesce(b.id, '—'),
       case when b.public then '⚠️ عام — سيُحوَّل إلى خاص' else '✅ خاص' end
  from storage.buckets b

union all
select 50, 'الأنواع المخصصة القائمة (ENUM)', t.typname,
       (select string_agg(e.enumlabel, '، ' order by e.enumsortorder)
          from pg_enum e where e.enumtypid = t.oid)
  from pg_type t join pg_namespace n on n.oid = t.typnamespace
 where n.nspname = 'public' and t.typtype = 'e'

order by 1, 3;
