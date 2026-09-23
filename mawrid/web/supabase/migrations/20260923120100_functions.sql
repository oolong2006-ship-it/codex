-- =====================================================================
-- مَورِد — 2/3 الدوال والمشغّلات
-- =====================================================================

-- ---------------------------------------------------------------------
-- مساعدات الصلاحيات — security definer لتفادي تكرار RLS على profiles
-- ---------------------------------------------------------------------
create or replace function app.current_role() returns public.user_role
language sql stable security definer set search_path = '' as $fn$
  select p.role from public.profiles p
   where p.id = (select auth.uid()) and p.is_active;
$fn$;

create or replace function app.can_read() returns boolean
language sql stable security definer set search_path = '' as $fn$
  select app.current_role() is not null;
$fn$;

create or replace function app.can_edit() returns boolean
language sql stable security definer set search_path = '' as $fn$
  select coalesce(app.current_role() in ('admin', 'editor'), false);
$fn$;

create or replace function app.is_admin() returns boolean
language sql stable security definer set search_path = '' as $fn$
  select coalesce(app.current_role() = 'admin', false);
$fn$;

grant execute on function app.current_role(), app.can_read(), app.can_edit(), app.is_admin()
  to authenticated;

-- ---------------------------------------------------------------------
-- تنظيف المدخلات وختم التعديل على الموردين
-- ---------------------------------------------------------------------
create or replace function app.suppliers_before_write() returns trigger
language plpgsql set search_path = '' as $fn$
begin
  new.name             := nullif(btrim(new.name), '');
  new.legal_name       := nullif(btrim(new.legal_name), '');
  new.cr               := nullif(app.digits(new.cr), '');
  new.vat              := nullif(app.digits(new.vat), '');
  new.city             := nullif(btrim(new.city), '');
  new.district         := nullif(btrim(new.district), '');
  new.national_address := nullif(upper(btrim(new.national_address)), '');
  new.contact_name     := nullif(btrim(new.contact_name), '');
  new.contact_role     := nullif(btrim(new.contact_role), '');
  new.phone            := nullif(btrim(new.phone), '');
  new.whatsapp         := nullif(btrim(new.whatsapp), '');
  new.email            := nullif(lower(btrim(new.email)), '');
  new.website          := nullif(btrim(new.website), '');
  new.products         := nullif(btrim(new.products), '');
  new.lead_time        := nullif(btrim(new.lead_time), '');
  new.moq              := nullif(btrim(new.moq), '');
  new.sfda_license     := nullif(btrim(new.sfda_license), '');
  new.notes            := nullif(btrim(new.notes), '');
  new.source           := nullif(btrim(new.source), '');
  new.categories       := coalesce(array(select distinct x from unnest(new.categories) x where btrim(x) <> ''), '{}');
  new.coverage         := coalesce(array(select distinct x from unnest(new.coverage) x where btrim(x) <> ''), '{}');
  new.delivery_days    := coalesce(array(select distinct x from unnest(new.delivery_days) x where btrim(x) <> ''), '{}');
  new.certificates     := coalesce(array(select distinct x from unnest(new.certificates) x where btrim(x) <> ''), '{}');
  new.credit_days      := coalesce(new.credit_days, 0);
  new.rating           := coalesce(new.rating, 0);

  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  return new;
end;
$fn$;

drop trigger if exists suppliers_before_write on public.suppliers;
create trigger suppliers_before_write
  before insert or update on public.suppliers
  for each row execute function app.suppliers_before_write();

-- ---------------------------------------------------------------------
-- إنشاء ملف المستخدم تلقائياً عند إنشاء حساب — بدور «مشاهد» وموقوفاً حتى يفعّله المدير،
-- فلو تُرك التسجيل الذاتي مفتوحاً بالخطأ لا يرى المسجّل أي بيانات.
-- ---------------------------------------------------------------------
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  insert into public.profiles (id, email, full_name, role, is_active)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
          'viewer', false)
  on conflict (id) do nothing;
  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------
-- حماية الملف الشخصي: غير المدير لا يغيّر دوره ولا حالته ولا بريده
-- ---------------------------------------------------------------------
create or replace function app.guard_profile_update() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  -- محرر SQL في لوحة Supabase (بلا مستخدم مسجّل) مسموح له — لتعيين أول مدير
  if auth.uid() is null then
    new.updated_at := now();
    return new;
  end if;
  if not app.is_admin() then
    if new.role is distinct from old.role or new.is_active is distinct from old.is_active
       or new.email is distinct from old.email or new.id is distinct from old.id then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
  elsif old.id = auth.uid() and (new.role <> 'admin' or not new.is_active) then
    -- المدير لا يسحب صلاحيته من نفسه حتى لا يُغلق النظام بلا مدير
    raise exception 'SELF_DEMOTE' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function app.guard_profile_update();

-- ---------------------------------------------------------------------
-- البحث: كل الكلمات المطبّعة يجب أن تظهر في نص البحث + الفلاتر.
-- app.filter_suppliers هو الشرط الموحّد، يستخدمه البحث والعدّ معاً.
-- كلها security invoker فتطبَّق RLS على الجدول كالمعتاد.
-- ---------------------------------------------------------------------
create or replace function app.filter_suppliers(
  p_q text, p_category text, p_city text, p_payment text, p_cert text, p_status text
) returns setof public.suppliers
language sql stable security invoker set search_path = '' as $fn$
  with words as (
    select array_remove(string_to_array(app.normalize_ar(p_q), ' '), '') as w
  )
  select s.* from public.suppliers s, words
   where (coalesce(cardinality(words.w), 0) = 0
          or s.search_text like all (array(
               select '%' || replace(replace(replace(x, '\', '\\'), '%', '\%'), '_', '\_') || '%'
                 from unnest(words.w) x)))
     and (nullif(p_category, '') is null or s.categories @> array[p_category])
     and (nullif(p_city, '') is null or s.city = p_city or s.coverage @> array[p_city])
     and (nullif(p_payment, '') is null
          or (p_payment = 'آجل'  and s.payment in ('آجل', 'نقدي وآجل'))
          or (p_payment = 'نقدي' and s.payment = 'نقدي'))
     and (nullif(p_cert, '') is null or s.certificates @> array[p_cert])
     and (nullif(p_status, '') is null or s.status::text = p_status);
$fn$;
revoke execute on function app.filter_suppliers(text, text, text, text, text, text) from public;
grant execute on function app.filter_suppliers(text, text, text, text, text, text) to authenticated;

create or replace function public.search_suppliers(
  p_q        text default null,
  p_category text default null,
  p_city     text default null,
  p_payment  text default null,   -- 'آجل' = يقبل الآجل، 'نقدي' = نقدي فقط
  p_cert     text default null,
  p_status   text default null,
  p_sort     text default 'name', -- name | rating | updated
  p_limit    int  default 60,
  p_offset   int  default 0
) returns setof public.suppliers
language sql stable security invoker set search_path = '' as $fn$
  select s.* from app.filter_suppliers(p_q, p_category, p_city, p_payment, p_cert, p_status) s
   order by
     case when p_sort = 'rating'  then s.rating end desc nulls last,
     case when p_sort = 'updated' then s.updated_at end desc nulls last,
     s.name asc, s.id
   limit least(greatest(coalesce(p_limit, 60), 1), 500)
  offset greatest(coalesce(p_offset, 0), 0);
$fn$;

-- عدد الموردين المطابقين (لنفس الفلاتر) — لعرض «N مورد» والتصفح
create or replace function public.count_suppliers(
  p_q text default null, p_category text default null, p_city text default null,
  p_payment text default null, p_cert text default null, p_status text default null
) returns bigint
language sql stable security invoker set search_path = '' as $fn$
  select count(*) from app.filter_suppliers(p_q, p_category, p_city, p_payment, p_cert, p_status);
$fn$;

-- عدد الموردين في كل تصنيف + الإجمالي + عدد التجريبي
create or replace function public.supplier_stats() returns jsonb
language sql stable security invoker set search_path = '' as $fn$
  select jsonb_build_object(
    'total', (select count(*) from public.suppliers),
    'demo',  (select count(*) from public.suppliers where demo),
    'categories', coalesce((select jsonb_object_agg(c, n) from (
        select c, count(*) n from public.suppliers, unnest(categories) c group by c) t), '{}'::jsonb));
$fn$;

-- حذف كل البيانات التجريبية بأمر واحد — للمدير فقط
create or replace function public.delete_demo_suppliers() returns int
language plpgsql security invoker set search_path = '' as $fn$
declare n int;
begin
  if not app.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  delete from public.suppliers where demo;
  get diagnostics n = row_count;
  return n;
end;
$fn$;

-- Postgres يمنح PUBLIC حق التنفيذ افتراضياً؛ نقصره على المستخدمين المسجّلين
do $$
declare f text;
begin
  foreach f in array array[
    'public.search_suppliers(text, text, text, text, text, text, text, int, int)',
    'public.count_suppliers(text, text, text, text, text, text)',
    'public.supplier_stats()',
    'public.delete_demo_suppliers()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
