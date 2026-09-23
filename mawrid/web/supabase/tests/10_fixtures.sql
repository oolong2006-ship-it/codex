-- =====================================================================
-- بيانات الاختبار — قاعدة الاختبار المحلية فقط، لا تُطبَّق على الإنتاج
-- =====================================================================
create schema if not exists test;

create or replace function test.mkuser(p_label text, p_role public.user_role, p_active boolean default true)
returns uuid language plpgsql as $fn$
declare uid uuid;
begin
  insert into auth.users (email, raw_user_meta_data, email_confirmed_at)
  values (p_label || '@test.local', jsonb_build_object('full_name', p_label), now())
  returning id into uid;
  -- المشغّل أنشأ الملف بدور «مشاهد»؛ نضبط الدور مباشرة كمالك للجدول
  alter table public.profiles disable trigger profiles_guard;
  update public.profiles set role = p_role, is_active = p_active where id = uid;
  alter table public.profiles enable trigger profiles_guard;
  return uid;
end;
$fn$;

create or replace function test.login(p_user uuid) returns void
language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$fn$;

create table if not exists test.users (label text primary key, id uuid);
insert into test.users values
  ('admin',    test.mkuser('admin',    'admin')),
  ('editor',   test.mkuser('editor',   'editor')),
  ('viewer',   test.mkuser('viewer',   'viewer')),
  ('disabled', test.mkuser('disabled', 'editor', false)),
  ('fresh',    null);

create or replace function test.uid(p_label text) returns uuid
language sql stable as $fn$ select id from test.users where label = p_label; $fn$;

create or replace function test.ok(p_cond boolean, p_name text) returns void
language plpgsql as $fn$
begin
  if coalesce(p_cond, false) then raise notice 'PASS %', p_name;
  else raise notice 'FAIL %', p_name; raise exception 'test failed: %', p_name; end if;
end;
$fn$;

-- ينجح إذا فشل الأمر برسالة تحتوي النص المتوقع
create or replace function test.expect_error(p_sql text, p_contains text, p_name text) returns void
language plpgsql as $fn$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_contains in sqlerrm) > 0 or position(p_contains in sqlstate) > 0 then
      raise notice 'PASS %', p_name; return;
    end if;
    raise notice 'FAIL % (got: % %)', p_name, sqlstate, sqlerrm;
    raise exception 'test failed: %', p_name;
  end;
  raise notice 'FAIL % (no error)', p_name;
  raise exception 'test failed: %', p_name;
end;
$fn$;

grant usage on schema test to authenticated, anon;
grant select on test.users to authenticated, anon;
grant execute on all functions in schema test to authenticated, anon;

-- موردون تجريبيون بأسماء وهمية صريحة (demo = true)
insert into public.suppliers (name, cr, vat, city, categories, coverage, payment, credit_days,
                              certificates, status, rating, products, demo)
values
  ('مؤسسة اختبار اللحوم', '1010000001', '300000000000003', 'الرياض',
   array['لحوم ودواجن','مجمدات'], array['الرياض','القصيم'], 'آجل', 30,
   array['HACCP','شهادة حلال'], 'موثّق', 5, 'دجاج طازج، لحم غنم', true),
  ('شركة اختبار الألبان', '4030000002', null, 'جدة',
   array['ألبان وأجبان'], array['جدة','مكة المكرمة'], 'نقدي', 0,
   array['ISO 22000'], 'قيد التحقق', 3, 'أجبان، لبنة', true),
  ('مخبز الاختبار', null, null, 'الدمام',
   array['مخبوزات وحلويات'], array['الدمام','الخبر'], 'نقدي وآجل', 15,
   '{}', 'غير موثّق', 0, 'خبز برجر، كرواسون', true);
