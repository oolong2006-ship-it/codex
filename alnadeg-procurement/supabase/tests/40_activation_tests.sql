-- =====================================================================
-- اختبارات التفعيل وتحديد المعدل (مسار مفتاح الخدمة)
-- =====================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

begin;

-- ---------- التفعيل لمرة واحدة ----------
select app.create_activation_token(
  encode(digest('TEST-TOKEN-ONE', 'sha256'), 'hex'),
  'محمد صالح باعمر', '966577777777', 'super_admin', 'CN-06', 24);

select test.ok((select valid from app.peek_activation_token(
                 encode(digest('TEST-TOKEN-ONE','sha256'),'hex'))) = true,
               'U1 الرمز الجديد صالح');
select test.ok((select phone from app.peek_activation_token(
                 encode(digest('TEST-TOKEN-ONE','sha256'),'hex'))) = '966577777777',
               'U2 الرمز مرتبط برقم الجوال الصحيح');
select test.ok((select role from app.peek_activation_token(
                 encode(digest('TEST-TOKEN-ONE','sha256'),'hex'))) = 'super_admin',
               'U3 الرمز يمنح دور مدير النظام');

-- الرمز نفسه لا يُخزَّن في قاعدة البيانات، الهاش فقط
select test.ok((select count(*) from public.activation_tokens
                 where token_hash = 'TEST-TOKEN-ONE') = 0,
               'U4 الرمز الخام غير مخزَّن — الهاش فقط');

select test.ok((select id from app.claim_activation_token(
                 encode(digest('TEST-TOKEN-ONE','sha256'),'hex'))) is not null,
               'U5 حجز الرمز ينجح مرة واحدة');

select test.expect_error(
  format('select app.claim_activation_token(%L)', encode(digest('TEST-TOKEN-ONE','sha256'),'hex')),
  'TOKEN_INVALID', 'U6 منع استخدام الرمز مرة ثانية');

select test.ok((select reason from app.peek_activation_token(
                 encode(digest('TEST-TOKEN-ONE','sha256'),'hex'))) = 'ALREADY_USED',
               'U7 الرمز المستهلك يُعلَن مستخدمًا');

-- إنهاء التفعيل ينشئ ملف مدير النظام
insert into auth.users (id, email, raw_app_meta_data, email_confirmed_at)
values ('11111111-1111-1111-1111-111111111111',
        'admin-activation-test@phone.alnadeg.local',
        '{"role":"super_admin"}'::jsonb, now());

select app.complete_activation(
  encode(digest('TEST-TOKEN-ONE','sha256'),'hex'),
  '11111111-1111-1111-1111-111111111111', 'محمد صالح باعمر', '0577777777');

select test.ok((select role from public.profiles
                 where id='11111111-1111-1111-1111-111111111111') = 'super_admin',
               'U8 إنشاء ملف مدير النظام بالدور الصحيح');
select test.ok((select l.name_ar from public.profiles p join public.locations l on l.id=p.location_id
                 where p.id='11111111-1111-1111-1111-111111111111') = 'الإدارة المركزية',
               'U9 ربط مدير النظام بالإدارة المركزية');
select test.ok((select phone from public.profiles
                 where id='11111111-1111-1111-1111-111111111111') = '966577777777',
               'U10 تخزين رقم الجوال بالصيغة الموحدة');
select test.ok((select count(*) from public.audit_logs where action='activation.completed') = 1,
               'U11 تسجيل التفعيل في سجل التدقيق');

-- ---------- الرمز المنتهي ----------
select app.create_activation_token(
  encode(digest('TEST-TOKEN-EXPIRED','sha256'),'hex'),
  'مستخدم اختبار', '0512345678', 'super_admin', 'CN-06', 24);
update public.activation_tokens set expires_at = now() - interval '1 hour'
 where token_hash = encode(digest('TEST-TOKEN-EXPIRED','sha256'),'hex');

select test.ok((select reason from app.peek_activation_token(
                 encode(digest('TEST-TOKEN-EXPIRED','sha256'),'hex'))) = 'EXPIRED',
               'U12 كشف الرمز المنتهي');
select test.expect_error(
  format('select app.claim_activation_token(%L)', encode(digest('TEST-TOKEN-EXPIRED','sha256'),'hex')),
  'TOKEN_INVALID', 'U13 منع استخدام رمز منتهي الصلاحية');

-- ---------- رمز غير موجود ----------
select test.ok((select reason from app.peek_activation_token('deadbeef')) = 'NOT_FOUND',
               'U14 كشف الرمز غير الموجود');

-- ---------- إصدار رمز جديد يُبطل السابق ----------
select app.create_activation_token(
  encode(digest('TEST-TOKEN-A','sha256'),'hex'), 'مدير', '0533333333', 'super_admin', 'CN-06', 24);
select app.create_activation_token(
  encode(digest('TEST-TOKEN-B','sha256'),'hex'), 'مدير', '0533333333', 'super_admin', 'CN-06', 24);
select test.ok((select reason from app.peek_activation_token(
                 encode(digest('TEST-TOKEN-A','sha256'),'hex'))) = 'ALREADY_USED',
               'U15 إصدار رمز جديد يُبطل الرمز السابق');
select test.ok((select valid from app.peek_activation_token(
                 encode(digest('TEST-TOKEN-B','sha256'),'hex'))) = true,
               'U16 الرمز الأحدث هو الصالح');

-- ---------- تحديد المعدل ----------
select test.ok((select bool_and(app.rate_limit_hit('login','127.0.0.1',900,5))
                 from generate_series(1,5)) = true,
               'V1 السماح بالمحاولات ضمن الحد');
select test.ok(app.rate_limit_hit('login','127.0.0.1',900,5) = false,
               'V2 منع المحاولات بعد تجاوز الحد');
select test.ok(app.rate_limit_hit('login','10.0.0.9',900,5) = true,
               'V3 الحد منفصل لكل هوية');

rollback;

-- ---------- منع المتصفح من الوصول لأغلفة مفتاح الخدمة ----------
begin;
set local role authenticated;
select test.login(test.uid('req1'));

select test.expect_error(
  $$select public.create_activation_token('x','y','0500000000','super_admin','CN-06',24)$$,
  'permission denied', 'W1 منع المستخدم من إنشاء رموز تفعيل');
select test.expect_error($$select public.peek_activation_token('x')$$,
  'permission denied', 'W2 منع المستخدم من فحص رموز التفعيل');
select test.expect_error($$select public.claim_activation_token('x')$$,
  'permission denied', 'W3 منع المستخدم من استهلاك رموز التفعيل');
select test.expect_error(
  $$select public.log_admin_action(null,'fake','x','y')$$,
  'permission denied', 'W4 منع المستخدم من الكتابة في سجل التدقيق');
select test.expect_error($$select public.rate_limit_hit('a','b',60,1)$$,
  'permission denied', 'W5 منع المستخدم من العبث بحدود المعدل');

rollback;
