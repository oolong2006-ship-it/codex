-- =====================================================================
-- تقرير حالة قاعدة البيانات — للقراءة فقط، لا يعدّل أي بيانات.
-- شغّله *قبل* تطبيق الهجرات لمعرفة الوضع القائم، وبعدها للتحقق.
--   ./scripts/inspect-schema.sh > schema-report.txt
-- أو الصق محتواه في Supabase SQL Editor.
-- =====================================================================

\echo '--- الجداول في سكيما public ---'
select table_name,
       (select count(*) from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = t.table_name) as columns
  from information_schema.tables t
 where table_schema = 'public' and table_type = 'BASE TABLE'
 order by table_name;

\echo '--- حالة RLS لكل جدول ---'
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced,
       (select count(*) from pg_policies p
         where p.schemaname='public' and p.tablename=c.relname) as policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
 order by c.relname;

\echo '--- الجداول بلا RLS (تحذير أمني حرج) ---'
select c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;

\echo '--- السياسات التفصيلية ---'
select tablename, policyname, cmd, roles::text,
       coalesce(qual, '—') as using_expr,
       coalesce(with_check, '—') as with_check_expr
  from pg_policies where schemaname='public'
 order by tablename, policyname;

\echo '--- الأعمدة الفعلية للجداول الأساسية ---'
select table_name, column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema='public'
   and table_name in ('locations','profiles','purchase_requests',
                      'approvals','activation_tokens','request_documents','audit_logs')
 order by table_name, ordinal_position;

\echo '--- ملخص المواقع ---'
select count(*) as total,
       count(*) filter (where is_active) as active,
       count(*) filter (where kind='branch') as branches,
       count(*) filter (where kind='central') as central
  from public.locations;

\echo '--- قائمة المواقع ---'
select code, name_ar, kind, sort_order, is_active
  from public.locations order by sort_order, code;

\echo '--- مواقع مكررة بالاسم ---'
select name_ar, count(*) from public.locations
 group by name_ar having count(*) > 1;

\echo '--- المستخدمون حسب الدور ---'
select role, count(*), count(*) filter (where is_active) as active
  from public.profiles group by role order by role;

\echo '--- هل يوجد مدير نظام مفعّل؟ ---'
select count(*) as active_super_admins
  from public.profiles where role='super_admin' and is_active;

\echo '--- الطلبات حسب الحالة ---'
select status, count(*) from public.purchase_requests group by status order by status;

\echo '--- المخزن ---'
select id, name, public, file_size_limit, allowed_mime_types from storage.buckets;

\echo '--- الدوال في public: هل هي SECURITY DEFINER وهل search_path مثبّت؟ ---'
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer,
       coalesce(array_to_string(p.proconfig, ', '), '— بلا search_path ثابت —') as config
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
 order by p.proname;

\echo '--- رموز التفعيل (العشرة الأحدث) ---'
select id, purpose, phone, role, expires_at, used_at is not null as used
  from public.activation_tokens order by created_at desc limit 10;
