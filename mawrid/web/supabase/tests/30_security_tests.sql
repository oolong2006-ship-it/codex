-- =====================================================================
-- اختبارات الصلاحيات (RLS)
-- =====================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;
begin;

-- الزائر غير المسجّل
set local role anon;
select test.login(null);
select test.expect_error('select count(*) from public.suppliers', 'permission denied', 'R1 الزائر لا يقرأ الموردين');
select test.expect_error('select * from public.search_suppliers()', 'permission denied', 'R2 الزائر لا يستدعي البحث');

set local role authenticated;

-- المشاهد
select test.login(test.uid('viewer'));
select test.ok((select count(*) from public.suppliers) = 3, 'R3 المشاهد يقرأ الموردين');
select test.expect_error($$insert into public.suppliers (name, city, categories, source)
  values ('من مشاهد', 'الرياض', array['مجمدات'], 'x')$$, 'row-level security', 'R4 المشاهد لا يضيف');
update public.suppliers set rating = 1 where name = 'مخبز الاختبار';
select test.ok((select rating from public.suppliers where name = 'مخبز الاختبار') = 0, 'R5 المشاهد لا يعدّل');
delete from public.suppliers;
select test.ok((select count(*) from public.suppliers) = 3, 'R6 المشاهد لا يحذف');
select test.expect_error($$update public.profiles set role = 'admin' where id = test.uid('viewer')$$, 'FORBIDDEN', 'R7 المشاهد لا يرفع دوره');
update public.profiles set full_name = 'اسم جديد' where id = test.uid('viewer');
select test.ok((select full_name from public.profiles where id = test.uid('viewer')) = 'اسم جديد', 'R8 المستخدم يعدّل اسمه');
select test.ok((select count(*) from public.profiles) = 1, 'R9 غير المدير يرى ملفه فقط');

-- المستخدم المعطّل
select test.login(test.uid('disabled'));
select test.ok((select count(*) from public.suppliers) = 0, 'R10 المعطّل لا يرى شيئاً');
select test.expect_error($$insert into public.suppliers (name, city, categories, source)
  values ('من معطّل', 'الرياض', array['مجمدات'], 'x')$$, 'row-level security', 'R11 المعطّل لا يضيف');

-- مدخل البيانات
select test.login(test.uid('editor'));
insert into public.suppliers (name, city, categories, source) values ('من مدخل', 'الرياض', array['مجمدات'], 'فريق المشتريات');
select test.ok((select count(*) from public.suppliers where name = 'من مدخل') = 1, 'R12 مدخل البيانات يضيف');
update public.suppliers set rating = 2 where name = 'من مدخل';
select test.ok((select rating from public.suppliers where name = 'من مدخل') = 2, 'R13 مدخل البيانات يعدّل');
delete from public.suppliers where name = 'من مدخل';
select test.ok((select count(*) from public.suppliers where name = 'من مدخل') = 1, 'R14 مدخل البيانات لا يحذف');
select test.expect_error('select public.delete_demo_suppliers()', 'FORBIDDEN', 'R15 مدخل البيانات لا يحذف التجريبي');
update public.suppliers set created_by = test.uid('admin') where name = 'من مدخل';
select test.ok((select created_by from public.suppliers where name = 'من مدخل') = test.uid('editor'), 'R16 لا يمكن تزوير منشئ السجل');

-- المدير
select test.login(test.uid('admin'));
select test.ok((select count(*) from public.profiles) = 4, 'R17 المدير يرى كل المستخدمين');
update public.profiles set role = 'editor' where id = test.uid('viewer');
select test.ok((select role from public.profiles where id = test.uid('viewer')) = 'editor', 'R18 المدير يغيّر الأدوار');
select test.expect_error($$update public.profiles set role = 'viewer' where id = test.uid('admin')$$, 'SELF_DEMOTE', 'R19 المدير لا يسحب صلاحيته من نفسه');
delete from public.suppliers where name = 'من مدخل';
select test.ok((select count(*) from public.suppliers where name = 'من مدخل') = 0, 'R20 المدير يحذف');
select test.ok(public.delete_demo_suppliers() = 3, 'R21 حذف التجريبي بأمر واحد');
select test.ok((select count(*) from public.suppliers) = 0, 'R22 لم يبقَ أي مورد تجريبي');

rollback;

-- الحساب الجديد يبدأ «مشاهداً» دائماً حتى لو طلب غير ذلك
begin;
insert into auth.users (email, raw_user_meta_data, raw_app_meta_data)
values ('new@test.local', '{"full_name":"جديد","role":"admin"}', '{"role":"admin"}');
select test.ok((select role = 'viewer' and not is_active and full_name = 'جديد' from public.profiles where email = 'new@test.local'),
               'R23 الحساب الجديد مشاهد وموقوف حتى يفعّله المدير');
rollback;

-- محرر SQL (بلا مستخدم مسجّل) يعيّن أول مدير
begin;
select test.login(null);
update public.profiles set role = 'admin' where id = test.uid('viewer');
select test.ok((select role from public.profiles where id = test.uid('viewer')) = 'admin', 'R24 تعيين أول مدير من محرر SQL');
rollback;
