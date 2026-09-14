-- =====================================================================
--  ملف الإصلاح — شغّله فقط إذا أظهر فحص 00-preflight.sql علامة ❌
--
--  يحوّل الأعمدة ذات الأنواع المخصصة (ENUM) إلى نصوص، مع الحفاظ الكامل
--  على القيم القائمة. لا يحذف أي صف ولا أي عمود.
--
--  بعد التشغيل سيظهر تقرير:
--    • «جاهز» → شغّل 01-database.sql
--    • قيم غير معروفة → أرسل التقرير قبل المتابعة، لأن هذه القيم
--      ستمنع تطبيق قيود التحقق وتُفشل التنصيب.
-- =====================================================================

-- جدول مؤقت للتقرير (بلا on commit drop حتى يبقى بين العبارات)
drop table if exists _fix_report;
create temp table _fix_report(
  ترتيب int, القسم text, البند text, النتيجة text
);

do $$
declare
  targets text[][] := array[
    array['profiles','role'],
    array['purchase_requests','status'],
    array['purchase_requests','current_stage'],
    array['purchase_requests','purchase_type'],
    array['purchase_requests','priority'],
    array['locations','kind'],
    array['approvals','decision'],
    array['approvals','stage'],
    array['request_documents','document_type']
  ];
  t text; c text; dtype text; i int;
  converted int := 0;
begin
  for i in 1 .. array_length(targets, 1) loop
    t := targets[i][1];
    c := targets[i][2];

    select data_type into dtype from information_schema.columns
     where table_schema = 'public' and table_name = t and column_name = c;

    if dtype is null then
      continue;                       -- العمود غير موجود بعد، سيُنشئه التنصيب
    end if;

    if dtype in ('text','character varying') then
      insert into _fix_report values (10, 'الأعمدة', t || '.' || c, '✅ نصي أصلاً');
      continue;
    end if;

    begin
      -- القيمة الافتراضية تمنع تغيير النوع، فتُزال ثم يعيدها ملف التنصيب
      execute format('alter table public.%I alter column %I drop default', t, c);
      execute format('alter table public.%I alter column %I type text using %I::text', t, c, c);
      converted := converted + 1;
      insert into _fix_report values
        (10, 'الأعمدة', t || '.' || c, '🔧 حُوِّل من ' || dtype || ' إلى text');
    exception
      when others then
        insert into _fix_report values
          (5, 'تعذّر التحويل', t || '.' || c,
           '❌ ' || sqlerrm || ' — أرسل هذه الرسالة');
    end;
  end loop;

  insert into _fix_report values
    (1, 'الخلاصة', 'أعمدة حُوِّلت إلى نص', converted::text);
end $$;

-- ---------------------------------------------------------------------
-- فحص القيم القائمة مقابل المفردات المعتمدة
-- ---------------------------------------------------------------------
do $$
declare
  checks text[][] := array[
    array['profiles','role',
          'super_admin,requester,production_officer,branch_manager,production_manager,procurement,finance'],
    array['purchase_requests','status',
          'draft,submitted,pending_production_officer,pending_branch_manager,pending_production_manager,pending_procurement,pending_finance,returned,rejected,completed,cancelled'],
    array['purchase_requests','current_stage',
          'production_officer,branch_manager,production_manager,procurement,finance'],
    array['purchase_requests','purchase_type','operational,direct,emergency'],
    array['purchase_requests','priority','low,normal,high,urgent'],
    array['locations','kind','branch,central'],
    array['approvals','decision','approved,rejected,returned,submitted,cancelled'],
    array['approvals','stage',
          'production_officer,branch_manager,production_manager,procurement,finance'],
    array['request_documents','document_type','supplier_invoice,erp_document,other']
  ];
  t text; c text; allowed text; i int; rec record; bad int := 0;
begin
  for i in 1 .. array_length(checks, 1) loop
    t := checks[i][1]; c := checks[i][2]; allowed := checks[i][3];

    if not exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name=t and column_name=c) then
      continue;
    end if;

    for rec in execute format(
      'select %I::text as val, count(*) as n from public.%I
        where %I is not null and %I::text <> all (string_to_array(%L, '','')) 
        group by 1 order by 2 desc limit 20', c, t, c, c, allowed)
    loop
      bad := bad + 1;
      insert into _fix_report values
        (3, 'قيم غير معروفة', t || '.' || c,
         format('«%s» في %s صفًا — غير مقبولة', rec.val, rec.n));
    end loop;
  end loop;

  if bad = 0 then
    insert into _fix_report values
      (2, 'الخلاصة', 'هل يمكن تشغيل 01-database.sql الآن؟', '✅ نعم — جاهز');
  else
    insert into _fix_report values
      (2, 'الخلاصة', 'هل يمكن تشغيل 01-database.sql الآن؟',
       format('❌ لا — %s قيمة غير معروفة. أرسل هذا التقرير.', bad));
  end if;
end $$;

select ترتيب as "#", القسم as "القسم", البند as "البند", النتيجة as "النتيجة"
  from _fix_report order by ترتيب, البند;
