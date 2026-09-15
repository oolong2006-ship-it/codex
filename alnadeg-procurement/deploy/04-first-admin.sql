-- =====================================================================
--  ترقية حسابك إلى مدير النظام
--
--  يُستخدم بعد إنشاء الحساب من لوحة Supabase مباشرة:
--    Authentication ← Users ← Add user ← Create new user
--      Email          : 966559847714@phone.alnadeg.local
--      Password       : اختر كلمة مرور قوية (١٢ حرفًا فأكثر)
--      Auto Confirm   : ✅ مفعّل  ← مهم جدًا وإلا تعذّر الدخول
--
--  ثم شغّل هذا الملف. لا يحتاج أي مفتاح ولا أي خدمة خارجية.
--
--  إن أردت رقمًا آخر، غيّر السطر الأول فقط.
-- =====================================================================
do $$
declare
  v_phone_input text := '0559847714';          -- ← رقم الجوال
  v_full_name   text := 'محمد صالح باعمر';      -- ← الاسم الكامل
  v_location    text := 'CN-06';               -- ← الإدارة المركزية

  v_phone text;
  v_email text;
  v_user  uuid;
  v_loc   uuid;
begin
  v_phone := app.normalize_saudi_phone(v_phone_input);
  if v_phone is null then
    raise exception 'رقم الجوال غير صحيح: %', v_phone_input;
  end if;
  v_email := v_phone || '@phone.alnadeg.local';

  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then
    raise exception E'لم يُعثر على حساب بالبريد %.\n'
      'أنشئه أولًا من: Authentication ← Users ← Add user\n'
      'مع تفعيل خيار Auto Confirm User.', v_email;
  end if;

  select id into v_loc from public.locations where code = v_location;
  if v_loc is null then
    select id into v_loc from public.locations where name_ar = 'الإدارة المركزية' limit 1;
  end if;
  if v_loc is null then
    raise exception 'لم يُعثر على الموقع الإداري — شغّل ملف 01-database.sql أولًا.';
  end if;

  insert into public.profiles
    (id, full_name, phone, role, location_id, job_title, is_active, must_change_password)
  values
    (v_user, v_full_name, v_phone, 'super_admin', v_loc, 'مدير النظام', true, false)
  on conflict (id) do update
    set full_name   = excluded.full_name,
        phone       = excluded.phone,
        role        = 'super_admin',
        location_id = excluded.location_id,
        is_active   = true;

  -- الدور يُخزَّن في app_metadata أيضًا لاتساق الجلسة
  update auth.users
     set raw_app_meta_data =
           coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"super_admin"}'::jsonb
   where id = v_user;

  insert into public.audit_logs
    (actor_id, actor_name, actor_role, action, entity_type, entity_id, location_id, details)
  values
    (v_user, v_full_name, 'super_admin', 'admin.bootstrapped', 'profile', v_user::text, v_loc,
     jsonb_build_object('phone', v_phone, 'method', 'dashboard'));

  raise notice 'تم: % — مدير نظام مفعّل برقم %', v_full_name, v_phone;
end $$;

-- تقرير التأكيد
select
  p.full_name            as "الاسم",
  p.phone                as "رقم الجوال",
  p.role                 as "الدور",
  l.name_ar              as "الموقع",
  p.is_active            as "نشط",
  u.email_confirmed_at is not null as "الحساب مؤكَّد",
  case when u.email_confirmed_at is null
       then '⚠️ فعّل Auto Confirm من لوحة Supabase وإلا تعذّر الدخول'
       else '✅ جاهز لتسجيل الدخول' end as "الحالة"
from public.profiles p
join auth.users u on u.id = p.id
left join public.locations l on l.id = p.location_id
where p.role = 'super_admin' and p.is_active;
