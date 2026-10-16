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
