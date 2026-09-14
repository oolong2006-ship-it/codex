# بوابة مشتريات فروع شركة مطاعم الناضج

نظام تشغيلي لإدارة واعتماد طلبات الشراء لفروع ومواقع شركة مطاعم الناضج.
عربي بالكامل، اتجاه من اليمين إلى اليسار، ومتجاوب مع الجوال والتابلت وسطح المكتب.

---

## 1. نظرة عامة على البنية

| الطبقة | التقنية | ملاحظات |
|---|---|---|
| الواجهة | Next.js 15 (App Router) + TypeScript + Tailwind | تصدير ثابت `output: "export"` — بلا خادم Node، فلا مسار لتسريب الأسرار |
| قاعدة البيانات | Supabase PostgreSQL | RLS مفعّلة على كل جدول في `public` |
| المصادقة | Supabase Auth — رقم جوال + كلمة مرور | بلا OTP وبلا رسائل SMS (الباقة المجانية) |
| المرفقات | Supabase Storage — مخزن خاص | روابط موقّعة 60 ثانية فقط |
| الواجهة البرمجية | Supabase Edge Function باسم `procurement-portal` | JSON فقط — **لا تخدم HTML** |

### لماذا لا تُستضاف الواجهة على Edge Function؟

جُرِّب ذلك سابقًا وفشل: الخادم يعيد الصفحة بنوع `text/plain` مع سياسة CSP
تمنع تشغيل JavaScript. لذلك الواجهة تُنشر على استضافة Frontend مستقلة،
وتبقى Edge Functions للواجهات البرمجية وخدمات الخلفية فقط.

### تسجيل الدخول برقم الجوال دون تكلفة

يُطبَّع رقم الجوال إلى الصيغة الموحدة `9665XXXXXXXX`، ثم يُشتق منه بريد
داخلي غير قابل للتوجيه `9665XXXXXXXX@phone.alnadeg.local` يُستخدم مع
`signInWithPassword`. النتيجة: دخول برقم الجوال، بجلسات Supabase الأصلية،
دون أي رسالة SMS وبتكلفة صفر.

---

## 2. الشاشات (13)

1. تسجيل الدخول — `/login`
2. تفعيل حساب المدير — `/activate?token=…`
3. تغيير كلمة المرور — `/change-password`
4. لوحة المتابعة — `/dashboard`
5. إنشاء طلب شراء — `/requests/new`
6. قائمة الطلبات — `/requests`
7. تفاصيل الطلب — `/request?id=…`
8. صندوق الاعتمادات — `/approvals`
9. إدارة المستخدمين — `/admin/users`
10. إدارة المواقع — `/admin/locations`
11. سجل التدقيق — `/admin/audit`
12. التقارير — `/reports`
13. الملف الشخصي — `/profile`

---

## 3. الأدوار ومسار الاعتماد

| الكود | المسمى | النطاق | المرحلة |
|---|---|---|---|
| `super_admin` | مدير النظام | كل المواقع | تجاوز مُسجَّل |
| `requester` | مقدم طلب شراء | موقعه | — |
| `production_officer` | مسؤول الإنتاج | موقعه | 1 |
| `branch_manager` | مدير الفرع | فرعه | 2 |
| `production_manager` | مدير الإنتاج | كل المواقع | 3 |
| `procurement` | إدارة المشتريات | كل المواقع | 4 |
| `finance` | الإدارة المالية | كل المواقع | 5 |

مسار الاعتماد: **مسؤول الإنتاج ← مدير الفرع ← مدير الإنتاج ← المشتريات ← المالية**

الحالات الإحدى عشرة: مسودة، مرسل، بانتظار كل مرحلة من المراحل الخمس،
معاد للتعديل، مرفوض، مكتمل، ملغى.

**قاعدتان لا تُخترقان:**
- لا إقفال مالي قبل إرفاق مستند إدخال الفاتورة في ERP.
- لا تجاوز للمراحل إلا لمدير النظام، مع سبب إلزامي يُسجَّل في سجل التدقيق.

---

## 4. التشغيل المحلي

```bash
npm install
cp .env.example .env.local     # ثم املأ القيم
npm run dev                    # http://localhost:3000
```

### الأوامر

| الأمر | الوظيفة |
|---|---|
| `npm run dev` | خادم التطوير |
| `npm run build` | بناء وتصدير ثابت إلى `out/` |
| `npm run typecheck` | فحص الأنواع |
| `npm test` | اختبارات الوحدة (Vitest) |
| `npm run db:test` | اختبارات قاعدة البيانات على PostgreSQL محلي |
| `npm run db:inspect` | تقرير حالة قاعدة البيانات الحيّة |
| `npm run verify` | فحص الأنواع + الاختبارات + البناء |
| `npm run activation:create` | توليد رابط تفعيل مدير النظام |
| `npm run acceptance` | تشغيل اختبارات القبول الـ25 |

---

## 5. النشر

### 5.1 قاعدة البيانات

**افحص أولاً** (مهم — الهجرات تراكمية ولا تحذف شيئًا، لكن معرفة الوضع القائم ضرورية):

```bash
DATABASE_URL="postgresql://postgres:<pw>@db.wdtylpgeyjuetarwtbev.supabase.co:5432/postgres" \
  ./scripts/inspect-schema.sh > schema-before.txt
```

ثم طبّق الهجرات بالترتيب:

```bash
npx supabase link --project-ref wdtylpgeyjuetarwtbev
npx supabase db push
```

أو نفّذ ملفات `supabase/migrations/*.sql` بالترتيب في SQL Editor.

الهجرات الخمس:

| الملف | المحتوى |
|---|---|
| `…090000_core_schema.sql` | الجداول والقيود والفهارس والمشغّلات |
| `…090100_functions.sql` | الدوال الأمنية ومحرك الاعتماد |
| `…090200_rls.sql` | سياسات RLS وسياسات المخزن |
| `…090300_seed_reference.sql` | المواقع الـ27 والقوائم المرجعية |
| `…090400_admin_functions.sql` | التفعيل وتحديد المعدل وأغلفة مفتاح الخدمة |

كلها **قابلة لإعادة التشغيل** دون تكرار أو فقد بيانات.

### 5.2 Edge Function

```bash
npx supabase secrets set ALLOWED_ORIGINS="https://<your-app>.vercel.app"
npx supabase functions deploy procurement-portal --no-verify-jwt
```

`--no-verify-jwt` ضروري لأن مسارَي التفعيل عامان بطبيعتهما؛ التحقق من
الهوية يتم داخل الدالة لكل مسار على حدة.

> `SUPABASE_URL` و `SUPABASE_SERVICE_ROLE_KEY` تُحقن تلقائيًا في بيئة
> Edge Functions — لا تضبطهما يدويًا ولا تضعهما في أي ملف.

### 5.3 الواجهة

المخرجات ثابتة في `out/`، فتعمل على أي استضافة مجانية:

**Vercel** (موصى به):
```bash
npx vercel --prod
```
اضبط في لوحة Vercel: `NEXT_PUBLIC_SUPABASE_URL` و `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

**Netlify**: أمر البناء `npm run build`، مجلد النشر `out`.
**Cloudflare Pages**: نفس الإعدادات.

بعد النشر، حدّث `ALLOWED_ORIGINS` بالنطاق الفعلي وأعد نشر الدالة.

### 5.4 إنشاء أول مدير نظام

```bash
SUPABASE_URL=https://wdtylpgeyjuetarwtbev.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
APP_BASE_URL=https://<your-app>.vercel.app \
node scripts/create-activation-link.mjs --phone 0559847714 --name "محمد صالح باعمر"
```

يطبع رابطًا صالحًا 24 ساعة يُستخدم مرة واحدة. افتحه واختر كلمة المرور
داخل الصفحة.

**لا كلمة مرور افتراضية في الكود ولا في المستودع.** الرمز نفسه غير مخزَّن
في قاعدة البيانات — هاش SHA-256 فقط. إنشاء رابط جديد يُبطل السابق تلقائيًا.

---

## 6. الأمان

- RLS مفعّلة على كل جدول في `public`، ولا سياسة تكتفي بـ `TO authenticated`
  دون شرط صلاحية حقيقي.
- كل سياسات `UPDATE` تحتوي `USING` و `WITH CHECK`.
- الدور `anon` ممنوع من كل الجداول — لا شاشة تعمل بلا تسجيل دخول.
- الدوال الحساسة في سكيما `app` غير المكشوفة، بـ `search_path` مثبّت،
  وصلاحية التنفيذ مسحوبة من `PUBLIC`.
- الدور يُقرأ من جدول `profiles` وليس من `user_metadata` في كل قرار صلاحية.
- منع تصعيد الصلاحيات عبر مشغّل `app.guard_profile_self_update`.
- الاعتماد عملية ذرّية بقفل صف (`FOR UPDATE`) وشرط مرحلة وفهرس فريد —
  يستحيل اعتماد المرحلة نفسها مرتين.
- سجل التدقيق للقراءة فقط: صلاحيات `INSERT/UPDATE/DELETE` مسحوبة،
  و`FORCE ROW LEVEL SECURITY` مفعّلة.
- المخزن خاص، المسار `location_id/request_id/document_type/uuid.ext`،
  والتحقق من النوع والحجم يتم **على الخادم بعد الرفع** بقراءة البيانات
  الوصفية من المخزن، وأي ملف مخالف يُحذف فورًا.
- تحديد معدل على مسارات التفعيل.
- رسائل الأخطاء عربية للمستخدم، والتفاصيل التقنية في سجل الخادم فقط.

---

## 7. الاختبارات

| المجموعة | العدد | الأمر |
|---|---|---|
| اختبارات قاعدة البيانات | 94 | `npm run db:test` |
| اختبارات الوحدة | 33 | `npm test` |
| اختبارات القبول | 25 | `npm run acceptance` |

`npm run db:test` يشغّل PostgreSQL محليًا، يطبّق الهجرات مرتين (لإثبات
عدم التكرار)، ثم ينفّذ سيناريوهات كاملة تحت سياسات RLS الحقيقية.

`npm run acceptance` يعمل على البيئة الحيّة وينظّف بعده كل ما أنشأه.

---

## 8. الصيانة

### إضافة مستخدم
لوحة الأدمن ← إدارة المستخدمين ← إضافة مستخدم. تُولَّد كلمة مرور مؤقتة
تُعرض **مرة واحدة**، ويُطلب تغييرها عند أول دخول.

### إضافة فرع أو موقع
لوحة الأدمن ← إدارة المواقع ← إضافة موقع. الكود `BR-##` للفروع و`CN-##`
للمواقع المركزية. المواقع لا تُحذف — تُعطَّل.

### النسخ الاحتياطي

```bash
# نسخة كاملة
pg_dump "$DATABASE_URL" -Fc -f backup-$(date +%F).dump

# البيانات فقط
pg_dump "$DATABASE_URL" --data-only -Fc -f data-$(date +%F).dump
```

الاستعادة:
```bash
pg_restore -d "$DATABASE_URL" --clean --if-exists backup-YYYY-MM-DD.dump
```

المرفقات تُنسخ من Storage:
```bash
npx supabase storage download --recursive ss:///procurement-documents ./backup-files/
```

> الباقة المجانية توفر نسخًا يومية لـ7 أيام. للبيانات الحساسة، شغّل
> `pg_dump` أسبوعيًا واحتفظ بالنسخ خارج Supabase.

---

## 9. هيكل المشروع

```
alnadeg-procurement/
├── src/
│   ├── app/                    # الشاشات (App Router)
│   ├── components/             # مكونات الواجهة
│   ├── lib/                    # العميل، الصلاحيات، التحقق، الوصول للبيانات
│   └── types/database.ts       # أنواع مطابقة للمخطط
├── supabase/
│   ├── migrations/             # 5 هجرات تراكمية آمنة
│   ├── functions/              # Edge Function (JSON فقط)
│   ├── tests/                  # 94 اختبار قاعدة بيانات
│   └── tools/inspect-schema.sql
├── scripts/
│   ├── create-activation-link.mjs
│   ├── acceptance.mjs
│   ├── db-test.sh
│   └── inspect-schema.sh
└── tests/                      # 33 اختبار وحدة
```
