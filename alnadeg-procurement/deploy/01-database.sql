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


-- ═══════════════════════════════════════════════════════════════
--  20260914090000_core_schema.sql
-- ═══════════════════════════════════════════════════════════════

-- =====================================================================
-- بوابة مشتريات فروع شركة مطاعم الناضج
-- 1/4 — المخطط الأساسي (Core schema)
--
-- هذه الهجرة *تراكمية وآمنة*: لا تحذف أي جدول أو عمود أو صف قائم.
-- تستخدم CREATE ... IF NOT EXISTS و ALTER ... ADD COLUMN IF NOT EXISTS
-- حتى تعمل فوق قاعدة بيانات تحتوي بالفعل على:
--   locations, profiles, purchase_requests, approvals, activation_tokens
--
-- ملاحظة تصميمية: نستخدم text + CHECK بدلاً من ENUM عمدًا، لأن ENUM
-- قائمًا بقيم مختلفة يصعب ترحيله بأمان، بينما CHECK يمكن استبداله.
-- =====================================================================

create extension if not exists "pgcrypto";

-- سكيما داخلية غير مكشوفة عبر PostgREST للدوال الحساسة
create schema if not exists app;
revoke all on schema app from public, anon, authenticated;
grant usage on schema app to postgres, service_role;

-- ---------------------------------------------------------------------
-- قوائم القيم المعتمدة (مرجع واحد للتطبيق وقاعدة البيانات)
-- ---------------------------------------------------------------------
create table if not exists public.ref_values (
  domain      text not null,
  code        text not null,
  name_ar     text not null,
  sort_order  integer not null default 0,
  primary key (domain, code)
);

-- ---------------------------------------------------------------------
-- المواقع
-- ---------------------------------------------------------------------
create table if not exists public.locations (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now()
);

alter table public.locations add column if not exists code       text;
alter table public.locations add column if not exists name_ar    text;
alter table public.locations add column if not exists kind       text;
alter table public.locations add column if not exists sort_order integer;
alter table public.locations add column if not exists is_active  boolean;
alter table public.locations add column if not exists updated_at timestamptz;

update public.locations set kind       = coalesce(kind, 'branch');
update public.locations set is_active  = coalesce(is_active, true);
update public.locations set sort_order = coalesce(sort_order, 999);
update public.locations set updated_at = coalesce(updated_at, now());

alter table public.locations alter column kind       set default 'branch';
alter table public.locations alter column is_active  set default true;
alter table public.locations alter column sort_order set default 999;
alter table public.locations alter column updated_at set default now();

do $$ begin
  alter table public.locations alter column kind      set not null;
  alter table public.locations alter column is_active set not null;
exception when others then
  raise notice 'locations: تعذر فرض NOT NULL — راجع البيانات القائمة (%)', sqlerrm;
end $$;

do $$ begin
  alter table public.locations add constraint locations_kind_check
    check (kind in ('branch','central'));
exception when duplicate_object then null;
end $$;

create unique index if not exists locations_code_key on public.locations (code);
create index if not exists locations_sort_idx on public.locations (sort_order, code);

-- ---------------------------------------------------------------------
-- ملفات المستخدمين — مرتبطة بـ auth.users
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists full_name            text;
alter table public.profiles add column if not exists phone                text;
alter table public.profiles add column if not exists role                 text;
alter table public.profiles add column if not exists location_id          uuid;
alter table public.profiles add column if not exists job_title            text;
alter table public.profiles add column if not exists is_active            boolean;
alter table public.profiles add column if not exists must_change_password boolean;
alter table public.profiles add column if not exists last_login_at        timestamptz;
alter table public.profiles add column if not exists updated_at           timestamptz;

update public.profiles set role                 = coalesce(role, 'requester');
update public.profiles set is_active            = coalesce(is_active, true);
update public.profiles set must_change_password = coalesce(must_change_password, false);
update public.profiles set updated_at           = coalesce(updated_at, now());

alter table public.profiles alter column role                 set default 'requester';
alter table public.profiles alter column is_active            set default true;
alter table public.profiles alter column must_change_password set default false;
alter table public.profiles alter column updated_at           set default now();

do $$ begin
  alter table public.profiles add constraint profiles_role_check
    check (role in ('super_admin','requester','production_officer',
                    'branch_manager','production_manager','procurement','finance'));
exception when duplicate_object then null; end $$;

-- رقم الجوال يُخزَّن دائمًا بالصيغة الموحدة 9665XXXXXXXX (12 رقمًا)
do $$ begin
  alter table public.profiles add constraint profiles_phone_format_check
    check (phone is null or phone ~ '^9665[0-9]{8}$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles add constraint profiles_location_fk
    foreign key (location_id) references public.locations (id) on delete restrict;
exception when duplicate_object then null; end $$;

create unique index if not exists profiles_phone_key on public.profiles (phone);
create index if not exists profiles_location_idx on public.profiles (location_id);
create index if not exists profiles_role_idx on public.profiles (role);

-- ---------------------------------------------------------------------
-- طلبات الشراء
-- ---------------------------------------------------------------------
create sequence if not exists public.purchase_request_number_seq;

create table if not exists public.purchase_requests (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.purchase_requests add column if not exists request_number    text;
alter table public.purchase_requests add column if not exists location_id       uuid;
alter table public.purchase_requests add column if not exists requester_id      uuid;
alter table public.purchase_requests add column if not exists status            text;
alter table public.purchase_requests add column if not exists current_stage     text;
alter table public.purchase_requests add column if not exists request_date      date;
alter table public.purchase_requests add column if not exists purchase_date     date;
alter table public.purchase_requests add column if not exists purchase_type     text;
alter table public.purchase_requests add column if not exists priority          text;
alter table public.purchase_requests add column if not exists supplier_name     text;
alter table public.purchase_requests add column if not exists supplier_vat      text;
alter table public.purchase_requests add column if not exists invoice_number    text;
alter table public.purchase_requests add column if not exists invoice_date      date;
alter table public.purchase_requests add column if not exists amount_before_vat numeric(14,2);
alter table public.purchase_requests add column if not exists vat_amount        numeric(14,2);
alter table public.purchase_requests add column if not exists total_amount      numeric(14,2);
alter table public.purchase_requests add column if not exists category          text;
alter table public.purchase_requests add column if not exists items_description text;
alter table public.purchase_requests add column if not exists quantity          numeric(14,3);
alter table public.purchase_requests add column if not exists unit              text;
alter table public.purchase_requests add column if not exists justification     text;
alter table public.purchase_requests add column if not exists notes             text;
alter table public.purchase_requests add column if not exists admin_note        text;
alter table public.purchase_requests add column if not exists version           integer;
alter table public.purchase_requests add column if not exists submitted_at      timestamptz;
alter table public.purchase_requests add column if not exists completed_at      timestamptz;
alter table public.purchase_requests add column if not exists updated_at        timestamptz;

update public.purchase_requests set status       = coalesce(status, 'draft');
update public.purchase_requests set version      = coalesce(version, 1);
update public.purchase_requests set request_date = coalesce(request_date, current_date);
update public.purchase_requests set priority     = coalesce(priority, 'normal');
update public.purchase_requests set updated_at   = coalesce(updated_at, now());

alter table public.purchase_requests alter column status       set default 'draft';
alter table public.purchase_requests alter column version      set default 1;
alter table public.purchase_requests alter column request_date set default current_date;
alter table public.purchase_requests alter column priority     set default 'normal';
alter table public.purchase_requests alter column updated_at   set default now();

do $$ begin
  alter table public.purchase_requests add constraint purchase_requests_status_check
    check (status in ('draft','submitted','pending_production_officer','pending_branch_manager',
                      'pending_production_manager','pending_procurement','pending_finance',
                      'returned','rejected','completed','cancelled'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.purchase_requests add constraint purchase_requests_stage_check
    check (current_stage is null or current_stage in
      ('production_officer','branch_manager','production_manager','procurement','finance'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.purchase_requests add constraint purchase_requests_type_check
    check (purchase_type is null or purchase_type in ('operational','direct','emergency'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.purchase_requests add constraint purchase_requests_priority_check
    check (priority in ('low','normal','high','urgent'));
exception when duplicate_object then null; end $$;

-- الرقم الضريبي السعودي: 15 رقمًا يبدأ وينتهي بالرقم 3
do $$ begin
  alter table public.purchase_requests add constraint purchase_requests_vat_check
    check (supplier_vat is null or supplier_vat ~ '^3[0-9]{13}3$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.purchase_requests add constraint purchase_requests_amounts_check
    check (
      (amount_before_vat is null or amount_before_vat >= 0) and
      (vat_amount        is null or vat_amount        >= 0) and
      (total_amount      is null or total_amount      >= 0)
    );
exception when duplicate_object then null; end $$;

-- الإجمالي يجب أن يطابق (قبل الضريبة + الضريبة) بهامش تقريب هللة واحدة
do $$ begin
  alter table public.purchase_requests add constraint purchase_requests_total_consistency_check
    check (
      amount_before_vat is null or vat_amount is null or total_amount is null
      or abs(total_amount - (amount_before_vat + vat_amount)) <= 0.01
    );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.purchase_requests add constraint purchase_requests_invoice_date_check
    check (invoice_date is null or purchase_date is null or invoice_date >= purchase_date - interval '365 days');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.purchase_requests add constraint purchase_requests_location_fk
    foreign key (location_id) references public.locations (id) on delete restrict;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.purchase_requests add constraint purchase_requests_requester_fk
    foreign key (requester_id) references public.profiles (id) on delete restrict;
exception when duplicate_object then null; end $$;

create unique index if not exists purchase_requests_number_key
  on public.purchase_requests (request_number);

-- منع تكرار فاتورة المورد نفسه برقم الفاتورة نفسه (يُتجاهل الملغى والمرفوض)
create unique index if not exists purchase_requests_supplier_invoice_key
  on public.purchase_requests (
    coalesce(nullif(supplier_vat, ''), lower(btrim(coalesce(supplier_name, '')))),
    upper(btrim(invoice_number))
  )
  where invoice_number is not null
    and btrim(invoice_number) <> ''
    and status not in ('cancelled','rejected');

create index if not exists purchase_requests_location_idx    on public.purchase_requests (location_id);
create index if not exists purchase_requests_requester_idx   on public.purchase_requests (requester_id);
create index if not exists purchase_requests_status_idx      on public.purchase_requests (status);
create index if not exists purchase_requests_stage_idx       on public.purchase_requests (current_stage)
  where current_stage is not null;
create index if not exists purchase_requests_created_idx     on public.purchase_requests (created_at desc);
create index if not exists purchase_requests_inbox_idx       on public.purchase_requests (current_stage, location_id, created_at desc);

-- ---------------------------------------------------------------------
-- مرفقات الطلب
-- ---------------------------------------------------------------------
create table if not exists public.request_documents (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.purchase_requests (id) on delete cascade,
  location_id   uuid not null references public.locations (id) on delete restrict,
  document_type text not null,
  storage_path  text not null,
  file_name     text not null,
  mime_type     text not null,
  file_size     integer not null,
  uploaded_by   uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

do $$ begin
  alter table public.request_documents add constraint request_documents_type_check
    check (document_type in ('supplier_invoice','erp_document','other'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.request_documents add constraint request_documents_mime_check
    check (mime_type in ('application/pdf','image/jpeg','image/jpg','image/png','image/webp'));
exception when duplicate_object then null; end $$;

-- حد أقصى 10 ميجابايت للملف الواحد (يُفرض أيضًا على الخادم وفي الواجهة)
do $$ begin
  alter table public.request_documents add constraint request_documents_size_check
    check (file_size > 0 and file_size <= 10485760);
exception when duplicate_object then null; end $$;

create unique index if not exists request_documents_path_key on public.request_documents (storage_path);
create index if not exists request_documents_request_idx on public.request_documents (request_id, document_type);

-- ---------------------------------------------------------------------
-- سجل الاعتمادات
-- ---------------------------------------------------------------------
create table if not exists public.approvals (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.approvals add column if not exists request_id      uuid;
alter table public.approvals add column if not exists stage           text;
alter table public.approvals add column if not exists decision        text;
alter table public.approvals add column if not exists actor_id        uuid;
alter table public.approvals add column if not exists actor_name      text;
alter table public.approvals add column if not exists actor_role      text;
alter table public.approvals add column if not exists note            text;
alter table public.approvals add column if not exists previous_status text;
alter table public.approvals add column if not exists new_status      text;
alter table public.approvals add column if not exists location_id     uuid;
alter table public.approvals add column if not exists is_override     boolean;
alter table public.approvals add column if not exists ip_address      text;
alter table public.approvals add column if not exists user_agent      text;

update public.approvals set is_override = coalesce(is_override, false);
alter table public.approvals alter column is_override set default false;

do $$ begin
  alter table public.approvals add constraint approvals_decision_check
    check (decision is null or decision in ('approved','rejected','returned','submitted','cancelled'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.approvals add constraint approvals_request_fk
    foreign key (request_id) references public.purchase_requests (id) on delete cascade;
exception when duplicate_object then null; end $$;

create index if not exists approvals_request_idx on public.approvals (request_id, created_at);

-- منع اعتماد المرحلة نفسها مرتين لنفس الطلب (قرار إيجابي واحد لكل مرحلة)
create unique index if not exists approvals_single_approval_per_stage
  on public.approvals (request_id, stage)
  where decision = 'approved';

-- ---------------------------------------------------------------------
-- سجل التدقيق — للقراءة فقط
-- ---------------------------------------------------------------------
create table if not exists public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  actor_name  text,
  actor_role  text,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  location_id uuid,
  details     jsonb not null default '{}'::jsonb,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_entity_idx  on public.audit_logs (entity_type, entity_id);
create index if not exists audit_logs_actor_idx   on public.audit_logs (actor_id);

-- ---------------------------------------------------------------------
-- رموز التفعيل — يُخزَّن الهاش فقط، لا الرمز نفسه
-- ---------------------------------------------------------------------
create table if not exists public.activation_tokens (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.activation_tokens add column if not exists token_hash    text;
alter table public.activation_tokens add column if not exists purpose       text;
alter table public.activation_tokens add column if not exists full_name     text;
alter table public.activation_tokens add column if not exists phone         text;
alter table public.activation_tokens add column if not exists role          text;
alter table public.activation_tokens add column if not exists location_code text;
alter table public.activation_tokens add column if not exists expires_at    timestamptz;
alter table public.activation_tokens add column if not exists used_at       timestamptz;
alter table public.activation_tokens add column if not exists used_by       uuid;

update public.activation_tokens set purpose = coalesce(purpose, 'super_admin_activation');
alter table public.activation_tokens alter column purpose set default 'super_admin_activation';

create unique index if not exists activation_tokens_hash_key on public.activation_tokens (token_hash);
create index if not exists activation_tokens_open_idx on public.activation_tokens (expires_at)
  where used_at is null;

-- ---------------------------------------------------------------------
-- تحديد معدل الطلبات (Rate limiting) لمسارات الدخول والتفعيل
-- ---------------------------------------------------------------------
create table if not exists app.rate_limits (
  bucket      text not null,
  identifier  text not null,
  window_start timestamptz not null,
  hits        integer not null default 0,
  primary key (bucket, identifier, window_start)
);

create index if not exists rate_limits_window_idx on app.rate_limits (window_start);

-- ---------------------------------------------------------------------
-- updated_at تلقائيًا
-- ---------------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists locations_touch_updated_at on public.locations;
create trigger locations_touch_updated_at before update on public.locations
  for each row execute function app.touch_updated_at();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function app.touch_updated_at();

drop trigger if exists purchase_requests_touch_updated_at on public.purchase_requests;
create trigger purchase_requests_touch_updated_at before update on public.purchase_requests
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------
-- توليد رقم الطلب تلقائيًا: PR-YYYY-NNNNN
-- ---------------------------------------------------------------------
create or replace function app.assign_request_number()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if new.request_number is null or btrim(new.request_number) = '' then
    new.request_number := 'PR-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.purchase_request_number_seq')::text, 5, '0');
  end if;
  return new;
end;
$fn$;

drop trigger if exists purchase_requests_assign_number on public.purchase_requests;
create trigger purchase_requests_assign_number before insert on public.purchase_requests
  for each row execute function app.assign_request_number();

-- صلاحية استخدام سلسلة أرقام الطلبات (يستدعيها المشغّل باسم المستخدم)
grant usage, select on sequence public.purchase_request_number_seq to authenticated;


-- ═══════════════════════════════════════════════════════════════
--  20260914090100_functions.sql
-- ═══════════════════════════════════════════════════════════════

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


-- ═══════════════════════════════════════════════════════════════
--  20260914090200_rls.sql
-- ═══════════════════════════════════════════════════════════════

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


-- ═══════════════════════════════════════════════════════════════
--  20260914090300_seed_reference.sql
-- ═══════════════════════════════════════════════════════════════

-- =====================================================================
-- 4/4 — بيانات مرجعية: المواقع الـ27 وقوائم القيم
--
-- قابلة لإعادة التشغيل دون تكرار: المطابقة بالكود الفريد.
-- لا تحذف أي موقع قائم؛ تحدّث الاسم والتصنيف والترتيب فقط.
-- المواقع القائمة بلا كود تُطابَق بالاسم العربي مرة واحدة ثم تُمنح كودها.
-- =====================================================================

-- 1) منح كود للمواقع القائمة التي تطابق الاسم ولا تحمل كودًا بعد
with target(code, name_ar) as (values
  ('BR-01','الشفا'), ('BR-02','العليا'), ('BR-03','الصحافة'), ('BR-04','اشبيلية'),
  ('BR-05','الربوة'), ('BR-06','العارض'), ('BR-07','غرناطة'), ('BR-08','النرجس'),
  ('BR-09','العزيزية'), ('BR-10','طريق الدمام - الجنادرية'), ('BR-11','بدر'),
  ('BR-12','مخرج 24'), ('BR-13','مخرج 28'), ('BR-14','مخرج 18'), ('BR-15','اليرموك'),
  ('BR-16','الخرج'), ('BR-17','بريدة'), ('BR-18','الأحساء'), ('BR-19','حفر الباطن'),
  ('BR-20','الطائف'), ('BR-21','المدينة المنورة'),
  ('CN-01','المعمل المركزي'), ('CN-02','المستودع المركزي'), ('CN-03','قسم الحوش'),
  ('CN-04','قسم الحفلات'), ('CN-05','قسم الخضار'), ('CN-06','الإدارة المركزية')
)
update public.locations l
   set code = t.code
  from target t
 where l.code is null
   and btrim(l.name_ar) = t.name_ar
   and not exists (select 1 from public.locations x where x.code = t.code);

-- 2) الإدراج/التحديث النهائي بالكود
insert into public.locations (code, name_ar, kind, sort_order, is_active) values
  ('BR-01','الشفا','branch',1,true),
  ('BR-02','العليا','branch',2,true),
  ('BR-03','الصحافة','branch',3,true),
  ('BR-04','اشبيلية','branch',4,true),
  ('BR-05','الربوة','branch',5,true),
  ('BR-06','العارض','branch',6,true),
  ('BR-07','غرناطة','branch',7,true),
  ('BR-08','النرجس','branch',8,true),
  ('BR-09','العزيزية','branch',9,true),
  ('BR-10','طريق الدمام - الجنادرية','branch',10,true),
  ('BR-11','بدر','branch',11,true),
  ('BR-12','مخرج 24','branch',12,true),
  ('BR-13','مخرج 28','branch',13,true),
  ('BR-14','مخرج 18','branch',14,true),
  ('BR-15','اليرموك','branch',15,true),
  ('BR-16','الخرج','branch',16,true),
  ('BR-17','بريدة','branch',17,true),
  ('BR-18','الأحساء','branch',18,true),
  ('BR-19','حفر الباطن','branch',19,true),
  ('BR-20','الطائف','branch',20,true),
  ('BR-21','المدينة المنورة','branch',21,true),
  ('CN-01','المعمل المركزي','central',22,true),
  ('CN-02','المستودع المركزي','central',23,true),
  ('CN-03','قسم الحوش','central',24,true),
  ('CN-04','قسم الحفلات','central',25,true),
  ('CN-05','قسم الخضار','central',26,true),
  ('CN-06','الإدارة المركزية','central',27,true)
on conflict (code) do update
  set name_ar    = excluded.name_ar,
      kind       = excluded.kind,
      sort_order = excluded.sort_order,
      updated_at = now();

-- 3) دمج المواقع المكررة بالاسم (تبقى النسخة التي تحمل الكود المعتمد)
do $$
declare dup record; keeper uuid;
begin
  for dup in
    select btrim(name_ar) as nm, count(*) c
      from public.locations
     group by btrim(name_ar) having count(*) > 1
  loop
    select id into keeper from public.locations
     where btrim(name_ar) = dup.nm and code is not null
     order by sort_order limit 1;

    if keeper is null then continue; end if;

    -- إعادة ربط أي سجلات مرتبطة بالنسخة المكررة قبل تعطيلها
    update public.purchase_requests set location_id = keeper
     where location_id in (select id from public.locations
                            where btrim(name_ar) = dup.nm and id <> keeper);
    update public.profiles set location_id = keeper
     where location_id in (select id from public.locations
                            where btrim(name_ar) = dup.nm and id <> keeper);

    -- لا نحذف: نعطّل النسخة الزائدة ونميّزها
    update public.locations
       set is_active = false,
           code = coalesce(code, 'DUP-' || left(id::text, 8)),
           name_ar = name_ar || ' (مكرر - معطّل)'
     where btrim(name_ar) = dup.nm and id <> keeper;

    raise notice 'تم دمج موقع مكرر: %', dup.nm;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- قوائم القيم المعتمدة
-- ---------------------------------------------------------------------
insert into public.ref_values (domain, code, name_ar, sort_order) values
  ('role','super_admin','مدير النظام',1),
  ('role','requester','مقدم طلب شراء',2),
  ('role','production_officer','مسؤول الإنتاج',3),
  ('role','branch_manager','مدير الفرع',4),
  ('role','production_manager','مدير الإنتاج',5),
  ('role','procurement','إدارة المشتريات',6),
  ('role','finance','الإدارة المالية',7),

  ('status','draft','مسودة',1),
  ('status','submitted','مرسل',2),
  ('status','pending_production_officer','بانتظار اعتماد مسؤول الإنتاج',3),
  ('status','pending_branch_manager','بانتظار اعتماد مدير الفرع',4),
  ('status','pending_production_manager','بانتظار اعتماد مدير الإنتاج',5),
  ('status','pending_procurement','بانتظار إدارة المشتريات',6),
  ('status','pending_finance','بانتظار الإدارة المالية',7),
  ('status','returned','معاد للتعديل',8),
  ('status','rejected','مرفوض',9),
  ('status','completed','مكتمل',10),
  ('status','cancelled','ملغى',11),

  ('stage','production_officer','مسؤول الإنتاج',1),
  ('stage','branch_manager','مدير الفرع',2),
  ('stage','production_manager','مدير الإنتاج',3),
  ('stage','procurement','إدارة المشتريات',4),
  ('stage','finance','الإدارة المالية',5),

  ('purchase_type','operational','تشغيلي',1),
  ('purchase_type','direct','مباشر',2),
  ('purchase_type','emergency','طارئ',3),

  ('priority','low','منخفضة',1),
  ('priority','normal','عادية',2),
  ('priority','high','عالية',3),
  ('priority','urgent','عاجلة',4),

  ('document_type','supplier_invoice','فاتورة المورد',1),
  ('document_type','erp_document','مستند إدخال الفاتورة في ERP',2),
  ('document_type','other','مستند إضافي',3),

  ('category','food','مواد غذائية',1),
  ('category','packaging','تغليف ومستهلكات',2),
  ('category','maintenance','صيانة وإصلاح',3),
  ('category','equipment','معدات وأجهزة',4),
  ('category','services','خدمات',5),
  ('category','cleaning','مواد نظافة',6),
  ('category','transport','نقل وشحن',7),
  ('category','other','أخرى',8),

  ('unit','piece','حبة',1),
  ('unit','kg','كيلوجرام',2),
  ('unit','carton','كرتون',3),
  ('unit','liter','لتر',4),
  ('unit','pack','عبوة',5),
  ('unit','service','خدمة',6)
on conflict (domain, code) do update
  set name_ar = excluded.name_ar, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------
-- تحقق نهائي: يجب أن تكون المواقع الـ27 المعتمدة كلها نشطة وفريدة
-- ---------------------------------------------------------------------
do $$
declare n integer;
begin
  select count(*) into n from public.locations
   where is_active and code ~ '^(BR|CN)-[0-9]{2}$';
  if n <> 27 then
    raise exception 'خطأ في البذرة: عدد المواقع المعتمدة % بدلاً من 27', n;
  end if;
  raise notice 'تم التحقق: 27 موقعًا معتمدًا ونشطًا.';
end $$;


-- ═══════════════════════════════════════════════════════════════
--  20260914090400_admin_functions.sql
-- ═══════════════════════════════════════════════════════════════

-- =====================================================================
-- 5/5 — دوال الخادم: التفعيل، تحديد المعدل، تسجيل الدخول
-- تُستدعى من Edge Functions بمفتاح الخدمة، ولا تُكشف للمتصفح.
-- =====================================================================

-- ---------------------------------------------------------------------
-- تحديد معدل الطلبات — نافذة زمنية منزلقة بسيطة
-- ترجع true إذا كانت المحاولة مسموحة
-- ---------------------------------------------------------------------
create or replace function app.rate_limit_hit(
  p_bucket text, p_identifier text,
  p_window_seconds integer default 900, p_max_hits integer default 10
) returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  w_start timestamptz := date_trunc('second', now())
                         - make_interval(secs => (extract(epoch from now())::bigint % p_window_seconds));
  current_hits integer;
begin
  delete from app.rate_limits where window_start < now() - interval '1 day';

  insert into app.rate_limits (bucket, identifier, window_start, hits)
  values (p_bucket, p_identifier, w_start, 1)
  on conflict (bucket, identifier, window_start)
    do update set hits = app.rate_limits.hits + 1
  returning hits into current_hits;

  return current_hits <= p_max_hits;
end;
$fn$;

-- ---------------------------------------------------------------------
-- إنشاء رمز تفعيل — يُخزَّن الهاش فقط، ولا يُخزَّن الرمز نفسه أبدًا
-- ---------------------------------------------------------------------
create or replace function app.create_activation_token(
  p_token_hash text, p_full_name text, p_phone text,
  p_role text default 'super_admin', p_location_code text default 'CN-06',
  p_hours integer default 24
) returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare new_id uuid; norm text;
begin
  norm := app.normalize_saudi_phone(p_phone);
  if norm is null then
    raise exception 'INVALID_PHONE' using hint = 'رقم الجوال غير صحيح';
  end if;

  -- إبطال أي رموز مفتوحة سابقة لنفس الغرض والرقم
  update public.activation_tokens
     set used_at = now()
   where phone = norm and used_at is null and purpose = 'super_admin_activation';

  insert into public.activation_tokens
    (token_hash, purpose, full_name, phone, role, location_code, expires_at)
  values
    (p_token_hash, 'super_admin_activation', p_full_name, norm, p_role, p_location_code,
     now() + make_interval(hours => p_hours))
  returning id into new_id;

  insert into public.audit_logs (action, entity_type, entity_id, details)
  values ('activation.token_created', 'activation_token', new_id::text,
          jsonb_build_object('phone', norm, 'role', p_role, 'expires_hours', p_hours));

  return new_id;
end;
$fn$;

-- ---------------------------------------------------------------------
-- فحص رمز التفعيل دون استهلاكه (لصفحة التفعيل)
-- ---------------------------------------------------------------------
create or replace function app.peek_activation_token(p_token_hash text)
returns table (valid boolean, reason text, full_name text, phone text, role text)
language plpgsql
security definer
set search_path = ''
as $fn$
declare t public.activation_tokens;
begin
  select * into t from public.activation_tokens where token_hash = p_token_hash;

  if t is null then
    return query select false, 'NOT_FOUND'::text, null::text, null::text, null::text; return;
  end if;
  if t.used_at is not null then
    return query select false, 'ALREADY_USED'::text, null::text, null::text, null::text; return;
  end if;
  if t.expires_at < now() then
    return query select false, 'EXPIRED'::text, null::text, null::text, null::text; return;
  end if;

  return query select true, 'OK'::text, t.full_name, t.phone, t.role;
end;
$fn$;

-- ---------------------------------------------------------------------
-- حجز الرمز ذرّيًا — يضمن استخدامًا واحدًا فقط حتى مع طلبات متزامنة
-- ---------------------------------------------------------------------
create or replace function app.claim_activation_token(p_token_hash text)
returns public.activation_tokens
language plpgsql
security definer
set search_path = ''
as $fn$
declare t public.activation_tokens;
begin
  update public.activation_tokens
     set used_at = now()
   where token_hash = p_token_hash
     and used_at is null
     and expires_at > now()
  returning * into t;

  if t is null then
    raise exception 'TOKEN_INVALID'
      using hint = 'رابط التفعيل غير صالح أو منتهي الصلاحية أو مستخدم مسبقًا';
  end if;
  return t;
end;
$fn$;

-- تحرير الحجز إذا فشل إنشاء المستخدم بعد الحجز
create or replace function app.release_activation_token(p_token_hash text)
returns void
language sql
security definer
set search_path = ''
as $fn$
  update public.activation_tokens set used_at = null
   where token_hash = p_token_hash and used_by is null;
$fn$;

-- ---------------------------------------------------------------------
-- إنهاء التفعيل: ربط الرمز بالمستخدم وإنشاء ملفه
-- ---------------------------------------------------------------------
create or replace function app.complete_activation(
  p_token_hash text, p_user_id uuid, p_full_name text, p_phone text
) returns public.profiles
language plpgsql
security definer
set search_path = ''
as $fn$
declare t public.activation_tokens; lid uuid; p public.profiles;
begin
  select * into t from public.activation_tokens where token_hash = p_token_hash;
  if t is null then
    raise exception 'TOKEN_INVALID' using hint = 'رمز التفعيل غير صالح';
  end if;

  select id into lid from public.locations where code = t.location_code;
  if lid is null then
    select id into lid from public.locations where name_ar = 'الإدارة المركزية' limit 1;
  end if;

  insert into public.profiles
    (id, full_name, phone, role, location_id, job_title, is_active, must_change_password)
  values
    (p_user_id, p_full_name, app.normalize_saudi_phone(p_phone), t.role, lid,
     'مدير النظام', true, false)
  on conflict (id) do update
    set full_name = excluded.full_name, phone = excluded.phone,
        role = excluded.role, location_id = excluded.location_id, is_active = true
  returning * into p;

  update public.activation_tokens set used_by = p_user_id where id = t.id;

  insert into public.audit_logs (actor_id, actor_name, actor_role, action, entity_type, entity_id, location_id, details)
  values (p_user_id, p_full_name, t.role, 'activation.completed', 'profile', p_user_id::text, lid,
          jsonb_build_object('phone', app.normalize_saudi_phone(p_phone), 'role', t.role));

  return p;
end;
$fn$;

-- ---------------------------------------------------------------------
-- تسجيل آخر دخول (يستدعيه العميل بعد نجاح الدخول)
-- ---------------------------------------------------------------------
create or replace function app.record_login()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare me public.profiles;
begin
  update public.profiles set last_login_at = now()
   where id = (select auth.uid()) returning * into me;
  if me.id is not null then
    insert into public.audit_logs (actor_id, actor_name, actor_role, action, entity_type, entity_id, location_id)
    values (me.id, me.full_name, me.role, 'auth.login', 'profile', me.id::text, me.location_id);
  end if;
end;
$fn$;

create or replace function public.record_login()
returns void
language plpgsql security definer set search_path = ''
as $fn$ begin perform app.record_login(); end; $fn$;

revoke all on function public.record_login() from public, anon;
grant execute on function public.record_login() to authenticated;

-- ---------------------------------------------------------------------
-- تسجيل عملية إدارية في سجل التدقيق (من Edge Functions)
-- ---------------------------------------------------------------------
create or replace function app.log_admin_action(
  p_actor uuid, p_action text, p_entity_type text, p_entity_id text,
  p_details jsonb default '{}'::jsonb, p_ip text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare a public.profiles;
begin
  select * into a from public.profiles where id = p_actor;
  insert into public.audit_logs
    (actor_id, actor_name, actor_role, action, entity_type, entity_id, location_id, details, ip_address)
  values (p_actor, a.full_name, a.role, p_action, p_entity_type, p_entity_id,
          a.location_id, coalesce(p_details, '{}'::jsonb), p_ip);
end;
$fn$;

-- هذه الدوال لمفتاح الخدمة فقط — لا تُمنح لأي دور عميل
revoke all on function
  app.rate_limit_hit(text, text, integer, integer),
  app.create_activation_token(text, text, text, text, text, integer),
  app.peek_activation_token(text),
  app.claim_activation_token(text),
  app.release_activation_token(text),
  app.complete_activation(text, uuid, text, text),
  app.log_admin_action(uuid, text, text, text, jsonb, text)
from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- أغلفة public لمسار مفتاح الخدمة فقط
-- PostgREST يصل إلى سكيما public وحدها، لذا نكشف أغلفة رفيعة
-- ونمنحها للدور service_role حصرًا — ممنوعة على anon و authenticated.
-- ---------------------------------------------------------------------
create or replace function public.rate_limit_hit(
  p_bucket text, p_identifier text, p_window_seconds integer, p_max_hits integer)
returns boolean language plpgsql security definer set search_path = ''
as $fn$ begin
  return app.rate_limit_hit(p_bucket, p_identifier, p_window_seconds, p_max_hits);
end; $fn$;

create or replace function public.peek_activation_token(p_token_hash text)
returns table (valid boolean, reason text, full_name text, phone text, role text)
language plpgsql security definer set search_path = ''
as $fn$ begin
  return query select * from app.peek_activation_token(p_token_hash);
end; $fn$;

create or replace function public.claim_activation_token(p_token_hash text)
returns public.activation_tokens
language plpgsql security definer set search_path = ''
as $fn$ begin return app.claim_activation_token(p_token_hash); end; $fn$;

create or replace function public.release_activation_token(p_token_hash text)
returns void language plpgsql security definer set search_path = ''
as $fn$ begin perform app.release_activation_token(p_token_hash); end; $fn$;

create or replace function public.complete_activation(
  p_token_hash text, p_user_id uuid, p_full_name text, p_phone text)
returns public.profiles
language plpgsql security definer set search_path = ''
as $fn$ begin
  return app.complete_activation(p_token_hash, p_user_id, p_full_name, p_phone);
end; $fn$;

create or replace function public.create_activation_token(
  p_token_hash text, p_full_name text, p_phone text,
  p_role text default 'super_admin', p_location_code text default 'CN-06',
  p_hours integer default 24)
returns uuid language plpgsql security definer set search_path = ''
as $fn$ begin
  return app.create_activation_token(p_token_hash, p_full_name, p_phone,
                                     p_role, p_location_code, p_hours);
end; $fn$;

create or replace function public.log_admin_action(
  p_actor uuid, p_action text, p_entity_type text, p_entity_id text,
  p_details jsonb default '{}'::jsonb, p_ip text default null)
returns void language plpgsql security definer set search_path = ''
as $fn$ begin
  perform app.log_admin_action(p_actor, p_action, p_entity_type, p_entity_id, p_details, p_ip);
end; $fn$;

-- هذه الأغلفة ممنوعة على المتصفح تمامًا
revoke all on function
  public.rate_limit_hit(text, text, integer, integer),
  public.peek_activation_token(text),
  public.claim_activation_token(text),
  public.release_activation_token(text),
  public.complete_activation(text, uuid, text, text),
  public.create_activation_token(text, text, text, text, text, integer),
  public.log_admin_action(uuid, text, text, text, jsonb, text)
from public, anon, authenticated;

grant execute on function
  public.rate_limit_hit(text, text, integer, integer),
  public.peek_activation_token(text),
  public.claim_activation_token(text),
  public.release_activation_token(text),
  public.complete_activation(text, uuid, text, text),
  public.create_activation_token(text, text, text, text, text, integer),
  public.log_admin_action(uuid, text, text, text, jsonb, text)
to service_role;


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
