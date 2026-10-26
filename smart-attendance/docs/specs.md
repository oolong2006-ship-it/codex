# specs.md — المواصفات الملزمة

> أي سلوك غير مذكور هنا يُقرر بـ ADR. القيم الافتراضية كلها **سياسات قابلة للضبط لكل عميل وموقع**، ولا تُكتب ثابتة في الكود.

---

## A. Attendance Trust Engine — ترتيب القرار

يُقيَّم كل طلب بصمة على ثلاث طبقات بالترتيب، ويتوقف التقييم عند أول رفض قاطع.

### الطبقة 1: فحوص قاطعة → `REJECTED`

| الشرط | reason code |
|---|---|
| الحساب موقوف أو الموظف غير نشط | `ACCOUNT_INACTIVE` |
| اشتراك العميل منتهٍ | `TENANT_INACTIVE` |
| الطلب من جهاز غير مرتبط بالموظف أو ارتباطه ملغى | `DEVICE_NOT_BOUND` |
| فشل التحقق من App Attest assertion أو Play Integrity | `ATTESTATION_FAILED` |
| التحدي (nonce) غير موجود أو منتهٍ أو مستخدم | `CHALLENGE_INVALID` |
| الموظف غير مصرح له بأي موقع نشط في هذا الوقت | `NO_AUTHORIZED_SITE` |
| تسلسل مستحيل (انصراف دون حضور مفتوح وفق السياسة) | `SEQUENCE_INVALID` |

### الطبقة 2: الموقع → VERIFIED / PENDING_REVIEW / REJECTED

راجع القسم B.

### الطبقة 3: إشارات الخطر → ترفع النتيجة إلى `PENDING_REVIEW` فقط

لا تحول إشارة الخطر وحدها النتيجة إلى `REJECTED`، إلا إذا فعّل العميل ذلك صراحةً في سياسته.

| الإشارة | code |
|---|---|
| Mock location (Android `isMock`) أو ما يعادلها | `RISK_MOCK_LOCATION` |
| Play Integrity: الجهاز لا يحقق `MEETS_DEVICE_INTEGRITY` | `RISK_DEVICE_INTEGRITY` |
| سرعة مستحيلة بين آخر حدث وهذا الحدث (> 250 كم/س افتراضيًا) | `RISK_IMPOSSIBLE_TRAVEL` |
| فرق بين وقت الهاتف ووقت الخادم أكبر من 5 دقائق | `RISK_CLOCK_SKEW` |
| أكثر من حساب على الجهاز نفسه خلال 24 ساعة | `RISK_SHARED_DEVICE` |
| إعادة ربط جهاز خلال آخر 7 أيام | `RISK_RECENT_REBIND` |

**الناتج المخزَّن** لكل قرار في `attendance_decisions`: decision، وreasons[]، وsignals[]، وpolicy_version_id، وengine_version.

---

## B. GeoTrust — معادلة القرار الجغرافي

### الرموز
- `s`: المسافة **الموقّعة** بالأمتار من موضع العينة إلى حدّ السياج. تكون سالبة داخل السياج وموجبة خارجه.
  - للدائرة: `s = distance(point, center) − radius`
  - للمضلع: `s = −ST_Distance(boundary, point)` إذا كانت النقطة داخله، و`+ST_Distance(polygon, point)` إذا كانت خارجه (على `geography`).
- `a`: هامش الدقة الأفقية المعلن من الهاتف (`horizontalAccuracy` / `accuracy`).
- `t`: هامش السماح للموقع `tolerance_m`، وافتراضيه 0.

### اختيار العينة
1. استبعد العينات التي عمرها > `max_sample_age_s` (افتراضي 30 ثانية) مقاسًا بوقت الخادم عند الاستلام.
2. استبعد العينات ذات الإحداثيات غير الصالحة أو `a <= 0`.
3. من العينات الباقية اختر الأقل `a`.
4. إذا لم تبقَ عينة: `PENDING_REVIEW` + `LOC_NO_VALID_SAMPLE`، ويُعرض على الموظف خيار إعادة المحاولة.

### القرار
```
إذا  a > max_accuracy_m (افتراضي 100)       → PENDING_REVIEW  (LOC_LOW_ACCURACY)
وإلا إذا  s + a ≤ t                          → VERIFIED        (LOC_INSIDE)
وإلا إذا  s − a > t                          → REJECTED        (LOC_OUTSIDE)
وإلا                                          → PENDING_REVIEW  (LOC_UNCERTAIN)
```

- عند المواقع المتقاربة أو المتداخلة يُختار الموقع المصرح للموظف في ورديته الحالية أولًا، ثم أقرب موقع مصرح.
- يُحفظ في `location_evidence`: العينات كلها، والعينة المختارة، و`s`، و`a`، ونسخة السياج (`geofence_version_id`).
- ملاحظة واجهة: عند `LOC_LOW_ACCURACY` اطلب من الموظف الاقتراب من نافذة أو المدخل وأعد القراءة، **قبل** إرسال حالة المراجعة.

---

## C. DeviceLock — آلة الحالات

### حالات الارتباط `device_bindings.status`
```
PENDING_ACTIVATION → ACTIVE → { SUPERSEDED | REVOKED | SUSPENDED }
SUSPENDED → ACTIVE   (بقرار HR فقط)
```
- ارتباط `ACTIVE` واحد فقط لكل موظف، ويُفرض بـ partial unique index:
  `UNIQUE (tenant_id, employee_id) WHERE status = 'ACTIVE'`.

### الربط الأول (Onboarding)
1. HR يصدر **رمز تفعيل** لمرة واحدة: 8 خانات، صلاحيته 72 ساعة، مرتبط بموظف.
2. الموظف يسجل الدخول ويُدخل الرمز. يولّد التطبيق مفتاحًا (App Attest key أو Keystore key مع attestation).
3. الخادم يتحقق من الـ attestation ويسجل المفتاح العام، ويصبح الارتباط `ACTIVE` **تلقائيًا**.
4. سياسة بديلة اختيارية للعميل: `first_device_requires_approval = true`.

### تغيير الجهاز
`device_change_requests.status`: `OPEN → APPROVED | REJECTED | EXPIRED (7 أيام)`
- الموظف يقدم الطلب من الجهاز الجديد مع السبب: فقد، أو سرقة، أو تعطل، أو ترقية.
- عند موافقة HR: يصبح القديم `SUPERSEDED` والجديد `ACTIVE`، وتُلغى جلسات الجهاز القديم وrefresh tokens كلها، ويُسجل ذلك في audit.
- **ممنوع** أي مسار API يفعّل جهازًا بديلًا دون موافقة. يُغطى باختبار.
- عند البلاغ عن سرقة: HR يجعل الارتباط `SUSPENDED` فورًا.

### إعادة التثبيت على نفس الجهاز
مفتاح App Attest يضيع عند إعادة التثبيت، لذلك نجمع إشارات تبقى بعدها:
- **iOS:** استخدم DeviceCheck لتعيين bit0 = «جهاز مربوط بهذا التطبيق» عند الربط. بعد إعادة التثبيت يقرأ الخادم البتّين: إذا كان bit0 = 1 فهو على الأرجح نفس الجهاز.
- **Android:** خزّن hash لـ `ANDROID_ID` (يبقى بعد إعادة التثبيت لنفس مفتاح التوقيع، ويتغير بإعادة ضبط المصنع)، إضافة إلى Key Attestation. **تحقق** من توفر Play Integrity device recall واستخدمه إن توفر.

مسار `REBIND_SAME_DEVICE`:
- إذا تطابقت الإشارات ونفس الحساب ولا يوجد طلب تغيير مفتوح: يُعاد الربط وفق سياسة العميل `same_device_rebind = auto | approval`، وافتراضيها `auto`، وتُسجل إشارة `RISK_RECENT_REBIND`.
- إذا لم تتطابق الإشارات: يُعامل كتغيير جهاز ويحتاج موافقة.
- لا يُعتبر أي معرف جهاز وحده إثباتًا لهوية الشخص.

---

## D. عقد API للبصمة

### 1) طلب تحدٍّ
`POST /v1/attendance/challenges` (مصادَق)
```json
{ "challenge_id": "uuid", "nonce": "base64(32B)", "expires_at": "ISO8601 (+60s)" }
```

### 2) تسجيل البصمة
`POST /v1/attendance/punches`
Headers: `Authorization`, `Idempotency-Key: uuid`
```json
{
  "challenge_id": "uuid",
  "type": "CLOCK_IN | CLOCK_OUT | BREAK_START | BREAK_END",
  "location_samples": [
    { "lat": 24.7, "lng": 46.6, "accuracy_m": 12, "captured_at": "ISO8601",
      "provider": "gps|fused|network", "is_mock": false }
  ],
  "client_time": "ISO8601", "client_tz": "Asia/Riyadh",
  "app_version": "1.0.0", "os": "ios|android", "os_version": "...",
  "attestation": { "platform": "ios|android", "key_id": "...",
                   "assertion": "base64 (iOS)", "integrity_token": "... (Android)" },
  "offline": false
}
```
- التوقيع: assertion أو توقيع Keystore على `SHA256(nonce || canonical_json(body_without_attestation))`.
- Idempotency: إعادة إرسال نفس المفتاح تعيد **نفس** الرد ولا تنشئ حدثًا جديدًا (24 ساعة).
- الرد:
```json
{ "event_id": "uuid", "server_time": "ISO8601",
  "decision": "VERIFIED|PENDING_REVIEW|REJECTED",
  "reasons": [{ "code": "LOC_INSIDE", "message_ar": "...", "message_en": "..." }],
  "site": { "id": "uuid", "name": "..." },
  "next_action": "NONE|RETRY_LOCATION|SUBMIT_EXCEPTION|REQUEST_DEVICE_CHANGE" }
```
- حتى الطلب المرفوض يُنشئ `attendance_event`، لأن المحاولة نفسها دليل.

---

## E. البصمة دون اتصال

- التطبيق يحفظ الحدث مشفرًا ويوقعه بالمفتاح المرتبط، مع:
  `last_server_sync_time`، و`elapsed_since_sync_ms` (ساعة monotonic)، و`boot_id`.
- الخادم يقدّر الوقت: `last_server_sync_time + elapsed`. إذا تغيّر `boot_id` أو تجاوز الفرق 5 دقائق مع وقت الهاتف تُضاف `RISK_CLOCK_SKEW`.
- الأحداث غير المتصلة تكون `PENDING_REVIEW` **دائمًا** في الـ MVP. والاعتماد التلقائي ضمن حدود يأتي في المرحلة 4 وبسياسة صريحة.
- أقصى عمر للحدث غير المتصل عند المزامنة: 24 ساعة، وبعدها `REJECTED` + `OFFLINE_EXPIRED`.

---

## F. قواعد البيانات الأساسية

- `attendance_events`: append-only. يُمنع UPDATE وDELETE بـ trigger، ويُستثنى عمود `synced_at` فقط.
- `attendance_adjustments`: كل تصحيح يرتبط بـ event_id أو session_id، مع السبب والمعتمِد والوقت.
- `attendance_sessions`: تُحتسب من الأحداث + التسويات، ويمكن إعادة بنائها بالكامل في أي وقت.
- `payroll_periods.status`: `OPEN → LOCKED → EXPORTED`. أي تعديل على فترة `LOCKED` يتطلب `reopen` بصلاحية خاصة وسجل تدقيق.
- `audit_logs`: append-only، ويُسجل فيه: actor، وtenant، وaction، وentity، وbefore/after (hash للحقول الحساسة)، وip، وuser_agent.
- كل جدول تشغيلي: `tenant_id NOT NULL`، وRLS policy، وفهرس يبدأ بـ `tenant_id`.

---

## G. مصفوفة اختبارات الاحتيال (الحد الأدنى الإلزامي)

| # | السيناريو | النتيجة المتوقعة | المستوى |
|---|---|---|---|
| F1 | بصمة من جهاز غير مرتبط | `REJECTED / DEVICE_NOT_BOUND` | API e2e |
| F2 | بصمة بعد إلغاء الارتباط | `REJECTED / DEVICE_NOT_BOUND` | API e2e |
| F3 | إعادة إرسال نفس الطلب بنفس nonce | `REJECTED / CHALLENGE_INVALID` | API e2e |
| F4 | نفس Idempotency-Key مرتين | نفس الرد، حدث واحد فقط | API e2e |
| F5 | تعديل body بعد التوقيع | `REJECTED / ATTESTATION_FAILED` | API e2e |
| F6 | تفعيل جهاز بديل عبر أي endpoint دون موافقة | 403، دون أي تغيير في bindings | API e2e |
| F7 | موظف يعتمد طلب تغيير جهازه بنفسه | 403 | API e2e |
| F8 | مستخدم عميل A يقرأ أو يعدل بيانات عميل B | 404/403 + RLS يمنع على مستوى DB | API + DB |
| F9 | mock location = true داخل السياج | `PENDING_REVIEW / RISK_MOCK_LOCATION` | unit + e2e |
| F10 | عينة عمرها 5 دقائق | `PENDING_REVIEW / LOC_NO_VALID_SAMPLE` | unit |
| F11 | دقة 300م داخل السياج | `PENDING_REVIEW / LOC_LOW_ACCURACY` | unit |
| F12 | سفر مستحيل بين فرعين | `PENDING_REVIEW / RISK_IMPOSSIBLE_TRAVEL` | unit |
| F13 | وقت الهاتف مقدَّم ساعة | القرار بوقت الخادم + `RISK_CLOCK_SKEW` | e2e |
| F14 | حسابان على هاتف واحد | `RISK_SHARED_DEVICE` | e2e |
| F15 | تعديل حدث بعد إقفال الفترة | مرفوض دون reopen | API e2e |
| F16 | UPDATE مباشر على attendance_events | يفشل بسبب trigger | DB |
| F17 | مدير فرع يعتمد استثناء خارج فرعه | 403 | API e2e |
| F18 | مزامنة نفس الحدث غير المتصل مرتين | حدث واحد | API e2e |

اختبارات الأجهزة الحقيقية (iOS + Android، داخل المبنى وخارجه) تُسجل يدويًا في `docs/field-tests.md` مع التاريخ والجهاز والنتيجة.
