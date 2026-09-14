-- بيانات اختبار (تُستخدم على قاعدة اختبار محلية فقط)
create schema if not exists test;

create or replace function test.mkuser(p_name text, p_phone text, p_role text, p_loc text)
returns uuid language plpgsql as $fn$
declare uid uuid := gen_random_uuid(); lid uuid; existing uuid;
begin
  select id into existing from auth.users where email = app.phone_to_email(p_phone);
  if existing is not null then return existing; end if;

  select id into lid from public.locations where code = p_loc;
  insert into auth.users (id, email, raw_app_meta_data, email_confirmed_at)
  values (uid, app.phone_to_email(p_phone),
          jsonb_build_object('role', p_role, 'provider','email'), now());
  insert into public.profiles (id, full_name, phone, role, location_id, is_active, must_change_password)
  values (uid, p_name, app.normalize_saudi_phone(p_phone), p_role, lid, true, false);
  return uid;
end;
$fn$;

-- تسجيل الدخول كمستخدم داخل المعاملة الحالية
create or replace function test.login(p_user uuid) returns void
language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$fn$;

create table if not exists test.users (label text primary key, id uuid);

insert into test.users (label, id) values
  ('admin', test.mkuser('محمد صالح باعمر','0559847714','super_admin','CN-06')),
  ('req1',  test.mkuser('سالم الشهري','0501112233','requester','BR-01')),
  ('po1',   test.mkuser('فهد القحطاني','0502223344','production_officer','BR-01')),
  ('bm1',   test.mkuser('ناصر العتيبي','0503334455','branch_manager','BR-01')),
  ('req2',  test.mkuser('خالد الزهراني','0504445566','requester','BR-02')),
  ('po2',   test.mkuser('ماجد الدوسري','0505556677','production_officer','BR-02')),
  ('pm',    test.mkuser('عبدالله الغامدي','0506667788','production_manager','CN-06')),
  ('proc',  test.mkuser('تركي الحربي','0507778899','procurement','CN-06')),
  ('fin',   test.mkuser('ياسر السبيعي','0508889900','finance','CN-06'))
on conflict (label) do nothing;

create or replace function test.uid(p_label text) returns uuid
language sql stable as $fn$ select id from test.users where label = p_label; $fn$;

create or replace function test.loc(p_code text) returns uuid
language sql stable as $fn$ select id from public.locations where code = p_code; $fn$;

-- سكيما الاختبار يجب أن تكون متاحة بعد التحول إلى الدور authenticated
grant usage on schema test to authenticated, anon;
grant select on test.users to authenticated, anon;
grant execute on all functions in schema test to authenticated, anon;
alter default privileges in schema test grant execute on functions to authenticated, anon;

-- حالة مشتركة بين خطوات الاختبار (تتجاوز حجب RLS عند تبديل المستخدم)
create table if not exists test.state (key text primary key, value uuid);
grant select, insert, update on test.state to authenticated, anon;

create or replace function test.setstate(k text, v uuid) returns void
language sql as $fn$
  insert into test.state values (k, v) on conflict (key) do update set value = excluded.value;
$fn$;

create or replace function test.getstate(k text) returns uuid
language sql stable as $fn$ select value from test.state where key = k; $fn$;

grant execute on all functions in schema test to authenticated, anon;
