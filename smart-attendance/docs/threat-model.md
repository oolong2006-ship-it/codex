# Threat Model (STRIDE) — الدخول وربط الجهاز

> نطاق المرحلة 1: مسارات `/v1/auth/*` و`/v1/devices/*` وطبقة العزل. أسطح التكامل (API عامة، Webhooks، SCIM) مغطاة في `docs/product/security-compliance.md`.
> كل ضابط هنا يشير إلى الكود أو الاختبار الذي يثبته. «مفتوح» = لم يُعالج بعد.

## الأصول وحدود الثقة

| الأصل | لماذا يهم |
|---|---|
| كلمات المرور وأسرار TOTP | الاستيلاء على حساب HR = اعتماد أجهزة وتغيير حضور |
| refresh tokens | جلسة طويلة |
| ارتباط الجهاز (`device_bindings`) | أساس الثقة في كل بصمة لاحقة |
| رموز التفعيل والتحديات | تحويل جهاز غير موثوق إلى موثوق |
| بيانات العملاء | تسرب بين العملاء = خرق PDPL وعقد |
| `audit_logs` | الدليل عند النزاع |

حدود الثقة: الهاتف ← الخادم (لا ثقة في أي فحص على الهاتف — CLAUDE.md §5.1)؛ الخادم ← قاعدة البيانات (دور `sa_app` محصور بـ RLS)؛ عميل ← عميل.

## مسار الدخول

| STRIDE | التهديد | الضابط | الدليل |
|---|---|---|---|
| S | تخمين كلمة المرور | argon2id؛ قفل بعد `MAX_FAILED_LOGINS` محاولات لمدة `LOCKOUT_MINUTES` (إعداد)؛ رسالة واحدة للمستخدم غير الموجود وكلمة المرور الخاطئة؛ تحقق وهمي لمعادلة الزمن | `auth.e2e.ts`: locks the account…؛ unknown user gets the same error |
| S | سرقة كلمة مرور HR | MFA (TOTP) إلزامي لـ `platform_admin` و`tenant_admin` و`hr`؛ لا رمز قبل التحقق | `auth.e2e.ts`: HR must enroll TOTP…؛ platform admin also requires MFA |
| S | إعادة استخدام رمز TOTP مُلتقط | `mfa_last_step`: كل خطوة تُقبل مرة واحدة | `auth.e2e.ts`: إعادة استخدام الرمز نفسه مرفوضة |
| T | تعديل JWT (الأدوار/العميل) | HS256 بسر ≥ 32 بايت، والتحقق من `typ=access`؛ رمز MFA بنوع `typ=mfa` لا يصلح كـ access | `config.spec.ts` (rejects weak secrets)؛ `AuthGuard` |
| R | إنكار محاولات دخول | `auth.login.failed / lockout / locked / success` في `audit_logs` | `auth.e2e.ts` يتحقق من الأحداث |
| I | تسرب refresh token من قاعدة البيانات | يُخزن sha256 فقط | `refresh_tokens.token_hash` |
| I | تسرب سر TOTP | AES-256-GCM بمفتاح من البيئة؛ لا يُخزن خامًا | `crypto.spec.ts`؛ `auth.e2e.ts` يتحقق أن المخزن لا يحوي السر |
| E | سرقة refresh token | تدوير عند كل استخدام؛ إعادة استخدام رمز مُدوّر ← إلغاء العائلة كلها؛ التدوير شرطي ذري ضد السباق | `auth.e2e.ts`: refresh rotates; reuse revokes family |
| D | إغراق الدخول | **مفتوح**: لا rate limiting على مستوى IP بعد (القفل لكل حساب فقط). يُضاف عند البوابة/الـ ingress في المرحلة 2 |
| E | عميل موقوف يستمر | فحص `tenants.status` عند الدخول والتحديث | `auth.e2e.ts`: a suspended tenant cannot sign in |

## مسار ربط الجهاز (specs §C)

| STRIDE | التهديد | الضابط | الدليل |
|---|---|---|---|
| S | ربط جهاز المهاجم بحساب موظف | رمز تفعيل لمرة واحدة، 8 خانات، مرتبط بالموظف، صلاحية من السياسة، يُخزن HMAC؛ يتطلب أيضًا جلسة الموظف | `devicelock.e2e.ts`: rejects another employee's code |
| S | محاكي أو تطبيق معدّل | attestation على الخادم عبر adapter؛ الإنتاج يرفض Fake ويرفض التشغيل حتى يُنفذ التحقق الحقيقي | `config.spec.ts`؛ **Blocked**: التحقق الحقيقي (ADR-0001 spike) |
| T | إعادة تشغيل attestation قديم | تحدٍّ من الخادم لمرة واحدة بصلاحية قصيرة، يجب أن يظهر داخل attestation | `devicelock.e2e.ts`: a challenge can be used only once؛ attestation without the issued challenge |
| T | تفعيل جهاز بديل دون موافقة (F6) | الربط الأول يُرفض إن وُجد ارتباط ACTIVE/SUSPENDED/PENDING؛ طلب التغيير لا يغيّر شيئًا؛ لا endpoint آخر يُنشئ ارتباطًا | `devicelock.e2e.ts` F6 (×2) |
| E | الموظف يعتمد طلبه (F7) | صلاحية `devices.change.decide` غير ممنوحة للموظف؛ ومنع صريح لاعتماد الطلب الذاتي حتى لـ HR؛ وقيد DB `decided_by <> requested_by` | `devicelock.e2e.ts` F7؛ `db-constraints.e2e.ts` |
| E | ارتباطان نشطان لموظف واحد | partial unique index في DB | `db-constraints.e2e.ts` |
| E | جهاز واحد لموظفين اثنين | partial unique index على `device_id` + فحص في الخدمة | `device_bindings_device_one_active` |
| E | إعادة تفعيل جهاز مسروق بدور غير HR | آلة الحالات: `SUSPENDED → ACTIVE` لـ `hr` فقط | `domain.test.ts`؛ `devicelock.e2e.ts`: only HR reactivates |
| I | سرقة الهاتف | `suspend` فوري يلغي كل refresh tokens للموظف | `devicelock.e2e.ts`: HR suspends immediately… |
| R | إنكار اعتماد أو إيقاف | سجل تدقيق في نفس المعاملة؛ والمحاولات المرفوضة (403/409) تُسجل `*.denied` | `devicelock.e2e.ts` يتحقق من `device.binding.create.denied` |
| I | تسرب أسرار في سجل التدقيق | حقول حساسة تُخزن sha256 (code، token، secret، nonce، attestation…) | `crypto.spec.ts`: audit redaction |

## العزل بين العملاء (F8)

| STRIDE | التهديد | الضابط | الدليل |
|---|---|---|---|
| I | قراءة بيانات عميل آخر عبر API | فحص الخدمة (404) + RLS | `isolation.e2e.ts` |
| I | خطأ في فحص الخدمة | RLS وحده يمنع (اختبار بتعطيل الفحص عمدًا) | `isolation.e2e.ts`: RLS alone |
| T | الكتابة في عميل آخر | `WITH CHECK` في كل سياسة | `isolation.e2e.ts`: RLS refuses writes |
| E | دور التطبيق يتجاوز RLS | `sa_app` بـ `NOBYPASSRLS` وليس مالك الجداول؛ `FORCE ROW LEVEL SECURITY` | `isolation.e2e.ts`: every operational table has RLS enabled and forced |
| E | مدير فرع يرى فروعًا أخرى | ABAC بنطاق الفرع في الخدمة | `isolation.e2e.ts` ABAC |
| T/R | تعديل سجل التدقيق | trigger يمنع UPDATE/DELETE/TRUNCATE حتى للمالك + لا صلاحيات UPDATE/DELETE للأدوار | `db-constraints.e2e.ts` F16 |

## مفتوح (يُتابع)

1. Rate limiting على مستوى IP/المسار — المرحلة 2.
2. التحقق الحقيقي من App Attest وKey Attestation وPlay Integrity — Blocked (ADR-0001 spike).
3. قناة دعوة آمنة لمسؤول العميل الأول (كلمة المرور المؤقتة تُعاد في الاستجابة لـ Super Admin حاليًا) — المرحلة 2.
4. تدوير مفاتيح `JWT_SECRET` و`MFA_ENC_KEY` و`CODE_HMAC_KEY` عبر KMS — ADR-0013 بعد اختيار المزوّد.
5. ربط refresh token بالجهاز المربوط (`device_binding_id`) لجلسات الجوال — المرحلة 2 مع مسار البصمة.
