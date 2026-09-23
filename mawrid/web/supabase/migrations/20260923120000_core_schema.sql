-- =====================================================================
-- مَورِد — 1/3 المخطط الأساسي
--   • تطبيع النص العربي للبحث ومنع التكرار
--   • جدول الموردين suppliers
--   • ملفات المستخدمين profiles وأدوارهم (مدير / مدخل بيانات / مشاهد)
-- الملف قابل لإعادة التطبيق دون أخطاء (idempotent).
-- =====================================================================

create extension if not exists pg_trgm;

create schema if not exists app;
grant usage on schema app to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- الأنواع
-- ---------------------------------------------------------------------
do $$ begin
  create type public.payment_terms as enum ('نقدي', 'آجل', 'نقدي وآجل');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.verification_status as enum ('موثّق', 'قيد التحقق', 'غير موثّق');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.user_role as enum ('admin', 'editor', 'viewer');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- تطبيع النص العربي — نفس قواعد src/lib/normalize.ts حرفياً:
--   حذف التشكيل والتطويل، أ/إ/آ/ٱ→ا، ة→ه، ى→ي، ؤ→و، ئ→ي،
--   الأرقام العربية-الهندية→لاتينية، أحرف صغيرة، مسافات موحّدة.
-- ---------------------------------------------------------------------
create or replace function app.normalize_ar(p text) returns text
language sql immutable parallel safe as $fn$
  select btrim(regexp_replace(lower(
           translate(
             regexp_replace(coalesce(p, ''), '[ً-ٰٟـ]', '', 'g'),
             'أإآٱةىؤئ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
             'ااااهيوي01234567890123456789')),
         '\s+', ' ', 'g'));
$fn$;

create or replace function app.digits(p text) returns text
language sql immutable parallel safe as $fn$
  select regexp_replace(translate(coalesce(p, ''),
           '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '\D', '', 'g');
$fn$;

-- مفتاح منع التكرار: السجل التجاري إن وُجد (7 أرقام فأكثر)، وإلا الاسم + المدينة
create or replace function app.supplier_dedup_key(p_cr text, p_name text, p_city text)
returns text language sql immutable parallel safe as $fn$
  select case
    when length(app.digits(p_cr)) >= 7 then 'cr-' || app.digits(p_cr)
    else 'n-' || app.normalize_ar(p_name) || '|' || app.normalize_ar(p_city)
  end;
$fn$;

-- نص البحث المطبّع لكل مورد. array_to_string مصنّفة stable في Postgres
-- لأنها عامة لكل الأنواع، لكنها حتمية مع text[] فنغلّفها كدالة immutable.
create or replace function app.supplier_search_text(
  p_name text, p_legal text, p_cr text, p_vat text, p_city text, p_district text,
  p_products text, p_contact text, p_categories text[], p_coverage text[]
) returns text language sql immutable parallel safe as $fn$
  select app.normalize_ar(concat_ws(' ', p_name, p_legal, p_cr, p_vat, p_city, p_district,
           p_products, p_contact, array_to_string(p_categories, ' '), array_to_string(p_coverage, ' ')));
$fn$;

-- ---------------------------------------------------------------------
-- الموردون
-- ---------------------------------------------------------------------
create table if not exists public.suppliers (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  legal_name       text,
  cr               text,
  vat              text,
  city             text not null,
  district         text,
  national_address text,
  contact_name     text,
  contact_role     text,
  phone            text,
  whatsapp         text,
  email            text,
  website          text,
  categories       text[] not null default '{}',
  products         text,
  coverage         text[] not null default '{}',
  delivery_days    text[] not null default '{}',
  lead_time        text,
  moq              text,
  payment          public.payment_terms,
  credit_days      int not null default 0,
  certificates     text[] not null default '{}',
  sfda_license     text,
  status           public.verification_status not null default 'قيد التحقق',
  rating           int not null default 0,
  notes            text,
  source           text,
  demo             boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id) on delete set null,
  updated_by       uuid references auth.users (id) on delete set null,

  dedup_key   text generated always as (app.supplier_dedup_key(cr, name, city)) stored,
  search_text text generated always as (app.supplier_search_text(
      name, legal_name, cr, vat, city, district, products, contact_name, categories, coverage)) stored,

  constraint suppliers_name_chk    check (length(btrim(name)) between 2 and 200),
  constraint suppliers_city_chk    check (length(btrim(city)) between 2 and 60),
  constraint suppliers_cr_chk      check (cr is null or cr ~ '^[0-9]{10}$'),
  constraint suppliers_vat_chk     check (vat is null or vat ~ '^3[0-9]{13}3$'),
  constraint suppliers_email_chk   check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- قاعدة المنتج: لا بيانات بلا مصدر (البيانات التجريبية مستثناة)
  constraint suppliers_source_chk  check (demo or source is not null),
  constraint suppliers_rating_chk  check (rating between 0 and 5),
  constraint suppliers_credit_chk  check (credit_days between 0 and 365),
  constraint suppliers_cats_chk    check (cardinality(categories) >= 1),
  constraint suppliers_notes_chk   check (notes is null or length(notes) <= 4000),
  constraint suppliers_products_chk check (products is null or length(products) <= 4000)
);

create unique index if not exists suppliers_cr_key        on public.suppliers (cr) where cr is not null;
create unique index if not exists suppliers_dedup_key     on public.suppliers (dedup_key);
create index        if not exists suppliers_search_trgm   on public.suppliers using gin (search_text gin_trgm_ops);
create index        if not exists suppliers_search_fts    on public.suppliers using gin (to_tsvector('simple', search_text));
create index        if not exists suppliers_categories_ix on public.suppliers using gin (categories);
create index        if not exists suppliers_coverage_ix   on public.suppliers using gin (coverage);
create index        if not exists suppliers_city_ix       on public.suppliers (city);
create index        if not exists suppliers_demo_ix       on public.suppliers (demo) where demo;

-- ---------------------------------------------------------------------
-- ملفات المستخدمين
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  email      text,
  role       public.user_role not null default 'viewer',
  is_active  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
