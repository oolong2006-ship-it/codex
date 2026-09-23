-- =====================================================================
-- اختبارات الموردين: التطبيع، منع التكرار، البحث، القيود
-- =====================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;
begin;

select test.ok(app.normalize_ar('مُؤَسَّسَةُ الأَمْــانة') = 'موسسه الامانه', 'N1 حذف التشكيل والتطويل وتوحيد الهمزات والتاء');
select test.ok(app.normalize_ar('إبراهيم آل مكّى') = 'ابراهيم ال مكي', 'N2 إ/آ→ا والشدة وى→ي');
select test.ok(app.normalize_ar('  رقم  ١٢٣  ') = 'رقم 123', 'N3 الأرقام العربية والمسافات');
select test.ok(app.supplier_dedup_key('١٠١٠-٠٠٠٠٠١', 'x', 'y') = 'cr-1010000001', 'N4 مفتاح التكرار من السجل');
select test.ok(app.supplier_dedup_key(null, 'مخبز  الأمانة', 'جدة') = 'n-مخبز الامانه|جده', 'N5 مفتاح التكرار من الاسم والمدينة');

set local role authenticated;
select test.login(test.uid('editor'));

-- تنظيف المدخلات
insert into public.suppliers (name, cr, vat, city, categories, email, source)
values ('  مورد التنظيف  ', '١٠١٠ ١٢٣ ٤٥٦', ' 300000000000013 ', 'الرياض',
        array['بقالة جافة','بقالة جافة',''], '  Sales@Example.COM ', 'فريق المشتريات');
select test.ok((select name = 'مورد التنظيف' and cr = '1010123456' and vat = '300000000000013'
                   and email = 'sales@example.com' and categories = array['بقالة جافة']
                   and created_by = test.uid('editor') and status = 'قيد التحقق'
                  from public.suppliers where cr = '1010123456'), 'S1 تنظيف المدخلات والحالة الافتراضية');

-- منع التكرار
select test.expect_error($$insert into public.suppliers (name, cr, city, categories, source)
  values ('اسم آخر', '1010123456', 'جدة', array['مجمدات'], 'x')$$, 'duplicate key', 'S2 منع تكرار السجل التجاري');
select test.expect_error($$insert into public.suppliers (name, city, categories, demo)
  values ('مخبز الأختبار', 'الدمام', array['مجمدات'], true)$$, 'duplicate key', 'S3 منع تكرار الاسم+المدينة المطبّعين دون سجل');

-- الاستيراد: upsert على مفتاح التكرار يحدّث ولا يكرّر
insert into public.suppliers (name, cr, city, categories, source, rating)
values ('مورد التنظيف المحدّث', '1010123456', 'الرياض', array['بقالة جافة'], 'استيراد', 4)
on conflict (dedup_key) do update set name = excluded.name, rating = excluded.rating, source = excluded.source;
select test.ok((select count(*) = 1 and max(rating) = 4 and max(name) = 'مورد التنظيف المحدّث'
                  from public.suppliers where cr = '1010123456'), 'S4 الاستيراد يحدّث الموجود ولا يكرّره');

-- القيود
select test.expect_error($$insert into public.suppliers (name, vat, city, categories, source)
  values ('ضريبي خطأ', '123', 'الرياض', array['مجمدات'], 'x')$$, 'suppliers_vat_chk', 'S5 رفض رقم ضريبي غير صحيح');
select test.expect_error($$insert into public.suppliers (name, cr, city, categories, source)
  values ('سجل خطأ', '12345678', 'الرياض', array['مجمدات'], 'x')$$, 'suppliers_cr_chk', 'S6 رفض سجل تجاري ليس 10 أرقام');
select test.expect_error($$insert into public.suppliers (name, city, categories, source)
  values ('بلا تصنيف', 'الرياض', '{}', 'x')$$, 'suppliers_cats_chk', 'S7 إلزامية تصنيف واحد على الأقل');
select test.expect_error($$insert into public.suppliers (name, city, categories)
  values ('بلا مصدر', 'الرياض', array['مجمدات'])$$, 'suppliers_source_chk', 'S8 إلزامية مصدر البيانات لغير التجريبي');
select test.expect_error($$insert into public.suppliers (name, city, categories, source, rating)
  values ('تقييم', 'الرياض', array['مجمدات'], 'x', 6)$$, 'suppliers_rating_chk', 'S9 التقييم بين 0 و5');

-- البحث
select test.ok((select count(*) from public.search_suppliers('الالبان')) = 1, 'Q1 البحث يتجاهل الهمزة والتاء (الألبان)');
select test.ok((select name from public.search_suppliers('لبنه جده')) = 'شركة اختبار الألبان', 'Q2 البحث بعدة كلمات في حقول مختلفة');
select test.ok((select count(*) from public.search_suppliers('4030000002')) = 1, 'Q3 البحث بالسجل التجاري');
select test.ok((select count(*) from public.search_suppliers(null, 'لحوم ودواجن')) = 1, 'Q4 فلتر التصنيف');
select test.ok((select count(*) from public.search_suppliers(null, null, 'القصيم')) = 1, 'Q5 فلتر المدينة يشمل مدن التغطية');
select test.ok((select count(*) from public.search_suppliers(null, null, null, 'آجل')) = 2, 'Q6 فلتر «يقبل الآجل» يشمل نقدي وآجل');
select test.ok((select count(*) from public.search_suppliers(null, null, null, 'نقدي')) = 1, 'Q7 فلتر نقدي فقط');
select test.ok((select count(*) from public.search_suppliers(null, null, null, null, 'HACCP')) = 1, 'Q8 فلتر الشهادة');
select test.ok((select count(*) from public.search_suppliers(null, null, null, null, null, 'موثّق')) = 1, 'Q9 فلتر حالة التوثيق');
select test.ok((select name from public.search_suppliers(p_sort => 'rating') limit 1) = 'مؤسسة اختبار اللحوم', 'Q10 الترتيب بالتقييم');
select test.ok((select count(*) from public.search_suppliers('%')) = 0, 'Q11 رموز LIKE تُعامل كنص');
select test.ok(public.count_suppliers() = 4, 'Q12 العدّ');
select test.ok((public.supplier_stats() ->> 'demo')::int = 3
               and (public.supplier_stats() -> 'categories' ->> 'بقالة جافة')::int = 1, 'Q13 الإحصاءات');

-- العدّ لا يتوقف عند حد صفحة البحث (500)
insert into public.suppliers (name, city, categories, source)
select 'مورد رقم ' || g, 'الرياض', array['مجمدات'], 'اختبار' from generate_series(1, 700) g;
select test.ok(public.count_suppliers() = 704, 'Q14 العدّ يتجاوز 500 مورد');
select test.ok((select count(*) from public.search_suppliers(p_limit => 10000)) = 500, 'Q15 صفحة البحث محدودة بـ 500');
select test.ok((select count(*) from public.search_suppliers('رقم 69', p_limit => 100)) = 17, 'Q16 البحث ضمن عدد كبير');

rollback;
