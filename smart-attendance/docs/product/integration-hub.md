# Integration Hub — تصميم طبقة الربط مع أنظمة HR والرواتب وERP

> الحالة: **مسودة تصميم — بانتظار الاعتماد**. لا شيفرة إنتاجية. لا يغيّر أي قرار في CLAUDE.md §3.
> المراجع الملزمة: `CLAUDE.md` (§2، §3، §5.8، §5.9)، `docs/specs.md` (§D، §F)، `docs/backlog.md` (BL-05، BL-11، BL-18، BL-19)، `docs/research/ksa-requirements.md` (§2 P5، §4 W1–W3)، `prompts/phase-3-operations.md` (البنود 6–9).
> المالك: مهندس التكاملات. تاريخ الإعداد والتحقق: **2026-10-26**.

## 0. منهج التحقق (اقرأه قبل الاعتماد على جدول الموصلات)

- **المصدر المقبول:** توثيق المزوّد الرسمي فقط (نطاقه، أو بوابة مطوريه، أو مركز مساعدته). لا مدونات طرف ثالث ولا مواقع مقارنة.
- **طريقة الوصول:** الجلب المباشر (WebFetch/curl) ممنوع في بيئة التنفيذ (البروكسي يرد 403). تم التحقق عبر **WebSearch مقيدًا بـ `allowed_domains`** على النطاق الرسمي لكل مزوّد: `jisr.net`، `zenhr.com`، `bayzat.com`، `palmhr.net`، `odoo.com`، `zoho.com`، `help.sap.com`/`api.sap.com`، `docs.oracle.com`، `learn.microsoft.com`، `workday.com`/`community.workday.com`/`doc.workday.com`، `developers.google.com`، `mudad.com.sa` — أي من **نسخة الفهرس** لتلك الصفحات في 2026-10-26.
- **الأثر:** لم تُقرأ الصفحات كاملة، ولا مخططات OpenAPI نفسها. كل خانة «مؤكد» تعني أن صفحة رسمية تذكر القدرة، لا أننا جرّبناها. **قبل بناء أي موصل** يُفتح الرابط يدويًا ويُجرَّب في sandbox المزوّد، ويبقى الموصل `Blocked` حتى يُختبر بمفاتيح حقيقية (CLAUDE.md §5.8).
- **القاعدة 9:** لا نصف أي موصل بأنه «تكامل رسمي» أو «شريك معتمد» ما لم يوقّع المزوّد اتفاقية شراكة أو يدرجنا في سوقه. التسمية التسويقية المسموحة: «موصل مبني على API العامة لـ X».

---

## 1. المبادئ الحاكمة

1. **مصدر الحقيقة لكل كيان محدد صراحةً لكل عميل** (system of record): الحضور والقرارات والجلسات **عندنا دائمًا**؛ الموظف والهيكل والإجازات **عند نظام HR** متى رُبط، وعندنا فقط إن لم يُربط شيء. لا مزامنة ثنائية الاتجاه على الحقل نفسه.
2. **نحن لا نحسب أجرًا ولا نكتب في الرواتب** (CLAUDE.md §2). نُصدّر ساعات وحالات؛ نظام الرواتب يحسب.
3. **الأحداث الأصلية append-only تمتد للخارج:** لا نرسل «تعديل حدث»؛ نرسل `attendance.adjusted` مرتبطًا بالحدث الأصلي، والطرف الآخر يعيد بناء السطر.
4. **أقل بيانات ممكنة خارج المنصة:** لا إحداثيات ولا عينات موقع ولا معرفات أجهزة ولا assertions في أي Webhook أو تصدير افتراضي (امتداد لـ T-25).
5. **Integration Hub وحدة داخل الـ Modular Monolith** (`apps/api/src/modules/integrations`) وعمّاله على BullMQ — لا خدمة منفصلة (CLAUDE.md §3).
6. **كل موصل خارجي = Adapter + Fake** ويُوسم `Blocked` حتى يُختبر بحساب حقيقي (§5.8).

---

## 2. النموذج القانوني (Canonical Model) — `sa.canonical/v1`

### 2.1 قواعد عامة
- المعرّف الداخلي `id` (UUID) هو المرجع الوحيد داخل المنصة وثابت مدى الحياة. لا يُستخدم أي معرّف خارجي كمفتاح أساسي.
- كل كيان قابل للتبادل يحمل `external_refs[]`:
  ```json
  { "system": "jisr|zenhr|odoo|sap_sf|entra|scim|file|…", "connection_id": "con_…",
    "id": "88213", "id_type": "employee_id|personIdExternal|userName|…",
    "linked_at": "ISO8601", "source": "match|import|scim|manual" }
  ```
  قيد فريد: `(tenant_id, connection_id, entity_type, external_id)`. يجوز لكيان واحد أكثر من مرجع (نظام HR + Entra ID).
- كل كيان يحمل `version` (عدّاد يزيد مع كل تغيير) و`updated_at`؛ يُستخدم للترتيب ومنع الكتابة القديمة (optimistic concurrency، `If-Match`).
- الأوقات بـ UTC (ISO8601) + `tz` للموقع (`Asia/Riyadh`)، و`business_date` (يوم بداية الوردية — US-16) كحقل منفصل.
- المدد بالدقائق الصحيحة (`*_min`)، لا بالساعات العشرية، لتفادي أخطاء التقريب في الرواتب.

### 2.2 الكيانات

| الكيان | الحقول القانونية (مختصرة) | مصدر الحقيقة | الاتجاه |
|---|---|---|---|
| **Employee** | `id`، `employee_number` (فريد لكل عميل)، `name_ar`، `name_en`، `email`، `mobile`، `status: ACTIVE\|INACTIVE`، `hire_date`، `termination_date`، `home_branch_id`، `groups[]`، `ramadan_reduction_eligible` (ksa L2)، `external_refs[]` | HR أو SCIM إن رُبط؛ وإلا نحن | وارد غالبًا |
| **Branch / Site** | Branch: `id`، `code`، `name_ar/en`، `cost_center_code?`. Site: `id`، `branch_id`، `code`، `name`، `geofence_version_id` (الإحداثيات **لا** تُصدَّر افتراضيًا) | نحن (الفرع قد يُستورد كرمز) | وارد للرمز، صادر للقائمة |
| **ShiftAssignment** | `id`، `employee_id`، `site_id`، `template_code`، `start_local`، `end_local`، `days[]`، `effective_from`، `effective_to`، `policy_version_id` | نحن (المرحلة 3: يجوز استيراده) | صادر؛ وارد اختياري |
| **AttendanceEvent** | `id` (= `event_id`)، `employee_id`، `type`، `server_time`، `client_time`، `site_id`، `offline`، `source: mobile` | نحن (append-only) | صادر فقط |
| **Decision** | `event_id`، `decision`، `reasons[]` (codes فقط)، `signals[]` (codes فقط)، `policy_version_id`، `engine_version`، `decided_at` | نحن | صادر فقط |
| **Adjustment** | `id`، `target: event_id\|session_id`، `kind`، `reason`، `approved_by`، `approved_at` | نحن | صادر فقط |
| **Session / TimesheetLine** | `id`، `employee_id`، `business_date`، `site_id`، `in_event_id`، `out_event_id`، `in_at`، `out_at`، `worked_min`، `late_min`، `early_leave_min`، `status: VERIFIED\|PENDING\|INCOMPLETE\|ABSENT\|ON_LEAVE`، `adjustment_ids[]`، `period_id`، `line_hash` | نحن (يُعاد بناؤه — T-19b) | صادر فقط |
| **Exception** | `id`، `employee_id`، `event_id?`، `type: REVIEW\|CORRECTION`، `status: OPEN\|APPROVED\|REJECTED`، `resolved_by`، `resolved_at`، `resolution_code` | نحن | صادر فقط |
| **Leave (مرجع)** | `id`، `employee_id`، `leave_type_code`، `start_date`، `end_date`، `partial_day_min?`، `status: APPROVED\|CANCELLED`، `external_refs[]` | **نظام HR فقط** (BL-19) | وارد فقط |
| **PayrollPeriod** | `id`، `code` (مثل `2026-10`)، `start_date`، `end_date`، `status: OPEN\|LOCKED\|EXPORTED`، `locked_at`، `export_batches[]` | نحن | صادر |

- **`line_hash`**: SHA-256 لحقول السطر القانونية؛ يتيح للطرف الآخر معرفة هل تغيّر السطر دون مقارنة كل حقل، ويثبت أن ما صُدّر بعد `LOCKED` هو ما أُقفل.
- **Leave لا يُنشئ ولا يحذف حدثًا**؛ يغيّر فقط حالة السطر إلى `ON_LEAVE` عند إعادة البناء.
- المخطط يُنشر كـ JSON Schema داخل OpenAPI 3.1 (`components.schemas`) ويُختبر بعقد (contract tests) في CI.

---

## 3. طبقات الربط (بالترتيب)

### 3.0 العمود الفقري المشترك: Transactional Outbox
كل تغيير على كيان قابل للتبادل يكتب، **في المعاملة نفسها**، صفًا في `integration_outbox (tenant_id, id, type, entity_type, entity_id, entity_version, payload_ref, created_at)`. عامل BullMQ يقرأ الصفوف بالترتيب ويوزعها على: Webhooks، ومهام الموصلات، وسجل المزامنة. النتيجة:
- **لا حدث مفقود** إن فشل الإرسال بعد الـ commit، و**لا حدث شبح** إن فشلت المعاملة.
- **التسليم at-least-once** (لا ندّعي exactly-once). كل رسالة تحمل `id` ثابتًا يستخدمه المستهلك لإزالة التكرار.
- **الترتيب** مضمون **لكل كيان** فقط عبر `sequence = {entity, seq}` (= `entity_version`)، لا ترتيب عام. المستهلك يتجاهل أي `seq` أقل مما طبّقه.
- **Backfill/Replay**: بما أن الأحداث والجلسات تُعاد بناؤها، يمكن توليد رسائل لفترة ماضية من الحالة الحالية (`snapshot`) بدل إعادة تشغيل الـ outbox القديم. الـ outbox يُحتفظ به 30 يومًا (قيمة سياسة).
- العزل: `tenant_id` + RLS على `integration_outbox` وكل جداول الوحدة، والعامل يضبط `app.tenant_id` لكل رسالة قبل أي قراءة.

### (أ) REST API عامة + OpenAPI 3.1
- **متى:** أي تكامل يبنيه العميل أو شريك؛ وهي الأساس الذي تقوم عليه بقية الطبقات (الموصلات وiPaaS تستهلكها داخليًا أو خارجيًا).
- **المصادقة:** (1) **OAuth2 client credentials** (الافتراضي، token قصير ≤ 15 دقيقة، JWT موقّع يملكه الـ Backend — ينسجم مع «Auth يملكها الـ Backend»)؛ (2) مفاتيح API للعملاء الصغار بصيغة `sa_live_<prefix>_<secret>` تُخزَّن hash (argon2id) ويُعرض السر مرة واحدة. كلاهما **مقيد بالنطاق** و**بفروع محددة اختياريًا** (يحاكي نطاق مدير الفرع — T-22).
- **النطاقات:** `employees:read|write`، `sites:read`، `shifts:read|write`، `attendance:read`، `timesheets:read`، `exceptions:read`، `leaves:write`، `periods:read`، `webhooks:manage`. **لا** نطاق يكتب أحداث بصمة: البصمة تأتي من جهاز مربوط فقط (specs §C، F6). **لا** نطاق `evidence:read` في الإصدار الأول.
- **الاتساق:** `Idempotency-Key` إلزامي لكل POST/PUT (24 ساعة، نفس آلية specs §D)؛ `If-Match: <version>` للتحديث؛ ترقيم بـ cursor ثابت (`?updated_since=&cursor=`) لا offset؛ endpoint `GET /v1/changes?since=<cursor>` كبديل pull عن الـ webhooks.
- **الإصدارات:** المسار `/v1` + رأس `Api-Version: YYYY-MM-DD` للتغييرات غير الكاسرة؛ سياسة إيقاف ≥ 12 شهرًا مع رأس `Deprecation`/`Sunset`.
- **حدود المعدل:** لكل عميل ولكل مفتاح، ورد `429` مع `Retry-After`. الأرقام سياسة تشغيل، لا كود.
- **المرحلة:** 3 (BL-11).

### (ب) Webhooks موقعة HMAC
- **متى:** إشعار لحظي للطرف الآخر بحدث (قرار، إقفال فترة). الحمولة **رفيعة** (معرّفات + ملخص)، والتفاصيل تُجلب عبر REST — يقلل تسرب البيانات ويجعل الإعادة آمنة.
- **التوقيع:** على نمط Standard Webhooks: الرؤوس `webhook-id`، `webhook-timestamp` (ثوانٍ Unix)، `webhook-signature: v1,<base64(HMAC-SHA256(secret, id + "." + timestamp + "." + raw_body))>`. المستقبل يرفض فرقًا > 5 دقائق (سياسة) ويقارن بزمن ثابت. **تدوير السر** بفترة تداخل يُرسل خلالها توقيعان.
- **Retry:** تراجع أسي مع jitter (مثلًا: 1د، 5د، 30د، 2س، 6س، 12س، 24س — سياسة)، ثم **dead-letter** ويُعطَّل الاشتراك تلقائيًا بعد فشل متصل 72 ساعة مع بريد للمسؤول.
- **Replay:** من سجل المزامنة: إعادة رسالة واحدة، أو كل رسائل اشتراك لفترة، بالـ `webhook-id` نفسه (لكي يزيل المستقبل التكرار).
- **أمن الوجهة:** HTTPS فقط؛ منع العناوين الخاصة وmetadata IPs (SSRF) بعد حل DNS؛ timeout 10 ثوانٍ؛ لا متابعة redirects.
- **المرحلة:** 3 (`prompts/phase-3-operations.md` البند 8).

### (ج) SCIM 2.0 لتزويد الموظفين
- **متى:** العميل الذي يدير الهويات في Microsoft Entra ID (أو أي IdP يدعم SCIM) ويريد إنشاء/إيقاف الموظفين تلقائيًا. يكمّل SSO (BL-18).
- **النطاق:** `/scim/v2/Users` (+ امتداد Enterprise User لـ `employeeNumber` و`department`)، `/Groups` اختياري ويُعيَّن لمجموعات الموظفين، `/ServiceProviderConfig`، `/Schemas`، `/ResourceTypes`. Microsoft تذكر أن schema discovery غير مدعوم للتطبيقات المخصصة خارج المعرض، فنعتمد تعيين السمات يدويًا في Entra.
- **الاتساق:** `externalId` ↔ `external_refs`؛ `active=false` → `INACTIVE` (يرفض البصمة `ACCOUNT_INACTIVE`) و**لا حذف** (السجلات نظامية — ksa L12)؛ `DELETE` يُعامل كإيقاف. SCIM لا يمس ربط الأجهزة إطلاقًا (لا مسار يفعّل جهازًا — F6).
- **المصادقة:** token مخصص لكل عميل؛ وللإدراج في معرض Entra لاحقًا تشترط Microsoft OAuth 2.0 client credentials أو workload identity federation ولا تقبل bearer طويل العمر — نصمم لذلك من البداية.
- **تعارض المصادر:** إن فُعّل SCIM يصبح هو مصدر حقيقة الموظف، ويُقفل التعديل اليدوي لحقوله في لوحة الإدارة، ويُمنع موصل HR من الكتابة على الحقول نفسها.
- **المرحلة:** 3 مع SSO.

### (د) ملفات مجدولة CSV / XLSX / SFTP
- **متى:** الأنظمة دون API أو العملاء الذين يفضلون الملفات (أغلب أنظمة الرواتب المحلية، ومُدد بشكل غير مباشر).
- **القوالب:** «قالب تعيين» لكل عميل: الأعمدة، والترتيب، والتسميات، وصيغ التاريخ/الوقت، والترميز (UTF-8 BOM — T-24)، وتحويل القيم (مثل `ABSENT → غ`)، والتجميع (سطر لكل يوم أو لكل موظف/فترة). القالب له إصدار، وكل ملف يحمل رقم إصدار القالب.
- **الصادر:** عند `period.locked` أو بجدول. SFTP **نحن العميل** (نرفع إلى خادم العميل) بمفتاح SSH مخصص لكل اتصال، أو تنزيل من اللوحة. اسم الملف حتمي: `<tenant>_<period>_<template>_v<n>_<batch>.csv` + ملف `.sha256`.
- **الوارد:** موظفون وإجازات (BL-19) بالقاعدة نفسها لـ T-06: تُطبق الصفوف الصحيحة فقط، وتقرير أخطاء بالسطر والسبب. الاستيراد idempotent بمفتاح `(file_sha256, row_number)`.
- **مُدد:** **لا نولد ملف حماية أجور** (يحتاج رواتب وIBAN — ksa W2). نوفر قالب «ساعات وغياب» قابلًا للتعيين ليستورده نظام الرواتب الذي يولد ملف مُدد. أي قالب مُدد خاص يبقى `Blocked` حتى نحصل على القالب من حساب منشأة (ksa W3، BL-05).
- **المرحلة:** التصدير العام موجود في المرحلة 2 (US-22)؛ قوالب التعيين وSFTP والاستيراد المجدول في المرحلة 3.

### (هـ) Connector SDK وموصلات مبنية مسبقًا
- **متى:** أنظمة HR ذات API عامة موثقة وعليها طلب مثبت من عملاء (مقابلات/مبيعات).
- **الشكل:** حزمة داخلية `packages/connectors` (لا SDK علني يشغّل شيفرة طرف ثالث على خوادمنا). كل موصل يطبّق عقدًا واحدًا:
  `capabilities()`، `authenticate()`، `pullEmployees(cursor)`، `pullLeaves(range, cursor)`، `pushTimesheet(period, lines)`، `pushAttendanceEvents(events)` (إن دعمه الطرف)، `mapError(e) → {retryable, code, message_ar/en}`.
  مع `Fake` لكل موصل وcontract tests مشتركة.
- **الاتساق:** كل استدعاء كتابة يحمل مفتاح idempotency مشتقًا (`connection_id + entity_id + entity_version`)، وإن لم يدعمه الطرف نخزن معرّف السجل المنشأ عنده في `external_refs` ونستخدم upsert. معدل الطلبات يُضبط لكل موصل وفق حدود المزوّد (مثل Zoho bulk import: 10 طلبات ثم قفل 5 دقائق — وفق توثيقه).
- **الأسرار:** OAuth tokens وAPI keys للطرف الآخر مشفرة بمفتاح لكل عميل (envelope encryption عبر KMS داخل المنطقة)، ولا تظهر في السجلات أو الواجهة بعد الحفظ.
- **المرحلة:** 3 لأول موصلين (P1)، والبقية 4+.

### (و) iPaaS (Zapier / Make / Power Automate / n8n)
- **التقييم:** مناسب **لاحقًا** وبشكل محدود. REST + Webhooks + OAuth2 تكفي لاستخدام وحدات HTTP العامة في هذه المنصات دون تطبيق مخصص. نشر «تطبيق رسمي» في كل منصة يتطلب برنامج مطورين لدى كل منها **لم يُتحقق منه** في هذا البحث.
- **تحفّظ PDPL:** مواقع معالجة البيانات لهذه المنصات **غير متحقق منها**؛ أي تدفق عبرها قد يكون نقلًا خارج المملكة (م 29) يقرره العميل كمتحكم. n8n يُذكر أنه قابل للاستضافة الذاتية (غير متحقق هنا) وقد يكون الخيار الأقل خطرًا.
- **المرحلة:** 4+، وبعد ADR النقل خارج المملكة (§8).

---

## 4. الموصلات ذات الأولوية

الأعمدة: **API عامة موثقة؟** = هل وجدنا توثيقًا رسميًا منشورًا للـ API. «جزئي» = المزوّد يعلن API لكن لم نجد مرجع endpoints. القراءة/الكتابة تخص ما ذكره التوثيق في نتائج البحث فقط. **تاريخ التحقق لكل الصفوف: 2026-10-26** (عبر نسخة الفهرس — §0).

| # | النظام | API عامة موثقة؟ | المصادقة | قراءة | كتابة | التوثيق الرسمي | الأولوية |
|---|---|---|---|---|---|---|---|
| C1 | **Jisr** | نعم — OpenAPI (OAS 3.0، v1.0.0) فيها أقسام: Authentication، Employees، Attendance، Attendance Log، Employee Leave، Webhooks، Audit events | قسم Authentication موجود؛ **النوع غير مؤكد** | موظفون، إجازات (من عناوين الأقسام) | حضور: قسم موجود، **دلالة الكتابة غير مؤكدة** | https://openapi.jisr.net/index.html | **P1** |
| C2 | **ZenHR** | نعم — دليل OAuth حالي + دليل JWT قديم (2019) لـ branches/employees/salaries | OAuth 2.0 authorization code + refresh (الحالي)؛ JWT HS256 (قديم، حد 500 طلب/يوم وفق الصفحة القديمة) | فروع، موظفون (الدليل القديم) | حضور وإجازات: **غير مؤكد** | https://zenhr.com/en/api-documentation ؛ https://developers.zenhr.com/2019/04/29/api-documentation.html | **P1** |
| C3 | **Odoo** | نعم — External JSON-2 API (19.0) + External RPC API (يُزال في Odoo 22 / Online 21.1) | API key كـ Bearer؛ صلاحية المفتاح ≤ 3 أشهر (تدوير إلزامي) | موظفون (`hr.employee`) عبر ORM العام | `hr.attendance` عبر ORM العام: **غير مؤكد في توثيق رسمي** (مصدره منتدى) | https://www.odoo.com/documentation/19.0/developer/reference/external_api.html | **P1** |
| C4 | **Microsoft Entra ID** | نعم — SCIM provisioning + OIDC | نحن نستقبل: bearer/OAuth2 client credentials (للمعرض) | — (هو يرسل لنا) | موظفون → عندنا عبر SCIM | https://learn.microsoft.com/en-us/entra/identity/app-provisioning/use-scim-to-provision-users-and-groups ؛ https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/app-gallery-user-provisioning-requirements | **P1** (مع SSO) |
| C5 | **Zoho People** | نعم — Attendance Check-in/out، Bulk Import، Entries، Shift details | OAuth 2.0 (Zoho Accounts بحسب مركز البيانات)؛ scope `ZOHOPEOPLE.attendance.CREATE` (وتسمية أخرى في دليل البيومتري — تعارض) | ورديات، سجلات حضور | حضور (check-in/out، bulk) | https://www.zoho.com/people/api/attendance-bulkimport.html ؛ https://www.zoho.com/people/api/oauth-steps.html | **P2** |
| C6 | **SAP SuccessFactors** | نعم — EC OData v2 (PerPerson، EmpJob، EmployeeTime) + Clock In Clock Out OData v4 (تصدير) + REST للأحداث بالجملة (إصدارات 2026) | Bearer (OAuth)؛ صلاحية «Allow Clock In Clock Out Integration» | موظفون، إجازات (`EmployeeTime`)، أحداث الوقت | أحداث Clock In/Out بالجملة (POST)؛ **مخطط الحمولة غير مؤكد** | https://help.sap.com/docs/successfactors-platform/sap-successfactors-api-reference-guide-odata-v2/employeetime ؛ https://help.sap.com/docs/successfactors-platform/sap-successfactors-api-reference-guide-odata-v2/exporting-time-events | **P2** |
| C7 | **Palm HR (palm.hr)** | **جزئي** — يعلن REST APIs ومفاتيح بنطاقات (خطة Professional)؛ مرجع endpoints لم يُعثر عليه | API keys بنطاقات | غير مؤكد | غير مؤكد | https://palmhr.net/en/integrations ؛ https://palmhr.net/en/pricing | **P2** (بعد طلب توثيق) |
| C8 | **Oracle HCM Cloud** | نعم — REST `timeRecordEventRequests` (ينشئ time card إن لم توجد)، `timeEventRequests`، `webClockEvents` | **غير مؤكد** في نتائج البحث | أحداث الوقت | إدخالات وقت (بعض صفحات 20B تذكر controlled availability) | https://docs.oracle.com/en/cloud/saas/human-resources/farws/Creating_Time_Entries.html ؛ https://docs.oracle.com/en/cloud/saas/human-resources/farws/rest-endpoints.html | **P3** |
| C9 | **Microsoft Dynamics 365 HR** | نعم — جداول Dataverse (`cdm_worker`…) + virtual tables + DMF | Dataverse Web API (Entra ID)؛ التفاصيل غير مؤكدة | موظفون | حضور/وقت: **غير مؤكد** | https://learn.microsoft.com/en-us/dynamics365/human-resources/hr-developer-entities ؛ https://learn.microsoft.com/hr-hr/dynamics365/human-resources/hr-admin-integration-choose-technology | **P3** |
| C10 | **Workday** | نعم (SOAP) — `Import_Time_Clock_Events` (دفعات كبيرة نادرة) و`Put_Time_Clock_Events` (دفعات صغيرة متكررة)؛ REST **غير مؤكد** | **غير مؤكد** | غير مؤكد | أحداث ساعة الوقت (In/Out/Break/Meal) | https://community.workday.com/sites/default/files/file-hosting/productionapi/Time_Tracking/v29.0/Import_Time_Clock_Events.html | **P3** |
| C11 | **Google Workspace** | نعم — Admin SDK Directory API `users.list` | Service account + domain-wide delegation؛ scope `admin.directory.user` (نطلب نطاق قراءة فقط إن توفر — تحقق) | مستخدمون (لا حقول HR) | — | https://developers.google.com/workspace/admin/directory/reference/rest/v1/users/list | **P3** |
| C12 | **Bayzat** | **غير مؤكد** — صفحة رسمية تذكر «open APIs»؛ لا توثيق منشور عُثر عليه | غير مؤكد | غير مؤكد | غير مؤكد | https://www.bayzat.com/it-professionals | **P3** (عبر شراكة/طلب) |
| C13 | **مُدد** | **لا** — لم نجد API عامة؛ المنصة لرفع ملفات حماية الأجور | — | — | **تصدير ملف فقط** عبر نظام الرواتب؛ قالبنا `Blocked` (ksa W3) | https://mudad.com.sa/landing-page/compliance | **لا موصل** — قالب ملف |

**ملاحظات تؤثر على التصميم:**
- **Jisr** يوثّق خادمين: `api.jisr.net` (AWS) و`api.jisr.net.sa` (محلي) بحسب استضافة العميل. حقل `base_url` في الاتصال إلزامي ويُستنتج من نطاق العميل — وهو مدخل مباشر لتقييم النقل خارج المملكة (§7 R5).
- **Odoo:** مفاتيح ≤ 3 أشهر → الموصل يحتاج تنبيه انتهاء قبل 14 يومًا وحالة `NEEDS_REAUTH`. ومنتدى (غير رسمي) يذكر أن الـ External API غير متاح لبعض الخطط — **تحقق** قبل الوعد.
- **SAP SF:** Clock In Clock Out يتطلب تفعيل Time Tracking وTime Sheet مسبقًا، والاقتران (pairing) عندهم يرفض Stop بعد Stop → لا نرسل أحداثًا مرفوضة أو معلقة؛ نرسل **الأحداث المعتمدة فقط** أو سطور الجلسات.
- **قاعدة عامة للكتابة في أنظمة الوقت:** الافتراضي هو دفع **سطور Timesheet بعد `period.locked`**، لا الأحداث الخام لحظيًا؛ لأن قراراتنا قد تتغير بالمراجعة، وكثير من الأنظمة لا يدعم التراجع بسهولة.

**ترتيب البناء المقترح:** C4 (SCIM — يخدم أي IdP) ← C1 أو C2 (بحسب أول عميل فعلي يطلبه؛ لا نبني الاثنين قبل طلب) ← C3 ← C6/C5. الأولوية P1/P2 فرضية سوقية تُراجع بعد المقابلات (D-06) — **لا تُستخدم في التسويق**.

---

## 5. واجهة تعيين الحقول، وSandbox، وسجل المزامنة

### 5.1 معالج الاتصال (Admin Web → «التكاملات»)
1. اختيار النظام → المصادقة (OAuth redirect أو لصق مفتاح) → **اختبار اتصال حقيقي** (لا نجاح وهمي — §5.6).
2. **إعلان موقع البيانات:** المسؤول يختار منطقة استضافة الطرف الآخر (داخل المملكة / خارجها / غير معروف) ويقرّ بالمسؤولية إن كانت خارجها (§7 R5).
3. **مصدر الحقيقة** لكل كيان (موظفون، فروع، إجازات): «النظام الخارجي» أو «Smart Attendance».
4. **مطابقة السجلات الحالية** (first link): بالمفتاح المختار (`employee_number` افتراضيًا، أو البريد، أو الجوال). الشاشة تعرض: مطابق / جديد هناك / جديد هنا / تعارض — ولا يُطبق شيء قبل «اعتماد».
5. **تعيين الحقول:** جدول «حقلنا القانوني ← حقلهم» مع تحويلات معرفة مسبقًا فقط (تنسيق تاريخ، جدول قيم، دمج اسمين، قيمة ثابتة، تقريب للدقائق) — **لا تعابير برمجية حرة**. معاينة على 5 سجلات حقيقية قبل الحفظ.
6. تعيين القيم المرجعية: الفروع ↔ أقسامهم/مواقعهم، أنواع الإجازة ↔ `leave_type_code`، الحالات ↔ رموزهم.
7. الجدولة والاتجاه، ثم **تشغيل تجريبي (dry run)** يعرض ما سيُكتب دون كتابة.
- كل تغيير في التعيين يُنشئ إصدارًا جديدًا ويُسجل في `audit_logs` (before/after).

### 5.2 Sandbox للمطورين
- لكل عميل مستأجر **sandbox** منفصل (`tenant_kind = SANDBOX`) ببيانات `seed` اصطناعية (CLAUDE.md §5.7 — لا بيانات حقيقية)، ومفاتيح `sa_test_…` لا تعمل على الإنتاج والعكس.
- محاكي أحداث: زر/endpoint `POST /v1/sandbox/simulate` يولد `attendance.decided` و`period.locked`… لاختبار المستقبل دون هواتف.
- OpenAPI 3.1 منشور مع أمثلة، وأداة «تحقق من توقيعك» تأخذ رأس وجسمًا وتقول أين الخطأ.
- استضافة الـ sandbox داخل المملكة كالإنتاج.

### 5.3 سجل المزامنة (Sync Log)
لكل رسالة/سجل صف قابل للبحث بالموظف والفترة والاتصال:

| الحقل | مثال |
|---|---|
| الاتجاه والقناة | صادر · Webhook / Jisr / SFTP |
| الكيان والإصدار | `session 9a1… v3` |
| الحالة | `QUEUED → SENT → ACKED` أو `FAILED_RETRYING (4/7)` أو `DEAD` أو `SKIPPED (لا تغيير — line_hash مطابق)` |
| السبب | رمز موحد + نص عربي/إنجليزي: `REMOTE_4XX_VALIDATION: "employee 88213 not found"`، `AUTH_EXPIRED`، `RATE_LIMITED`، `MAPPING_MISSING: leave_type=SICK` |
| رد الطرف الآخر | الحالة HTTP + أول 2KB من الرد **بعد حجب** الأسرار |
| الإجراءات | إعادة المحاولة، فتح السجل، تصحيح التعيين ثم إعادة، تجاهل مع سبب (يُدقق) |

- لوحة صحة لكل اتصال: آخر نجاح، معدل الفشل 24 ساعة، عدد الرسائل الميتة، انتهاء الاعتماد.
- المحتوى الكامل للحمولة **لا** يُخزن في السجل بعد 30 يومًا (سياسة)؛ يبقى المعرّف والـ hash.

---

## 6. أحداث Webhook

### 6.1 القائمة (الإصدار الأول)

| الحدث | متى | الحمولة المختصرة (`data`) |
|---|---|---|
| `attendance.decided` | كل قرار بصمة (بما فيها المرفوض) | `event_id`، `employee{id, employee_number, external_refs}`، `type`، `server_time`، `decision`، `reasons[]` (codes)، `site{id, code}`، `policy_version_id` |
| `attendance.adjusted` | اعتماد تسوية | `adjustment_id`، `target`، `kind`، `approved_by`، `session_id` |
| `exception.submitted` | تقديم استثناء/تصحيح | `exception_id`، `employee`، `type`، `event_id?` |
| `exception.resolved` | اعتماد/رفض | `exception_id`، `status`، `resolution_code`، `resolved_by`، `adjustment_id?` |
| `session.closed` | إغلاق جلسة (عادي أو `INCOMPLETE`) | `session_id`، `employee`، `business_date`، `worked_min`، `late_min`، `status`، `line_hash` |
| `session.updated` | إعادة بناء غيّرت سطرًا | كالسابق + `previous_line_hash` |
| `period.locked` | إقفال فترة | `period{id, code, start_date, end_date}`، `line_count`، `totals_hash`، `links.timesheet` |
| `period.reopened` | فتح فترة مقفلة (صلاحية خاصة) | `period`، `reopened_by`، `reason` |
| `period.exported` | تصدير دفعة | `period`، `batch_id`، `channel`، `file_sha256` |
| `employee.synced` | إنشاء/تحديث موظف من أي مصدر | `employee{id, employee_number, status}`، `source`، `changed_fields[]` (أسماء فقط) |
| `employee.sync_failed` | فشل سجل وارد | `connection_id`، `external_id`، `error_code` |
| `connection.unhealthy` | اتصال فشل/انتهى اعتماده | `connection_id`، `system`، `state` |

- **لا** أحداث للأجهزة ولا للأدلة الجغرافية. تغيّر ارتباط الجهاز يبقى داخليًا في الإصدار الأول.
- المشترك يختار الأحداث ونطاق الفروع لكل اشتراك.

### 6.2 مثال موقّع

الرؤوس:
```
POST /hooks/attendance HTTP/1.1
content-type: application/json
webhook-id: evt_01JBXK7Q2M8H4V6N9R3T5W7Y1Z
webhook-timestamp: 1792994292
webhook-signature: v1,i0OdxDXz23Ssbe8rDfQ7WbecnYpnwgflDKzzNChDF3Q=
```
الجسم الخام كما يُرسل (التوقيع على هذه البايتات حرفيًا):
```json
{"id":"evt_01JBXK7Q2M8H4V6N9R3T5W7Y1Z","type":"attendance.decided","api_version":"2027-01-01","tenant_id":"3f6c1e2a-8b4d-4c9e-9a51-2d7e0f4b6a10","occurred_at":"2026-10-26T05:58:11Z","sequence":{"entity":"employee:7b2e9d14-5c3a-4f81-b6e0-1a9c8d2f4e53","seq":418},"data":{"event_id":"c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f","employee":{"id":"7b2e9d14-5c3a-4f81-b6e0-1a9c8d2f4e53","employee_number":"R-1042","external_refs":[{"system":"jisr","connection_id":"con_9k2","id":"88213"}]},"type":"CLOCK_IN","server_time":"2026-10-26T05:58:11Z","decision":"PENDING_REVIEW","reasons":["LOC_UNCERTAIN"],"site":{"id":"5e8a0c3b-2d4f-4a6b-9c1e-7f3d5b9a2c84","code":"BR-OLAYA"},"policy_version_id":"pv_2026_10_a","engine_version":"1.4.0","links":{"self":"/v1/attendance/events/c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f"}}}
```
- السر التجريبي: `whsec_demo_only_not_a_real_secret`. المحتوى الموقّع: `webhook-id + "." + webhook-timestamp + "." + raw_body`، والتوقيع أعلاه محسوب فعلًا بـ `openssl dgst -sha256 -hmac` على هذا الجسم (يصلح كمتجه اختبار لاختبار مرحلة 3 «Webhook موقّع يُتحقق منه باختبار مستقل»).
- `webhook-timestamp` = 2026-10-26T05:58:12Z. المستقبل الذي يعيد تنسيق JSON قبل التحقق سيفشل — يجب التحقق على الجسم الخام.
- القيم في المثال اصطناعية بالكامل.

---

## 7. المخاطر

| # | الخطر | الأثر | التخفيف |
|---|---|---|---|
| R1 | **تسرب مفاتيح API/أسرار Webhook** | وصول كامل لبيانات حضور عميل | hash للمفاتيح، عرض مرة واحدة، بادئة قابلة للفحص (secret scanning)، انتهاء اختياري، تدوير دون توقف، نطاقات دنيا وتقييد بالفروع وIP allowlist اختياري، تنبيه عند استخدام من ASN جديد، سجل تدقيق لكل إنشاء/استخدام أول/إلغاء |
| R2 | **تسرب بيانات بين العملاء** (أخطر خطر في الوحدة: عمّال خلفية تعالج كل العملاء) | خرق PDPL وفقدان الثقة | `tenant_id` + RLS على كل جداول الوحدة؛ العامل يضبط سياق العميل لكل رسالة ويفشل إن غاب؛ الأسرار مشفرة بمفتاح لكل عميل؛ اختبار F8 موسّع: مفتاح عميل A على مسارات/اشتراكات/سجل مزامنة عميل B → 404، ورسالة outbox لعميل A لا تُرسل لوجهة عميل B |
| R3 | **SSRF عبر عناوين Webhook/SFTP** | وصول لشبكتنا الداخلية | §3(ب): HTTPS، منع العناوين الخاصة بعد DNS، egress proxy منفصل |
| R4 | **تضارب مصادر الحقيقة** (SCIM وHR ويدوي) | إيقاف موظف خطأً → رفض بصماته `ACCOUNT_INACTIVE` | مصدر واحد لكل كيان؛ قفل الحقول؛ «إيقاف» من مصدر خارجي يدخل حيّز التنفيذ مع تنبيه HR؛ لا حذف |
| R5 | **نقل بيانات خارج المملكة (PDPL م 29)** — موصلات لأنظمة مستضافة خارجها (أمثلة محتملة: Workday، SAP، Oracle، Zoho بحسب مركز بيانات العميل، Jisr على AWS)، وiPaaS | مخالفة نظامية للعميل (المتحكم) ولنا (المعالج) | العميل يقرر النقل كمتحكم، ونحن نُلزم بإعلان الموقع (§5.1) وإقرار مكتوب؛ تقليل الحمولة (لا موقع ولا أجهزة)؛ الإرسال مباشرة من بنيتنا داخل المملكة إلى الوجهة دون وسيط خارجي؛ ملحق DPA + مراجعة مستشار (D-09)؛ إعداد على مستوى المنصة يمنع الوجهات «خارج المملكة» حتى يعتمد ADR |
| R6 | **ادعاء تكامل غير مثبت** (القاعدة 9) | خطر سمعة/قانوني | كل موصل `Blocked` حتى اختبار حقيقي؛ صياغة «مبني على API العامة لـ X»؛ لا شعارات دون إذن |
| R7 | **تغيّر APIs المزوّدين** (Odoo يزيل RPC في 22؛ ZenHR دليلان؛ Oracle نسخ متعددة) | توقف موصل صامت | contract tests ليلية على sandbox المزوّد، لوحة صحة، `connection.unhealthy` |
| R8 | **إرسال قرار ثم تغيّره** | رواتب خاطئة لدى الطرف الآخر | الافتراضي إرسال السطور بعد `period.locked`؛ `session.updated` مع `previous_line_hash`؛ `period.reopened` صريح |
| R9 | **تكلفة الصيانة** لعدد موصلات كبير على فريق صغير | تآكل الجودة | لا موصل دون عميل يطلبه؛ ملفات + REST كبديل عام دائم |
| R10 | **إغراق الطرف الآخر/حدود المعدل** (Zoho 10 طلبات ثم قفل 5 د) | فشل جماعي | محدد معدل لكل اتصال، تجميع دفعات، احترام `Retry-After` |

---

## 8. المراحل وقرارات ADR

### 8.1 المرحلة 2 (MVP) — ضئيل عمدًا، لا قصص جديدة
لا API عامة ولا Webhooks في المرحلة 2 (PRD §5). المطلوب فقط **ألا نغلق الباب**، داخل قصص قائمة:
1. `UNIQUE (tenant_id, employee_number)` (مضمون أصلًا بمنع «رقم مكرر» في T-06) — هو مفتاح المطابقة الافتراضي لاحقًا.
2. حقل `code` اختياري فريد لكل عميل على الفرع والموقع (US-02)، يظهر في التصدير.
3. تصدير US-22 يتضمن أعمدة ثابتة: `employee_number`، `branch_code`، `business_date`، `session_id`، والمدد بالدقائق — بترتيب أعمدة موثّق لا يتغير دون إصدار.
4. لا جدول outbox ولا `external_refs` في المرحلة 2 (يُضافان بـ migration في المرحلة 3 دون كسر).
> البنود 2–3 تمس معايير US-02/US-22 قليلًا → **تحتاج اعتمادًا بشريًا** (قرار مقترح D-11).

### 8.2 المرحلة 3
النموذج القانوني v1 + `external_refs`، outbox، REST API (OAuth2 client credentials + مفاتيح)، Webhooks (الأحداث في §6.1) مع retry/dead-letter/replay، سجل المزامنة، SCIM 2.0 + SSO Entra، قوالب ملفات + SFTP + استيراد الإجازات (BL-19)، sandbox، وأول موصل P1 واحد فقط بطلب عميل. قالب مُدد يبقى `Blocked` (W3).

### 8.3 المرحلة 4+
بقية موصلات P1/P2، `GET /v1/changes` للـ pull، واجهة replay متقدمة، iPaaS، موصلات P3 بطلب، إدراج في معرض Entra.

### 8.4 قرارات تحتاج ADR

| ADR مقترح | السبب |
|---|---|
| ADR-00xx Integration Hub: outbox + BullMQ + at-least-once + ترتيب لكل كيان | سلوك جديد غير مذكور في specs (قاعدة specs: «يُقرر بـ ADR») |
| ADR-00xx مصادقة الآلات: OAuth2 client credentials + مفاتيح API محدودة النطاق | امتداد لقرار Auth في §3 |
| ADR-00xx صيغة توقيع Webhooks (Standard Webhooks، تدوير الأسرار، سياسة retry) | §3 يحسم HMAC فقط لا التفاصيل |
| ADR-00xx SCIM 2.0 ومصدر الحقيقة للموظف | يمس منطق `ACCOUNT_INACTIVE` وتحرير الموظف |
| ADR-00xx **النقل خارج المملكة عبر التكاملات** (PDPL م 29) | قيد ثابت (ksa P5) — يحتاج مستشارًا (D-09) قبل أي موصل لوجهة خارجية |
| ADR-00xx سياسة إصدارات API والإيقاف | التزام تعاقدي طويل الأمد |

### 8.5 قرارات تحتاج اعتمادًا بشريًا (لا ADR)
- D-11: إضافات المرحلة 2 في §8.1 (رمز الفرع/الموقع، أعمدة التصدير الثابتة).
- اختيار أول موصل (Jisr أم ZenHR أم غيرهما) **بناءً على عميل فعلي**، لا على هذه الوثيقة.
- الحصول على قالب مُدد من العميل التجريبي (ksa W3 — مسؤول: HR لدى العميل).
- طلب توثيق API من Bayzat وPalm HR (مسؤول: مالك المنتج) قبل أي وعد.
- هل تُعرض إشارات الخطر (`signals[]`) للأنظمة الخارجية أصلًا، أم تبقى داخلية؟ الاقتراح: الرموز فقط في REST بنطاق مستقل، ولا شيء في Webhooks.
