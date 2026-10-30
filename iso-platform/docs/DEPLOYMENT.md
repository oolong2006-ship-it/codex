# DEPLOYMENT — التشغيل والبيئات والنسخ الاحتياطي

## المكونات
| المكون | الأمر | ملاحظات |
|---|---|---|
| PostgreSQL 16 | — | دوران: `iso_owner` (الهجرات) و`iso_app` (التطبيق، NOBYPASSRLS) |
| الهجرات | `npm run db:migrate` | بـ `MIGRATION_DATABASE_URL`؛ تفشل إن عُدّل ملف مطبَّق |
| الويب | `npm run build && npm start` | `DATABASE_URL` بدور `iso_app` فقط؛ `COOKIE_SECURE=true` خلف HTTPS |
| العامل | `npm run worker` | خدمة دائمة؛ يتوقف بأمان على SIGTERM |
| Chromium | `npx playwright-core install --with-deps chromium` أو `CHROMIUM_PATH` | مطلوب لتصدير PDF/ZIP في خادم الويب والعامل (ليس serverless edge) |

## متغيرات البيئة
انظر `.env.example`. الأسرار (كلمات مرور قاعدة البيانات، `ANTHROPIC_API_KEY`) في مدير أسرار المنصة السحابية، لا في المستودع.

## البيئات
local (هذه البيئة) → CI (GitHub Actions: `iso-platform-ci.yml`) → staging → production. **لا نشر إنتاجي قبل D-02 وموافقة المؤسس.**

## النسخ الاحتياطي والاستعادة (مخطط P5)
- نسخ Postgres المُدار اليومية + PITR لمدة 7–30 يوماً.
- اختبار استعادة شهري موثق: استعادة إلى قاعدة مؤقتة، تشغيل `npm test` على نسخة البيانات المستعادة (العزل والسلامة)، تسجيل زمن الاستعادة.
- تصدير بيانات مستأجر واحد عند الطلب (PDPL).

## المراقبة (مخطط P5)
سجلات منظمة، مقاييس نجاح المهام (`jobs` حسب الحالة)، تكلفة AI (`model_runs`)، تنبيهات على المهام DEAD ومحاولات الدخول الفاشلة.

## نشر تجريبي على Render (رابط عرض)

> بيئة عرض فقط: منطقة فرانكفورت (خارج المملكة)، خطة مجانية. لا تُدخل بيانات عملاء حقيقية (PDPL). الإنتاج يتطلب قرار D-02.

### الخطوات (مرة واحدة)
1. أنشئ حساباً على render.com وسجّل الدخول بحساب GitHub.
2. اسمح لـ Render بالوصول إلى المستودع `oolong2006-ship-it/codex`.
3. من لوحة Render: **New → Blueprint** → اختر المستودع، والفرع `claude/global-iso-platform-p0-p1`، وملف `render.yaml`.
4. اضغط **Apply**. ينشئ Render قاعدة PostgreSQL وخدمة الويب، ويولّد `APP_DB_PASSWORD` تلقائياً.
5. انتظر انتهاء البناء (5–10 دقائق أول مرة). الرابط يظهر أعلى صفحة الخدمة بصيغة `https://iso-platform-xxxx.onrender.com`.
6. افتح الرابط → «ابدأ التشخيص المجاني» → سجّل حساباً.

### ما يحدث عند كل تشغيل (`scripts/start.ts`)
- ينشئ دور التطبيق المقيد `iso_app` (NOBYPASSRLS) إن لم يكن موجوداً، ويرفض التشغيل إن أمكنه تجاوز RLS.
- يطبّق الهجرات بدور مالك قاعدة البيانات.
- يشغّل الموقع متصلاً بدور `iso_app` فقط.
- تم التحقق محلياً على عنقود PostgreSQL جديد بمالك غير مميز يملك CREATEROLE فقط: 42/42 فحص متصفح.

### إن فشل التشغيل برسالة «cannot create/alter role iso_app»
افتح **Shell/psql** لقاعدة البيانات في Render ونفّذ (بقيمة `APP_DB_PASSWORD` من متغيرات الخدمة):
```sql
CREATE ROLE iso_app LOGIN PASSWORD '<APP_DB_PASSWORD>' NOBYPASSRLS;
```
ثم **Manual Deploy → Deploy latest commit**.

### حدود الخطة المجانية
- الخدمة تتوقف بعد خمول، وأول طلب بعدها يستغرق قرابة دقيقة.
- ذاكرة 512MB: تصدير ZIP كبير بملفات PDF قد يكون بطيئاً؛ استخدم «ZIP بدون PDF».
- قاعدة البيانات المجانية محدودة المدة لدى Render — راجع شروطهم الحالية.
- لا عامل خلفي مستقل: المهام تُنفذ داخل خادم الويب بعد الاستجابة.
