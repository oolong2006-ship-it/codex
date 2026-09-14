-- =====================================================================
-- 3/4 — سياسات أمان الصفوف (RLS)
--
-- القاعدة: RLS مفعّلة على كل جدول في public، ولا توجد سياسة تكتفي بـ
-- TO authenticated دون شرط صلاحية حقيقي. كل سياسات UPDATE تحتوي
-- USING و WITH CHECK معًا.
-- =====================================================================

alter table public.locations         enable row level security;
alter table public.profiles          enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.request_documents enable row level security;
alter table public.approvals         enable row level security;
alter table public.audit_logs        enable row level security;
alter table public.activation_tokens enable row level security;
alter table public.ref_values        enable row level security;

-- منع تجاوز RLS حتى لمالك الجدول عند الاستعلام العادي
alter table public.audit_logs        force row level security;
alter table public.activation_tokens force row level security;

-- ---------------------------------------------------------------------
-- locations — يقرأها كل مستخدم مفعّل، ويديرها مدير النظام وحده
-- ---------------------------------------------------------------------
drop policy if exists locations_select on public.locations;
create policy locations_select on public.locations
  for select to authenticated
  using (app.current_role() is not null);

drop policy if exists locations_insert on public.locations;
create policy locations_insert on public.locations
  for insert to authenticated
  with check (app.is_super_admin());

drop policy if exists locations_update on public.locations;
create policy locations_update on public.locations
  for update to authenticated
  using (app.is_super_admin())
  with check (app.is_super_admin());

-- لا توجد سياسة DELETE: المواقع لا تُحذف، تُعطَّل فقط

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists profiles_select_scope on public.profiles;
create policy profiles_select_scope on public.profiles
  for select to authenticated
  using (app.has_global_scope() or location_id = app.current_location());

-- ملاحظة: منع تصعيد الصلاحيات يتم عبر مشغّل app.guard_profile_self_update
-- وليس داخل WITH CHECK، لأن استعلامًا فرعيًا على profiles داخل سياسة
-- على profiles نفسها يسبب تكرارًا لانهائيًا.
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update to authenticated
  using (app.is_super_admin())
  with check (app.is_super_admin());

-- الإنشاء يتم حصريًا عبر Edge Function بمفتاح الخدمة، لا من المتصفح.
-- لا توجد سياسة INSERT ولا DELETE على profiles (التعطيل بديل الحذف).

-- ---------------------------------------------------------------------
-- purchase_requests
-- ---------------------------------------------------------------------
drop policy if exists purchase_requests_select on public.purchase_requests;
create policy purchase_requests_select on public.purchase_requests
  for select to authenticated
  using (
    app.has_global_scope()
    or requester_id = (select auth.uid())
    or location_id  = app.current_location()
  );

drop policy if exists purchase_requests_insert on public.purchase_requests;
create policy purchase_requests_insert on public.purchase_requests
  for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and app.current_role() in ('requester','production_officer','branch_manager','super_admin')
    -- الطلب يُنشأ لموقع المستخدم فقط (عدا مدير النظام)
    and (app.is_super_admin() or location_id = app.current_location())
    and status = 'draft'
    and current_stage is null
  );

drop policy if exists purchase_requests_update_owner on public.purchase_requests;
create policy purchase_requests_update_owner on public.purchase_requests
  for update to authenticated
  using (
    requester_id = (select auth.uid())
    and status in ('draft','returned')      -- التعديل قبل بدء الاعتماد فقط
  )
  with check (
    requester_id = (select auth.uid())
    and status in ('draft','returned')
    and location_id = app.current_location()
  );

drop policy if exists purchase_requests_update_admin on public.purchase_requests;
create policy purchase_requests_update_admin on public.purchase_requests
  for update to authenticated
  using (app.is_super_admin())
  with check (app.is_super_admin());

-- لا توجد سياسة DELETE: الطلبات لا تُحذف، تُلغى عبر cancel_purchase_request

-- ---------------------------------------------------------------------
-- request_documents — المرفقات تتبع صلاحية الطلب نفسه
-- ---------------------------------------------------------------------
drop policy if exists request_documents_select on public.request_documents;
create policy request_documents_select on public.request_documents
  for select to authenticated
  using (exists (
    select 1 from public.purchase_requests r
     where r.id = request_id
       and (app.has_global_scope()
            or r.requester_id = (select auth.uid())
            or r.location_id  = app.current_location())));

drop policy if exists request_documents_insert on public.request_documents;
create policy request_documents_insert on public.request_documents
  for insert to authenticated
  with check (exists (
    select 1 from public.purchase_requests r
     where r.id = request_id
       and (
         -- مقدم الطلب يرفق قبل بدء الاعتماد
         (r.requester_id = (select auth.uid()) and r.status in ('draft','returned'))
         -- المالية والمشتريات يرفقان مستند ERP والمستندات الداعمة
         or (app.current_role() in ('finance','procurement')
             and document_type in ('erp_document','other'))
         or app.is_super_admin()
       )));

drop policy if exists request_documents_delete on public.request_documents;
create policy request_documents_delete on public.request_documents
  for delete to authenticated
  using (exists (
    select 1 from public.purchase_requests r
     where r.id = request_id
       and ((r.requester_id = (select auth.uid()) and r.status in ('draft','returned'))
            or app.is_super_admin())));

-- ---------------------------------------------------------------------
-- approvals — للقراءة فقط من الواجهة، الكتابة عبر الدوال المؤمّنة
-- ---------------------------------------------------------------------
drop policy if exists approvals_select on public.approvals;
create policy approvals_select on public.approvals
  for select to authenticated
  using (exists (
    select 1 from public.purchase_requests r
     where r.id = request_id
       and (app.has_global_scope()
            or r.requester_id = (select auth.uid())
            or r.location_id  = app.current_location())));

-- لا INSERT/UPDATE/DELETE للمستخدمين: app.decide_request هي المسار الوحيد

-- ---------------------------------------------------------------------
-- audit_logs — قراءة لمدير النظام فقط، ولا تعديل ولا حذف إطلاقًا
-- ---------------------------------------------------------------------
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (app.is_super_admin());

revoke insert, update, delete, truncate on public.audit_logs from anon, authenticated;

-- ---------------------------------------------------------------------
-- activation_tokens — لا وصول من المتصفح إطلاقًا (Edge Function فقط)
-- ---------------------------------------------------------------------
revoke all on public.activation_tokens from anon, authenticated;
-- RLS مفعّلة وبلا سياسات ⇒ منع كامل للدورين anon و authenticated

-- ---------------------------------------------------------------------
-- ref_values — قراءة عامة للمستخدمين المفعّلين
-- ---------------------------------------------------------------------
drop policy if exists ref_values_select on public.ref_values;
create policy ref_values_select on public.ref_values
  for select to authenticated
  using (app.current_role() is not null);

revoke insert, update, delete on public.ref_values from anon, authenticated;

-- ---------------------------------------------------------------------
-- المخزن procurement-documents — خاص، والمسار location_id/request_id/...
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('procurement-documents', 'procurement-documents', false, 10485760,
        array['application/pdf','image/jpeg','image/jpg','image/png','image/webp'])
on conflict (id) do update
  set public             = false,
      file_size_limit    = 10485760,
      allowed_mime_types = array['application/pdf','image/jpeg','image/jpg','image/png','image/webp'];

drop policy if exists procurement_docs_select on storage.objects;
create policy procurement_docs_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'procurement-documents'
    and app.can_view_location(nullif((storage.foldername(name))[1], '')::uuid)
  );

drop policy if exists procurement_docs_insert on storage.objects;
create policy procurement_docs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'procurement-documents'
    and app.can_view_location(nullif((storage.foldername(name))[1], '')::uuid)
  );

drop policy if exists procurement_docs_delete on storage.objects;
create policy procurement_docs_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'procurement-documents'
    and (app.is_super_admin()
         or (owner_id = (select auth.uid())::text
             and app.can_view_location(nullif((storage.foldername(name))[1], '')::uuid)))
  );

-- لا سياسة UPDATE على الكائنات: الملف يُستبدل بالحذف ثم الرفع

-- ---------------------------------------------------------------------
-- الدور anon: التطبيق لا يتيح أي بيانات للزوار — كل شاشة تتطلب دخولاً.
-- نمنع الوصول على مستوى الصلاحيات أيضًا، لا على مستوى السياسات فقط.
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
