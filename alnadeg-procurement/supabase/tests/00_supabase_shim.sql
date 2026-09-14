-- =====================================================================
-- محاكاة بيئة Supabase محليًا — لأغراض الاختبار فقط
-- هذا الملف لا يُطبَّق أبدًا على قاعدة الإنتاج (Supabase يوفّر هذه الكائنات).
-- =====================================================================
create extension if not exists "pgcrypto";

do $$ begin create role anon          nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role  nologin bypassrls; exception when duplicate_object then null; end $$;
grant anon, authenticated, service_role to postgres;

create schema if not exists auth;
create schema if not exists storage;
grant usage on schema auth, storage to anon, authenticated, service_role;

create table if not exists auth.users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique,
  phone         text,
  raw_app_meta_data  jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  encrypted_password text,
  email_confirmed_at timestamptz,
  banned_until  timestamptz,
  created_at    timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $fn$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$fn$;

create or replace function auth.role() returns text
language sql stable as $fn$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', 'anon');
$fn$;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text not null,
  owner_id   text,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function storage.foldername(name text) returns text[]
language plpgsql immutable as $fn$
declare parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1 : greatest(array_length(parts, 1) - 1, 0)];
end;
$fn$;

alter table storage.objects enable row level security;
grant select, insert, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;

-- Supabase تمنح هذه الصلاحيات افتراضيًا على سكيما public؛ نحاكيها حتى
-- تكون RLS هي البوابة الفعلية في الاختبارات وليس نقص الصلاحيات.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
