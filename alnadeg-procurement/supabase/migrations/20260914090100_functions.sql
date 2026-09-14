-- =====================================================================
-- 2/4 — الدوال الأمنية ومحرك الاعتماد
--
-- كل الدوال الحساسة تعيش في سكيما app غير المكشوفة، وتُثبَّت search_path،
-- وتُسحب صلاحية التنفيذ من PUBLIC. ما يُكشف عبر PostgREST هو أغلفة رفيعة
-- في public مصرّح بها للدور authenticated فقط.
-- =====================================================================

-- ---------------------------------------------------------------------
-- تطبيع رقم الجوال السعودي إلى الصيغة 9665XXXXXXXX
-- يقبل: 05xxxxxxxx | 5xxxxxxxx | 9665xxxxxxxx | +9665xxxxxxxx | 009665xxxxxxxx
-- ---------------------------------------------------------------------
create or replace function app.normalize_saudi_phone(p_input text)
returns text
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  d text;
begin
  if p_input is null then return null; end if;

  -- أرقام عربية-هندية → لاتينية، ثم إزالة كل ما عدا الأرقام
  d := translate(p_input, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  d := regexp_replace(d, '[^0-9]', '', 'g');

  if d like '00966%' then d := substring(d from 3); end if;
  if d like '966%'   then d := substring(d from 4);
  elsif d like '0%'  then d := substring(d from 2);
  end if;

  -- المتبقي يجب أن يكون 5XXXXXXXX (9 أرقام تبدأ بـ 5)
  if d ~ '^5[0-9]{8}$' then
    return '966' || d;
  end if;

  return null;
end;
$fn$;

-- البريد الاصطناعي المستخدم مع Supabase Auth (لا رسائل SMS، لا تكلفة)
create or replace function app.phone_to_email(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $fn$
  select app.normalize_saudi_phone(p_phone) || '@phone.alnadeg.local';
$fn$;

-- ---------------------------------------------------------------------
-- هوية المستخدم الحالي — SECURITY DEFINER لتجاوز RLS ومنع التكرار اللانهائي
-- ---------------------------------------------------------------------
create or replace function app.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = ''
as $fn$
  select p.* from public.profiles p where p.id = (select auth.uid());
$fn$;

create or replace function app.current_role()
returns text
language sql
stable
security definer
set search_path = ''
as $fn$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.is_active;
$fn$;

create or replace function app.current_location()
returns uuid
language sql
stable
security definer
set search_path = ''
as $fn$
  select p.location_id from public.profiles p
  where p.id = (select auth.uid()) and p.is_active;
$fn$;

create or replace function app.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce(
    (select p.role = 'super_admin' and p.is_active
     from public.profiles p where p.id = (select auth.uid())),
    false);
$fn$;

-- الأدوار ذات النطاق المركزي ترى كل المواقع
create or replace function app.has_global_scope()
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce(
    (select p.is_active and p.role in
       ('super_admin','production_manager','procurement','finance')
     from public.profiles p where p.id = (select auth.uid())),
    false);
$fn$;

create or replace function app.can_view_location(p_location uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select app.has_global_scope()
      or coalesce((select p.location_id = p_location and p.is_active
                   from public.profiles p where p.id = (select auth.uid())), false);
$fn$;

-- ---------------------------------------------------------------------
-- خريطة مسار الاعتماد
-- ---------------------------------------------------------------------
create or replace function app.stage_role(p_stage text)
returns text
language sql
immutable
set search_path = ''
as $fn$
  select case p_stage
    when 'production_officer'  then 'production_officer'
    when 'branch_manager'      then 'branch_manager'
    when 'production_manager'  then 'production_manager'
    when 'procurement'         then 'procurement'
    when 'finance'             then 'finance'
  end;
$fn$;

create or replace function app.stage_status(p_stage text)
returns text
language sql
immutable
set search_path = ''
as $fn$
  select case p_stage
    when 'production_officer'  then 'pending_production_officer'
    when 'branch_manager'      then 'pending_branch_manager'
    when 'production_manager'  then 'pending_production_manager'
    when 'procurement'         then 'pending_procurement'
    when 'finance'             then 'pending_finance'
  end;
$fn$;

create or replace function app.next_stage(p_stage text)
returns text
language sql
immutable
set search_path = ''
as $fn$
  select case p_stage
    when 'production_officer'  then 'branch_manager'
    when 'branch_manager'      then 'production_manager'
    when 'production_manager'  then 'procurement'
    when 'procurement'         then 'finance'
    when 'finance'             then null      -- المرحلة الأخيرة
  end;
$fn$;

-- ---------------------------------------------------------------------
-- كتابة سجل التدقيق (يُستدعى فقط من داخل دوال SECURITY DEFINER)
-- ---------------------------------------------------------------------
create or replace function app.write_audit(
  p_action text, p_entity_type text, p_entity_id text,
  p_location uuid default null, p_details jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  me public.profiles;
begin
  select * into me from public.profiles where id = (select auth.uid());
  insert into public.audit_logs
    (actor_id, actor_name, actor_role, action, entity_type, entity_id, location_id, details)
  values
    (me.id, me.full_name, me.role, p_action, p_entity_type, p_entity_id, p_location, coalesce(p_details, '{}'::jsonb));
end;
$fn$;

-- ---------------------------------------------------------------------
-- إرسال الطلب إلى مسار الاعتماد
-- ---------------------------------------------------------------------
create or replace function app.submit_request(p_request_id uuid)
returns public.purchase_requests
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  r  public.purchase_requests;
  me public.profiles;
  invoice_count integer;
begin
  select * into me from public.profiles where id = (select auth.uid());
  if me is null or not me.is_active then
    raise exception 'ACCOUNT_INACTIVE' using hint = 'الحساب غير مفعّل';
  end if;

  -- قفل الصف لمنع الإرسال المزدوج
  select * into r from public.purchase_requests where id = p_request_id for update;
  if r is null then
    raise exception 'REQUEST_NOT_FOUND' using hint = 'الطلب غير موجود';
  end if;

  if not (me.role = 'super_admin' or r.requester_id = me.id) then
    raise exception 'FORBIDDEN' using hint = 'لا تملك صلاحية إرسال هذا الطلب';
  end if;

  if r.status not in ('draft','returned') then
    raise exception 'INVALID_STATUS' using hint = 'لا يمكن إرسال الطلب في حالته الحالية';
  end if;

  -- الحقول الإلزامية قبل الإرسال
  if r.supplier_name is null or btrim(r.supplier_name) = ''
     or r.invoice_number is null or btrim(r.invoice_number) = ''
     or r.amount_before_vat is null or r.total_amount is null
     or r.purchase_type is null or r.justification is null or btrim(r.justification) = '' then
    raise exception 'INCOMPLETE_REQUEST' using hint = 'يجب استكمال بيانات الطلب الإلزامية قبل الإرسال';
  end if;

  -- فاتورة المورد مرفق إلزامي
  select count(*) into invoice_count from public.request_documents
   where request_id = r.id and document_type = 'supplier_invoice';
  if invoice_count = 0 then
    raise exception 'INVOICE_REQUIRED' using hint = 'يجب إرفاق فاتورة المورد قبل الإرسال';
  end if;

  update public.purchase_requests
     set status        = 'pending_production_officer',
         current_stage = 'production_officer',
         submitted_at  = coalesce(submitted_at, now()),
         version       = version + 1
   where id = r.id
   returning * into r;

  insert into public.approvals
    (request_id, stage, decision, actor_id, actor_name, actor_role,
     note, previous_status, new_status, location_id)
  values
    (r.id, null, 'submitted', me.id, me.full_name, me.role,
     null, 'draft', r.status, r.location_id);

  perform app.write_audit('request.submitted', 'purchase_request', r.id::text, r.location_id,
                          jsonb_build_object('request_number', r.request_number));
  return r;
end;
$fn$;

-- ---------------------------------------------------------------------
-- تنفيذ قرار الاعتماد — عملية ذرّية واحدة
--
-- يمنع: الاعتماد خارج المرحلة، خارج الموقع، الاعتماد المزدوج (قفل الصف
-- + شرط المرحلة + فهرس فريد)، والإقفال المالي دون مستند ERP.
-- ---------------------------------------------------------------------
create or replace function app.decide_request(
  p_request_id       uuid,
  p_decision         text,                 -- approved | rejected | returned
  p_note             text default null,
  p_override         boolean default false,
  p_expected_version integer default null
) returns public.purchase_requests
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  r             public.purchase_requests;
  me            public.profiles;
  required_role text;
  nxt           text;
  new_status    text;
  prev_status   text;
  acting_stage  text;
  erp_count     integer;
  is_override   boolean := false;
begin
  if p_decision not in ('approved','rejected','returned') then
    raise exception 'INVALID_DECISION' using hint = 'قرار غير معروف';
  end if;

  if p_decision in ('rejected','returned') and (p_note is null or btrim(p_note) = '') then
    raise exception 'NOTE_REQUIRED' using hint = 'يجب كتابة سبب الرفض أو الإعادة';
  end if;

  select * into me from public.profiles where id = (select auth.uid());
  if me is null or not me.is_active then
    raise exception 'ACCOUNT_INACTIVE' using hint = 'الحساب غير مفعّل';
  end if;

  -- القفل التشاؤمي يمنع سباق الاعتماد المزدوج
  select * into r from public.purchase_requests where id = p_request_id for update;
  if r is null then
    raise exception 'REQUEST_NOT_FOUND' using hint = 'الطلب غير موجود';
  end if;

  if p_expected_version is not null and r.version <> p_expected_version then
    raise exception 'VERSION_CONFLICT' using hint = 'تم تعديل الطلب من مستخدم آخر، أعد تحميل الصفحة';
  end if;

  if r.current_stage is null then
    raise exception 'NOT_IN_WORKFLOW' using hint = 'الطلب ليس ضمن مسار اعتماد نشط';
  end if;

  acting_stage  := r.current_stage;
  required_role := app.stage_role(acting_stage);

  -- التحقق من الدور: التجاوز حصري لمدير النظام ويُسجَّل
  if me.role <> required_role then
    if me.role = 'super_admin' and p_override then
      if p_note is null or btrim(p_note) = '' then
        raise exception 'OVERRIDE_NOTE_REQUIRED' using hint = 'يجب تسجيل سبب التجاوز';
      end if;
      is_override := true;
    else
      raise exception 'WRONG_STAGE_ROLE'
        using hint = 'لا تملك صلاحية اعتماد هذه المرحلة';
    end if;
  end if;

  -- التحقق من الموقع للمراحل الفرعية
  if not is_override and acting_stage in ('production_officer','branch_manager') then
    if me.location_id is distinct from r.location_id then
      raise exception 'WRONG_LOCATION'
        using hint = 'لا تملك صلاحية على طلبات موقع آخر';
    end if;
  end if;

  prev_status := r.status;

  if p_decision = 'approved' then
    -- شرط الإقفال المالي: وجود مستند إدخال الفاتورة في ERP
    if acting_stage = 'finance' then
      select count(*) into erp_count from public.request_documents
       where request_id = r.id and document_type = 'erp_document';
      if erp_count = 0 then
        raise exception 'ERP_DOCUMENT_REQUIRED'
          using hint = 'لا يمكن الإقفال المالي قبل إرفاق مستند إدخال الفاتورة في ERP';
      end if;
    end if;

    nxt := app.next_stage(acting_stage);
    if nxt is null then
      new_status := 'completed';
    else
      new_status := app.stage_status(nxt);
    end if;

    update public.purchase_requests
       set status        = new_status,
           current_stage = nxt,
           completed_at  = case when new_status = 'completed' then now() else completed_at end,
           version       = version + 1
     where id = r.id and current_stage = acting_stage   -- شرط مانع للاعتماد المزدوج
     returning * into r;

  elsif p_decision = 'rejected' then
    new_status := 'rejected';
    update public.purchase_requests
       set status = new_status, current_stage = null, version = version + 1
     where id = r.id and current_stage = acting_stage
     returning * into r;

  else -- returned
    new_status := 'returned';
    update public.purchase_requests
       set status = new_status, current_stage = null, version = version + 1
     where id = r.id and current_stage = acting_stage
     returning * into r;
  end if;

  if r is null then
    raise exception 'STAGE_ALREADY_PROCESSED'
      using hint = 'تمت معالجة هذه المرحلة بالفعل';
  end if;

  insert into public.approvals
    (request_id, stage, decision, actor_id, actor_name, actor_role,
     note, previous_status, new_status, location_id, is_override)
  values
    (r.id, acting_stage, p_decision, me.id, me.full_name, me.role,
     p_note, prev_status, new_status, r.location_id, is_override);

  perform app.write_audit(
    case when is_override then 'request.stage_overridden' else 'request.' || p_decision end,
    'purchase_request', r.id::text, r.location_id,
    jsonb_build_object('request_number', r.request_number, 'stage', acting_stage,
                       'from', prev_status, 'to', new_status, 'note', p_note,
                       'override', is_override));
  return r;
end;
$fn$;

-- ---------------------------------------------------------------------
-- إلغاء الطلب (مقدم الطلب قبل بدء الاعتماد، أو مدير النظام)
-- ---------------------------------------------------------------------
create or replace function app.cancel_request(p_request_id uuid, p_note text)
returns public.purchase_requests
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  r public.purchase_requests; me public.profiles; prev text;
begin
  select * into me from public.profiles where id = (select auth.uid());
  if me is null or not me.is_active then
    raise exception 'ACCOUNT_INACTIVE' using hint = 'الحساب غير مفعّل';
  end if;

  select * into r from public.purchase_requests where id = p_request_id for update;
  if r is null then raise exception 'REQUEST_NOT_FOUND' using hint = 'الطلب غير موجود'; end if;

  if not (me.role = 'super_admin'
          or (r.requester_id = me.id and r.status in ('draft','returned'))) then
    raise exception 'FORBIDDEN' using hint = 'لا تملك صلاحية إلغاء هذا الطلب';
  end if;

  if r.status in ('completed','cancelled') then
    raise exception 'INVALID_STATUS' using hint = 'لا يمكن إلغاء الطلب في حالته الحالية';
  end if;

  prev := r.status;
  update public.purchase_requests
     set status = 'cancelled', current_stage = null, version = version + 1
   where id = r.id returning * into r;

  insert into public.approvals
    (request_id, stage, decision, actor_id, actor_name, actor_role,
     note, previous_status, new_status, location_id)
  values (r.id, null, 'cancelled', me.id, me.full_name, me.role,
          p_note, prev, 'cancelled', r.location_id);

  perform app.write_audit('request.cancelled', 'purchase_request', r.id::text, r.location_id,
                          jsonb_build_object('note', p_note));
  return r;
end;
$fn$;

-- ---------------------------------------------------------------------
-- ملاحظة إدارية من مدير النظام
-- ---------------------------------------------------------------------
create or replace function app.add_admin_note(p_request_id uuid, p_note text)
returns public.purchase_requests
language plpgsql
security definer
set search_path = ''
as $fn$
declare r public.purchase_requests;
begin
  if not app.is_super_admin() then
    raise exception 'FORBIDDEN' using hint = 'صلاحية مدير النظام مطلوبة';
  end if;
  if p_note is null or btrim(p_note) = '' then
    raise exception 'NOTE_REQUIRED' using hint = 'الملاحظة مطلوبة';
  end if;

  update public.purchase_requests
     set admin_note = p_note, version = version + 1
   where id = p_request_id returning * into r;

  if r is null then raise exception 'REQUEST_NOT_FOUND' using hint = 'الطلب غير موجود'; end if;

  perform app.write_audit('request.admin_note', 'purchase_request', r.id::text, r.location_id,
                          jsonb_build_object('note', p_note));
  return r;
end;
$fn$;

-- ---------------------------------------------------------------------
-- مؤشرات لوحة المتابعة — محسوبة على الخادم ضمن نطاق صلاحية المستخدم
-- ---------------------------------------------------------------------
create or replace function app.dashboard_metrics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  scope_all boolean := app.has_global_scope();
  my_loc    uuid    := app.current_location();
  result    jsonb;
begin
  if app.current_role() is null then
    raise exception 'ACCOUNT_INACTIVE' using hint = 'الحساب غير مفعّل';
  end if;

  with visible as (
    select r.* from public.purchase_requests r
     where scope_all or r.location_id = my_loc
  ),
  missing_erp as (
    select v.id from visible v
     where not exists (select 1 from public.request_documents d
                        where d.request_id = v.id and d.document_type = 'erp_document')
       and v.status not in ('draft','cancelled','rejected')
  )
  select jsonb_build_object(
    'total',            (select count(*) from visible),
    'pending',          (select count(*) from visible where current_stage is not null),
    'completed',        (select count(*) from visible where status = 'completed'),
    'rejected',         (select count(*) from visible where status = 'rejected'),
    'returned',         (select count(*) from visible where status = 'returned'),
    'draft',            (select count(*) from visible where status = 'draft'),
    'missing_erp',      (select count(*) from missing_erp),
    'total_amount',     (select coalesce(sum(total_amount), 0) from visible
                          where status not in ('cancelled','rejected')),
    'by_location',      (select coalesce(jsonb_agg(x order by x->>'name_ar'), '[]'::jsonb) from (
                            select jsonb_build_object(
                              'location_id', l.id, 'name_ar', l.name_ar, 'code', l.code,
                              'count', count(v.id),
                              'amount', coalesce(sum(v.total_amount) filter
                                        (where v.status not in ('cancelled','rejected')), 0)) as x
                              from public.locations l
                              join visible v on v.location_id = l.id
                             group by l.id, l.name_ar, l.code) s),
    'by_stage',         (select coalesce(jsonb_object_agg(current_stage, c), '{}'::jsonb) from (
                            select current_stage, count(*) c from visible
                             where current_stage is not null group by current_stage) s),
    'by_status',        (select coalesce(jsonb_object_agg(status, c), '{}'::jsonb) from (
                            select status, count(*) c from visible group by status) s),
    'by_purchase_type', (select coalesce(jsonb_object_agg(coalesce(purchase_type,'غير محدد'), c), '{}'::jsonb) from (
                            select purchase_type, count(*) c from visible group by purchase_type) s),
    'overdue',          (select count(*) from visible
                          where current_stage is not null
                            and submitted_at is not null
                            and submitted_at < now() - interval '3 days')
  ) into result;

  return result;
end;
$fn$;


-- ---------------------------------------------------------------------
-- حماية ملف المستخدم: لا يغيّر المستخدم دوره أو موقعه أو حالة تفعيله
-- بنفسه. يعمل كمشغّل لأن الاستعلام عن profiles داخل سياسة RLS على
-- profiles يسبب تكرارًا لانهائيًا.
-- ---------------------------------------------------------------------
create or replace function app.guard_profile_self_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- لا قيود على مسار الخادم (service_role بلا JWT) ولا على مدير النظام
  if (select auth.uid()) is null or app.is_super_admin() then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'FORBIDDEN' using hint = 'لا يمكن تغيير هوية المستخدم';
  end if;

  -- الحقول الحسّاسة تُعاد إلى قيمتها السابقة بصمت
  new.role        := old.role;
  new.location_id := old.location_id;
  new.is_active   := old.is_active;
  new.phone       := old.phone;
  return new;
end;
$fn$;

drop trigger if exists profiles_guard_self_update on public.profiles;
create trigger profiles_guard_self_update before update on public.profiles
  for each row execute function app.guard_profile_self_update();

-- ---------------------------------------------------------------------
-- أغلفة public المكشوفة عبر PostgREST — للدور authenticated فقط
--
-- الأغلفة SECURITY DEFINER حتى لا يحتاج العميل أي صلاحية على سكيما app،
-- والتحقق من الهوية يتم داخل الدوال عبر auth.uid() وهي غير متأثرة بذلك.
-- ---------------------------------------------------------------------
create or replace function public.submit_purchase_request(p_request_id uuid)
returns public.purchase_requests
language plpgsql security definer set search_path = ''
as $fn$ begin return app.submit_request(p_request_id); end; $fn$;

create or replace function public.decide_purchase_request(
  p_request_id uuid, p_decision text, p_note text default null,
  p_override boolean default false, p_expected_version integer default null)
returns public.purchase_requests
language plpgsql security definer set search_path = ''
as $fn$ begin
  return app.decide_request(p_request_id, p_decision, p_note, p_override, p_expected_version);
end; $fn$;

create or replace function public.cancel_purchase_request(p_request_id uuid, p_note text default null)
returns public.purchase_requests
language plpgsql security definer set search_path = ''
as $fn$ begin return app.cancel_request(p_request_id, p_note); end; $fn$;

create or replace function public.add_request_admin_note(p_request_id uuid, p_note text)
returns public.purchase_requests
language plpgsql security definer set search_path = ''
as $fn$ begin return app.add_admin_note(p_request_id, p_note); end; $fn$;

create or replace function public.get_dashboard_metrics()
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$ begin return app.dashboard_metrics(); end; $fn$;

-- ---------------------------------------------------------------------
-- الصلاحيات: المبدأ الافتراضي هو المنع، ثم منح الحد الأدنى
-- ---------------------------------------------------------------------

-- سكيما app ليست ضمن السكيمات المكشوفة في PostgREST، لكن سياسات RLS
-- تُقيَّم بصلاحيات المستخدم الحالي، لذا يحتاج authenticated إلى usage
-- وإلى تنفيذ دوال القراءة المستخدمة داخل السياسات فقط — لا أكثر.
grant usage on schema app to authenticated;

revoke all on all tables    in schema app from public, anon, authenticated;
revoke all on all functions in schema app from public, anon, authenticated;

grant execute on function
  app.current_profile(),
  app.current_role(),
  app.current_location(),
  app.is_super_admin(),
  app.has_global_scope(),
  app.can_view_location(uuid),
  app.normalize_saudi_phone(text)
to authenticated;

revoke all on function
  public.submit_purchase_request(uuid),
  public.decide_purchase_request(uuid, text, text, boolean, integer),
  public.cancel_purchase_request(uuid, text),
  public.add_request_admin_note(uuid, text),
  public.get_dashboard_metrics()
from public, anon;

grant execute on function
  public.submit_purchase_request(uuid),
  public.decide_purchase_request(uuid, text, text, boolean, integer),
  public.cancel_purchase_request(uuid, text),
  public.add_request_admin_note(uuid, text),
  public.get_dashboard_metrics()
to authenticated;

-- لا تُمنح جداول app تلقائيًا لأي دور مستقبلاً
alter default privileges in schema app revoke all on tables from public, anon, authenticated;
