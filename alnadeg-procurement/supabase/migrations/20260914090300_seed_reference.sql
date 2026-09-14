-- =====================================================================
-- 4/4 — بيانات مرجعية: المواقع الـ27 وقوائم القيم
--
-- قابلة لإعادة التشغيل دون تكرار: المطابقة بالكود الفريد.
-- لا تحذف أي موقع قائم؛ تحدّث الاسم والتصنيف والترتيب فقط.
-- المواقع القائمة بلا كود تُطابَق بالاسم العربي مرة واحدة ثم تُمنح كودها.
-- =====================================================================

-- 1) منح كود للمواقع القائمة التي تطابق الاسم ولا تحمل كودًا بعد
with target(code, name_ar) as (values
  ('BR-01','الشفا'), ('BR-02','العليا'), ('BR-03','الصحافة'), ('BR-04','اشبيلية'),
  ('BR-05','الربوة'), ('BR-06','العارض'), ('BR-07','غرناطة'), ('BR-08','النرجس'),
  ('BR-09','العزيزية'), ('BR-10','طريق الدمام - الجنادرية'), ('BR-11','بدر'),
  ('BR-12','مخرج 24'), ('BR-13','مخرج 28'), ('BR-14','مخرج 18'), ('BR-15','اليرموك'),
  ('BR-16','الخرج'), ('BR-17','بريدة'), ('BR-18','الأحساء'), ('BR-19','حفر الباطن'),
  ('BR-20','الطائف'), ('BR-21','المدينة المنورة'),
  ('CN-01','المعمل المركزي'), ('CN-02','المستودع المركزي'), ('CN-03','قسم الحوش'),
  ('CN-04','قسم الحفلات'), ('CN-05','قسم الخضار'), ('CN-06','الإدارة المركزية')
)
update public.locations l
   set code = t.code
  from target t
 where l.code is null
   and btrim(l.name_ar) = t.name_ar
   and not exists (select 1 from public.locations x where x.code = t.code);

-- 2) الإدراج/التحديث النهائي بالكود
insert into public.locations (code, name_ar, kind, sort_order, is_active) values
  ('BR-01','الشفا','branch',1,true),
  ('BR-02','العليا','branch',2,true),
  ('BR-03','الصحافة','branch',3,true),
  ('BR-04','اشبيلية','branch',4,true),
  ('BR-05','الربوة','branch',5,true),
  ('BR-06','العارض','branch',6,true),
  ('BR-07','غرناطة','branch',7,true),
  ('BR-08','النرجس','branch',8,true),
  ('BR-09','العزيزية','branch',9,true),
  ('BR-10','طريق الدمام - الجنادرية','branch',10,true),
  ('BR-11','بدر','branch',11,true),
  ('BR-12','مخرج 24','branch',12,true),
  ('BR-13','مخرج 28','branch',13,true),
  ('BR-14','مخرج 18','branch',14,true),
  ('BR-15','اليرموك','branch',15,true),
  ('BR-16','الخرج','branch',16,true),
  ('BR-17','بريدة','branch',17,true),
  ('BR-18','الأحساء','branch',18,true),
  ('BR-19','حفر الباطن','branch',19,true),
  ('BR-20','الطائف','branch',20,true),
  ('BR-21','المدينة المنورة','branch',21,true),
  ('CN-01','المعمل المركزي','central',22,true),
  ('CN-02','المستودع المركزي','central',23,true),
  ('CN-03','قسم الحوش','central',24,true),
  ('CN-04','قسم الحفلات','central',25,true),
  ('CN-05','قسم الخضار','central',26,true),
  ('CN-06','الإدارة المركزية','central',27,true)
on conflict (code) do update
  set name_ar    = excluded.name_ar,
      kind       = excluded.kind,
      sort_order = excluded.sort_order,
      updated_at = now();

-- 3) دمج المواقع المكررة بالاسم (تبقى النسخة التي تحمل الكود المعتمد)
do $$
declare dup record; keeper uuid;
begin
  for dup in
    select btrim(name_ar) as nm, count(*) c
      from public.locations
     group by btrim(name_ar) having count(*) > 1
  loop
    select id into keeper from public.locations
     where btrim(name_ar) = dup.nm and code is not null
     order by sort_order limit 1;

    if keeper is null then continue; end if;

    -- إعادة ربط أي سجلات مرتبطة بالنسخة المكررة قبل تعطيلها
    update public.purchase_requests set location_id = keeper
     where location_id in (select id from public.locations
                            where btrim(name_ar) = dup.nm and id <> keeper);
    update public.profiles set location_id = keeper
     where location_id in (select id from public.locations
                            where btrim(name_ar) = dup.nm and id <> keeper);

    -- لا نحذف: نعطّل النسخة الزائدة ونميّزها
    update public.locations
       set is_active = false,
           code = coalesce(code, 'DUP-' || left(id::text, 8)),
           name_ar = name_ar || ' (مكرر - معطّل)'
     where btrim(name_ar) = dup.nm and id <> keeper;

    raise notice 'تم دمج موقع مكرر: %', dup.nm;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- قوائم القيم المعتمدة
-- ---------------------------------------------------------------------
insert into public.ref_values (domain, code, name_ar, sort_order) values
  ('role','super_admin','مدير النظام',1),
  ('role','requester','مقدم طلب شراء',2),
  ('role','production_officer','مسؤول الإنتاج',3),
  ('role','branch_manager','مدير الفرع',4),
  ('role','production_manager','مدير الإنتاج',5),
  ('role','procurement','إدارة المشتريات',6),
  ('role','finance','الإدارة المالية',7),

  ('status','draft','مسودة',1),
  ('status','submitted','مرسل',2),
  ('status','pending_production_officer','بانتظار اعتماد مسؤول الإنتاج',3),
  ('status','pending_branch_manager','بانتظار اعتماد مدير الفرع',4),
  ('status','pending_production_manager','بانتظار اعتماد مدير الإنتاج',5),
  ('status','pending_procurement','بانتظار إدارة المشتريات',6),
  ('status','pending_finance','بانتظار الإدارة المالية',7),
  ('status','returned','معاد للتعديل',8),
  ('status','rejected','مرفوض',9),
  ('status','completed','مكتمل',10),
  ('status','cancelled','ملغى',11),

  ('stage','production_officer','مسؤول الإنتاج',1),
  ('stage','branch_manager','مدير الفرع',2),
  ('stage','production_manager','مدير الإنتاج',3),
  ('stage','procurement','إدارة المشتريات',4),
  ('stage','finance','الإدارة المالية',5),

  ('purchase_type','operational','تشغيلي',1),
  ('purchase_type','direct','مباشر',2),
  ('purchase_type','emergency','طارئ',3),

  ('priority','low','منخفضة',1),
  ('priority','normal','عادية',2),
  ('priority','high','عالية',3),
  ('priority','urgent','عاجلة',4),

  ('document_type','supplier_invoice','فاتورة المورد',1),
  ('document_type','erp_document','مستند إدخال الفاتورة في ERP',2),
  ('document_type','other','مستند إضافي',3),

  ('category','food','مواد غذائية',1),
  ('category','packaging','تغليف ومستهلكات',2),
  ('category','maintenance','صيانة وإصلاح',3),
  ('category','equipment','معدات وأجهزة',4),
  ('category','services','خدمات',5),
  ('category','cleaning','مواد نظافة',6),
  ('category','transport','نقل وشحن',7),
  ('category','other','أخرى',8),

  ('unit','piece','حبة',1),
  ('unit','kg','كيلوجرام',2),
  ('unit','carton','كرتون',3),
  ('unit','liter','لتر',4),
  ('unit','pack','عبوة',5),
  ('unit','service','خدمة',6)
on conflict (domain, code) do update
  set name_ar = excluded.name_ar, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------
-- تحقق نهائي: يجب أن تكون المواقع الـ27 المعتمدة كلها نشطة وفريدة
-- ---------------------------------------------------------------------
do $$
declare n integer;
begin
  select count(*) into n from public.locations
   where is_active and code ~ '^(BR|CN)-[0-9]{2}$';
  if n <> 27 then
    raise exception 'خطأ في البذرة: عدد المواقع المعتمدة % بدلاً من 27', n;
  end if;
  raise notice 'تم التحقق: 27 موقعًا معتمدًا ونشطًا.';
end $$;
