-- =====================================================================
-- مَورِد — 3/3 سياسات أمان الصفوف (RLS)
--
--   المشاهد       viewer : قراءة الموردين فقط
--   مدخل البيانات editor : + إضافة وتعديل (ويشمل الاستيراد)
--   المدير        admin  : + حذف، حذف التجريبي، إدارة المستخدمين
--
-- الزائر غير المسجّل (anon) لا يرى شيئاً. المستخدم المعطّل كذلك.
-- =====================================================================

alter table public.suppliers enable row level security;
alter table public.profiles  enable row level security;

revoke all on public.suppliers, public.profiles from anon;

-- ---------------------------------------------------------------------
-- suppliers
-- ---------------------------------------------------------------------
drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers
  for select to authenticated
  using ((select app.can_read()));

drop policy if exists suppliers_insert on public.suppliers;
create policy suppliers_insert on public.suppliers
  for insert to authenticated
  with check ((select app.can_edit()));

drop policy if exists suppliers_update on public.suppliers;
create policy suppliers_update on public.suppliers
  for update to authenticated
  using ((select app.can_edit()))
  with check ((select app.can_edit()));

drop policy if exists suppliers_delete on public.suppliers;
create policy suppliers_delete on public.suppliers
  for delete to authenticated
  using ((select app.is_admin()));

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select app.is_admin()));

-- المستخدم يعدّل اسمه فقط؛ الدور والحالة يحرسها المشغّل app.guard_profile_update
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select app.is_admin()))
  with check (id = (select auth.uid()) or (select app.is_admin()));

-- لا إدراج ولا حذف من الواجهة: الإنشاء عبر المشغّل عند إنشاء الحساب،
-- والإيقاف بتعطيل is_active.
