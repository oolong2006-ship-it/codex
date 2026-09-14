-- =====================================================================
-- مجموعة اختبارات الانحدار لمنطق العمل وسياسات الصلاحيات
-- تُشغَّل على قاعدة اختبار محلية: npm run db:test
-- كل فشل يرفع استثناء ويوقف التشغيل.
-- =====================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function test.expect_error(p_sql text, p_needle text, p_label text)
returns void language plpgsql as $fn$
declare got text := '<لم يحدث خطأ>';
begin
  begin
    execute p_sql;
  exception when others then
    got := sqlerrm || ' | ' || coalesce(sqlerrm, '');
  end;
  if position(p_needle in got) = 0 then
    raise exception 'FAIL [%]: توقعنا «%» لكن النتيجة: %', p_label, p_needle, got;
  end if;
  raise notice 'PASS [%]', p_label;
end;
$fn$;

create or replace function test.ok(p_cond boolean, p_label text)
returns void language plpgsql as $fn$
begin
  if not p_cond then raise exception 'FAIL [%]', p_label; end if;
  raise notice 'PASS [%]', p_label;
end;
$fn$;

-- =====================================================================
begin;

-- ---------- T-A: تطبيع رقم الجوال ----------
select test.ok(app.normalize_saudi_phone('0559847714')    = '966559847714', 'A1 تطبيع 05xxxxxxxx');
select test.ok(app.normalize_saudi_phone('966559847714')  = '966559847714', 'A2 تطبيع 9665xxxxxxxx');
select test.ok(app.normalize_saudi_phone('+966559847714') = '966559847714', 'A3 تطبيع +9665xxxxxxxx');
select test.ok(app.normalize_saudi_phone('00966559847714')= '966559847714', 'A4 تطبيع 009665xxxxxxxx');
select test.ok(app.normalize_saudi_phone('559847714')     = '966559847714', 'A5 تطبيع 5xxxxxxxx');
select test.ok(app.normalize_saudi_phone('٠٥٥٩٨٤٧٧١٤')    = '966559847714', 'A6 تطبيع الأرقام العربية');
select test.ok(app.normalize_saudi_phone('0459847714')    is null,          'A7 رفض رقم غير سعودي الصيغة');
select test.ok(app.normalize_saudi_phone('05598477')      is null,          'A8 رفض رقم ناقص');

-- ---------- T-B: المواقع ----------
select test.ok((select count(*) from public.locations where is_active) = 27, 'B1 ظهور 27 موقعًا نشطًا');
select test.ok((select count(*) from public.locations where kind='branch') = 21, 'B2 عدد الفروع 21');
select test.ok((select count(*) from public.locations where kind='central') = 6, 'B3 المواقع المركزية 6');
select test.ok((select count(*) from (select name_ar from public.locations group by name_ar having count(*)>1) x) = 0,
               'B4 لا يوجد موقع مكرر');
select test.ok((select name_ar from public.locations where sort_order=1) = 'الشفا', 'B5 ترتيب المواقع مطابق');
select test.ok((select name_ar from public.locations where sort_order=27) = 'الإدارة المركزية', 'B6 آخر موقع مطابق');

-- ---------- T-C: إنشاء طلب بواسطة مقدم الطلب ----------
set local role authenticated;
select test.login(test.uid('req1'));

insert into public.purchase_requests
  (location_id, requester_id, status, request_date, purchase_date, purchase_type, priority,
   supplier_name, supplier_vat, invoice_number, invoice_date,
   amount_before_vat, vat_amount, total_amount, category, items_description,
   quantity, unit, justification)
values
  (test.loc('BR-01'), test.uid('req1'), 'draft', current_date, current_date, 'operational', 'normal',
   'مؤسسة الإمداد الغذائي', '310000000000003', 'INV-1001', current_date,
   1000.00, 150.00, 1150.00, 'food', 'زيت قلي 20 لتر', 10, 'carton', 'استهلاك تشغيلي شهري');

select test.setstate('r1', (select id from public.purchase_requests where invoice_number='INV-1001'));
select test.ok((select count(*) from public.purchase_requests where invoice_number='INV-1001')=1,
               'C1 إنشاء طلب شراء بنجاح');
select test.ok((select request_number from public.purchase_requests where invoice_number='INV-1001')
                 ~ '^PR-[0-9]{4}-[0-9]{5}$', 'C2 توليد رقم الطلب تلقائيًا');

-- منع الإنشاء لموقع آخر
select test.expect_error($$
  insert into public.purchase_requests (location_id, requester_id, status, request_date, supplier_name)
  values (test.loc('BR-02'), test.uid('req1'), 'draft', current_date, 'مورد')$$,
  'row-level security', 'C3 منع إنشاء طلب لموقع آخر');

-- ---------- T-D: الإرسال يتطلب فاتورة المورد ----------
select test.expect_error(
  format('select public.submit_purchase_request(%L::uuid)', test.getstate('r1')),
  'INVOICE_REQUIRED', 'D1 منع الإرسال دون إرفاق فاتورة المورد');

insert into public.request_documents
  (request_id, location_id, document_type, storage_path, file_name, mime_type, file_size, uploaded_by)
select id, location_id, 'supplier_invoice',
       location_id::text||'/'||id::text||'/supplier_invoice/'||gen_random_uuid()||'.pdf',
       'invoice-1001.pdf', 'application/pdf', 250000, test.uid('req1')
  from public.purchase_requests where invoice_number='INV-1001';

select public.submit_purchase_request(test.getstate('r1'));

select test.ok((select status from public.purchase_requests where invoice_number='INV-1001')
               = 'pending_production_officer', 'D2 الإرسال ينقل الطلب لمرحلة مسؤول الإنتاج');

-- ---------- T-E: منع الاعتماد خارج الصلاحية ----------
select test.expect_error(
  format('select public.decide_purchase_request(%L::uuid, %L)',
         test.getstate('r1'), 'approved'),
  'WRONG_STAGE_ROLE', 'E1 منع مقدم الطلب من الاعتماد');

select test.login(test.uid('po2'));   -- مسؤول إنتاج من فرع آخر

-- الطبقة الأولى: RLS تمنعه أصلاً من رؤية طلب فرع آخر
select test.ok((select count(*) from public.purchase_requests where invoice_number='INV-1001') = 0,
               'E2 عزل الفروع: مستخدم فرع آخر لا يرى الطلب إطلاقًا');

-- الطبقة الثانية: حتى لو عرف المعرّف، الدالة ترفض لاختلاف الموقع
select test.expect_error(
  format('select public.decide_purchase_request(%L::uuid, %L)', test.getstate('r1'), 'approved'),
  'WRONG_LOCATION', 'E3 منع مسؤول إنتاج فرع آخر من الاعتماد بمعرفة المعرّف');

-- ---------- T-F: مسار الاعتماد الخماسي بالترتيب ----------
select test.login(test.uid('po1'));
select public.decide_purchase_request(
  test.getstate('r1'), 'approved', 'مطابق للاستهلاك');
select test.ok((select status from public.purchase_requests where invoice_number='INV-1001')
               = 'pending_branch_manager', 'F1 المرحلة 1 → مدير الفرع');

-- محاولة اعتماد مكرر لنفس المرحلة
select test.expect_error(
  format('select public.decide_purchase_request(%L::uuid, %L)',
         test.getstate('r1'), 'approved'),
  'WRONG_STAGE_ROLE', 'F2 منع اعتماد المرحلة نفسها مرتين');

select test.login(test.uid('bm1'));
select public.decide_purchase_request(
  test.getstate('r1'), 'approved', 'معتمد من الفرع');
select test.ok((select status from public.purchase_requests where invoice_number='INV-1001')
               = 'pending_production_manager', 'F3 المرحلة 2 → مدير الإنتاج');

select test.login(test.uid('pm'));
select public.decide_purchase_request(
  test.getstate('r1'), 'approved', 'مطابق للخطة');
select test.ok((select status from public.purchase_requests where invoice_number='INV-1001')
               = 'pending_procurement', 'F4 المرحلة 3 → المشتريات');

select test.login(test.uid('proc'));
select public.decide_purchase_request(
  test.getstate('r1'), 'approved', 'السعر مطابق للسوق');
select test.ok((select status from public.purchase_requests where invoice_number='INV-1001')
               = 'pending_finance', 'F5 المرحلة 4 → المالية');

-- ---------- T-G: شرط مستند ERP قبل الإقفال المالي ----------
select test.login(test.uid('fin'));
select test.expect_error(
  format('select public.decide_purchase_request(%L::uuid, %L, %L)',
         test.getstate('r1'), 'approved', 'إقفال'),
  'ERP_DOCUMENT_REQUIRED', 'G1 منع الإقفال المالي دون مستند ERP');

insert into public.request_documents
  (request_id, location_id, document_type, storage_path, file_name, mime_type, file_size, uploaded_by)
select id, location_id, 'erp_document',
       location_id::text||'/'||id::text||'/erp_document/'||gen_random_uuid()||'.pdf',
       'erp-1001.pdf', 'application/pdf', 120000, test.uid('fin')
  from public.purchase_requests where invoice_number='INV-1001';

select public.decide_purchase_request(
  test.getstate('r1'), 'approved', 'تم القيد في ERP');
select test.ok((select status from public.purchase_requests where invoice_number='INV-1001')
               = 'completed', 'G2 الإقفال المالي بعد إرفاق مستند ERP');
select test.ok((select current_stage from public.purchase_requests where invoice_number='INV-1001') is null,
               'G3 إنهاء المسار بعد الاكتمال');
select test.ok((select completed_at from public.purchase_requests where invoice_number='INV-1001') is not null,
               'G4 تسجيل تاريخ الاكتمال');

-- ---------- T-H: الخط الزمني للاعتمادات ----------
select test.ok((select count(*) from public.approvals a
                 join public.purchase_requests r on r.id=a.request_id
                where r.invoice_number='INV-1001' and a.decision='approved') = 5,
               'H1 تسجيل خمسة اعتمادات في الخط الزمني');
select test.ok((select count(*) from public.approvals a
                 join public.purchase_requests r on r.id=a.request_id
                where r.invoice_number='INV-1001' and a.actor_name is not null
                  and a.previous_status is not null and a.new_status is not null) >= 5,
               'H2 حفظ المنفذ والحالة السابقة والجديدة لكل قرار');

commit;
