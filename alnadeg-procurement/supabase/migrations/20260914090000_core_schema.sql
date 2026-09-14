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
