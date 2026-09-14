-- =====================================================================
-- اختبارات الأمان والتحقق من المدخلات
-- =====================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

begin;

-- ---------- T-I: الرفض والإعادة ----------
set local role authenticated;
select test.login(test.uid('req1'));

insert into public.purchase_requests
  (location_id, requester_id, status, request_date, purchase_date, purchase_type, priority,
   supplier_name, supplier_vat, invoice_number, invoice_date,
   amount_before_vat, vat_amount, total_amount, category, items_description, justification)
values
  (test.loc('BR-01'), test.uid('req1'), 'draft', current_date, current_date, 'direct', 'high',
   'شركة التوريدات الحديثة', '310000000000013', 'INV-2001', current_date,
   2000.00, 300.00, 2300.00, 'equipment', 'خلاط صناعي', 'استبدال معدة تالفة');
select test.setstate('r2', (select id from public.purchase_requests where invoice_number='INV-2001'));

insert into public.request_documents
  (request_id, location_id, document_type, storage_path, file_name, mime_type, file_size, uploaded_by)
select id, location_id, 'supplier_invoice',
       location_id::text||'/'||id::text||'/supplier_invoice/'||gen_random_uuid()||'.pdf',
       'inv2001.pdf','application/pdf', 90000, test.uid('req1')
  from public.purchase_requests where id = test.getstate('r2');

select public.submit_purchase_request(test.getstate('r2'));

select test.login(test.uid('po1'));
select test.expect_error(
  format('select public.decide_purchase_request(%L::uuid, %L)', test.getstate('r2'), 'rejected'),
  'NOTE_REQUIRED', 'I1 منع الرفض دون كتابة سبب');

select test.expect_error(
  format('select public.decide_purchase_request(%L::uuid, %L)', test.getstate('r2'), 'returned'),
  'NOTE_REQUIRED', 'I2 منع الإعادة دون كتابة سبب');

select public.decide_purchase_request(test.getstate('r2'), 'returned', 'يرجى إرفاق عرض سعر ثانٍ');
select test.ok((select status from public.purchase_requests where id = test.getstate('r2')) = 'returned',
               'I3 إعادة الطلب للتعديل');

-- مقدم الطلب يعدّل ويعيد الإرسال
select test.login(test.uid('req1'));
update public.purchase_requests set justification = 'استبدال معدة تالفة + عرض سعر مرفق'
 where id = test.getstate('r2');
select test.ok((select justification from public.purchase_requests where id = test.getstate('r2'))
                 like '%عرض سعر مرفق%', 'I4 تعديل الطلب بعد الإعادة');
select public.submit_purchase_request(test.getstate('r2'));
select test.ok((select status from public.purchase_requests where id = test.getstate('r2'))
                 = 'pending_production_officer', 'I5 إعادة الإرسال بعد التعديل');

select test.login(test.uid('po1'));
select public.decide_purchase_request(test.getstate('r2'), 'rejected', 'الصنف غير مدرج بالميزانية');
select test.ok((select status from public.purchase_requests where id = test.getstate('r2')) = 'rejected',
               'I6 رفض الطلب مع تسجيل السبب');
select test.ok((select note from public.approvals
                 where request_id = test.getstate('r2') and decision='rejected')
                 = 'الصنف غير مدرج بالميزانية', 'I7 حفظ سبب الرفض في سجل الاعتمادات');

-- ---------- T-J: منع التعديل بعد بدء الاعتماد ----------
select test.login(test.uid('req1'));
update public.purchase_requests set notes = 'محاولة تعديل بعد الاكتمال'
 where id = test.getstate('r1');
select test.ok((select notes from public.purchase_requests where id = test.getstate('r1')) is null,
               'J1 منع مقدم الطلب من تعديل طلب مكتمل');

-- ---------- T-K: منع تكرار الفاتورة ----------
select test.expect_error($$
  insert into public.purchase_requests
    (location_id, requester_id, status, request_date, purchase_type,
     supplier_name, supplier_vat, invoice_number, amount_before_vat, vat_amount, total_amount, justification)
  values (test.loc('BR-01'), test.uid('req1'), 'draft', current_date, 'operational',
          'مؤسسة الإمداد الغذائي', '310000000000003', 'INV-1001', 500, 75, 575, 'تكرار')$$,
  'duplicate key', 'K1 منع تكرار فاتورة المورد نفسه برقم الفاتورة نفسه');

-- الفاتورة نفسها من مورد مختلف مسموحة
insert into public.purchase_requests
  (location_id, requester_id, status, request_date, purchase_type,
   supplier_name, supplier_vat, invoice_number, amount_before_vat, vat_amount, total_amount, justification)
values (test.loc('BR-01'), test.uid('req1'), 'draft', current_date, 'operational',
        'مورد مختلف', '310000000000023', 'INV-1001', 500, 75, 575, 'مورد آخر');
select test.ok(true, 'K2 السماح بنفس رقم الفاتورة من مورد مختلف');

-- ---------- T-L: التحقق من صحة البيانات ----------
select test.expect_error($$
  insert into public.purchase_requests
    (location_id, requester_id, status, request_date, supplier_vat, supplier_name, justification)
  values (test.loc('BR-01'), test.uid('req1'), 'draft', current_date, '123456789', 'مورد', 'اختبار')$$,
  'purchase_requests_vat_check', 'L1 رفض رقم ضريبي غير صحيح');

select test.expect_error($$
  insert into public.purchase_requests
    (location_id, requester_id, status, request_date, supplier_name,
     amount_before_vat, vat_amount, total_amount, justification)
  values (test.loc('BR-01'), test.uid('req1'), 'draft', current_date, 'مورد', 1000, 150, 9999, 'اختبار')$$,
  'total_consistency', 'L2 رفض إجمالي لا يطابق المبلغ والضريبة');

select test.expect_error($$
  insert into public.purchase_requests
    (location_id, requester_id, status, request_date, supplier_name, amount_before_vat, justification)
  values (test.loc('BR-01'), test.uid('req1'), 'draft', current_date, 'مورد', -50, 'اختبار')$$,
  'amounts_check', 'L3 رفض مبلغ سالب');

-- ---------- T-M: قيود المرفقات ----------
-- ندخل كمدير نظام حتى تمر سياسة RLS ويصل الاختبار إلى قيود CHECK نفسها
select test.login(test.uid('admin'));
select test.expect_error($$
  insert into public.request_documents
    (request_id, location_id, document_type, storage_path, file_name, mime_type, file_size)
  values (test.getstate('r2'), test.loc('BR-01'), 'other', 'x/y/z/big.pdf', 'big.pdf',
          'application/pdf', 11534336)$$,
  'request_documents_size_check', 'M1 رفض ملف أكبر من 10 ميجابايت');

select test.expect_error($$
  insert into public.request_documents
    (request_id, location_id, document_type, storage_path, file_name, mime_type, file_size)
  values (test.getstate('r2'), test.loc('BR-01'), 'other', 'x/y/z/evil.exe', 'evil.exe',
          'application/x-msdownload', 1000)$$,
  'request_documents_mime_check', 'M2 رفض نوع ملف غير مسموح');

select test.expect_error($$
  insert into public.request_documents
    (request_id, location_id, document_type, storage_path, file_name, mime_type, file_size)
  values (test.getstate('r2'), test.loc('BR-01'), 'virus', 'x/y/z/a.pdf', 'a.pdf',
          'application/pdf', 1000)$$,
  'request_documents_type_check', 'M3 رفض نوع مستند غير معروف');

-- ---------- T-N: منع تصعيد الصلاحيات ----------
select test.login(test.uid('req1'));
update public.profiles set role = 'super_admin' where id = test.uid('req1');
select test.ok((select role from public.profiles where id = test.uid('req1')) = 'requester',
               'N1 منع المستخدم من ترقية دوره');

update public.profiles set location_id = test.loc('BR-02') where id = test.uid('req1');
select test.ok((select location_id from public.profiles where id = test.uid('req1')) = test.loc('BR-01'),
               'N2 منع المستخدم من نقل نفسه لموقع آخر');

update public.profiles set is_active = true where id = test.uid('po2');
select test.ok((select count(*) from public.profiles where id = test.uid('po2')
                  and updated_at > now() - interval '2 seconds') = 0,
               'N3 منع المستخدم من تعديل ملف مستخدم آخر');

-- ---------- T-O: سجل التدقيق ----------
select test.ok((select count(*) from public.audit_logs) = 0,
               'O1 سجل التدقيق محجوب عن غير مدير النظام');

select test.expect_error('delete from public.audit_logs', 'permission denied',
               'O2 منع حذف سجل التدقيق');
select test.expect_error($$update public.audit_logs set action='tampered'$$, 'permission denied',
               'O3 منع تعديل سجل التدقيق');

select test.login(test.uid('admin'));
select test.ok((select count(*) from public.audit_logs) > 0,
               'O4 مدير النظام يقرأ سجل التدقيق');
select test.ok((select count(*) from public.audit_logs where action like 'request.%') > 0,
               'O5 تسجيل عمليات الطلبات في سجل التدقيق');

-- ---------- T-P: منع الكتابة المباشرة في سجل الاعتمادات ----------
select test.login(test.uid('req1'));
select test.expect_error($$
  insert into public.approvals (request_id, stage, decision, actor_id, actor_name, actor_role)
  values (test.getstate('r1'), 'finance', 'approved', test.uid('req1'), 'تزوير', 'finance')$$,
  'row-level security', 'P1 منع الكتابة المباشرة في سجل الاعتمادات');

-- ---------- T-Q: رموز التفعيل محجوبة تمامًا ----------
select test.expect_error('select * from public.activation_tokens', 'permission denied',
               'Q1 منع الوصول لرموز التفعيل من المتصفح');

-- ---------- T-R: الزائر غير المسجّل ----------
reset role;
set local role anon;
select test.expect_error('select * from public.purchase_requests', 'permission denied',
               'R1 منع الزائر من قراءة الطلبات');
select test.expect_error('select * from public.profiles', 'permission denied',
               'R2 منع الزائر من قراءة المستخدمين');
select test.expect_error('select * from public.locations', 'permission denied',
               'R3 منع الزائر من قراءة المواقع');

-- ---------- T-S: تجاوز المرحلة من مدير النظام ----------
reset role;
set local role authenticated;
select test.login(test.uid('req1'));
insert into public.purchase_requests
  (location_id, requester_id, status, request_date, purchase_type, supplier_name, supplier_vat,
   invoice_number, amount_before_vat, vat_amount, total_amount, justification)
values (test.loc('BR-01'), test.uid('req1'), 'draft', current_date, 'emergency', 'مورد طارئ',
        '310000000000033', 'INV-3001', 100, 15, 115, 'حالة طارئة');
select test.setstate('r3', (select id from public.purchase_requests where invoice_number='INV-3001'));
insert into public.request_documents
  (request_id, location_id, document_type, storage_path, file_name, mime_type, file_size, uploaded_by)
values (test.getstate('r3'), test.loc('BR-01'), 'supplier_invoice',
        test.loc('BR-01')::text||'/'||test.getstate('r3')::text||'/supplier_invoice/'||gen_random_uuid()||'.pdf',
        'i3.pdf','application/pdf', 5000, test.uid('req1'));
select public.submit_purchase_request(test.getstate('r3'));

select test.login(test.uid('admin'));
select test.expect_error(
  format('select public.decide_purchase_request(%L::uuid, %L, null, true)', test.getstate('r3'), 'approved'),
  'OVERRIDE_NOTE_REQUIRED', 'S1 منع التجاوز دون تسجيل سبب');

select public.decide_purchase_request(test.getstate('r3'), 'approved', 'تجاوز لضرورة تشغيلية', true);
select test.ok((select is_override from public.approvals
                 where request_id = test.getstate('r3') and stage='production_officer') = true,
               'S2 تسجيل التجاوز في سجل الاعتمادات');
select test.ok((select count(*) from public.audit_logs
                 where action='request.stage_overridden' and entity_id = test.getstate('r3')::text) = 1,
               'S3 تسجيل التجاوز في سجل التدقيق');

-- ---------- T-T: مؤشرات لوحة المتابعة ----------
select test.ok((public.get_dashboard_metrics() ->> 'total')::int >= 4, 'T1 حساب إجمالي الطلبات');
select test.ok((public.get_dashboard_metrics() ->> 'completed')::int >= 1, 'T2 حساب الطلبات المكتملة');
select test.ok((public.get_dashboard_metrics() ->> 'rejected')::int >= 1, 'T3 حساب الطلبات المرفوضة');
select test.ok(jsonb_array_length(public.get_dashboard_metrics() -> 'by_location') >= 1,
               'T4 توزيع الطلبات حسب الموقع');

-- نطاق المؤشرات محدود بموقع المستخدم غير المركزي
select test.login(test.uid('req2'));
select test.ok((public.get_dashboard_metrics() ->> 'total')::int = 0,
               'T5 مؤشرات مستخدم الفرع لا تشمل فروعًا أخرى');

commit;
