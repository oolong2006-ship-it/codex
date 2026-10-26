# لوحة الحالة

**آخر تحديث:** 2026-10-26 — نهاية المرحلة 0 (Discovery & Product Definition)
**المرحلة الحالية:** 1 — Secure Foundation **منتهية** (عدا البنود Blocked/Partial أدناه). التالي: المرحلة 2.

## المرحلة 1 — Secure Foundation (2026-10-26)

### بوابة الجلسة (نتيجة فعلية من نسخة نظيفة: `docker compose down -v` ثم):
```
$ docker compose up -d --wait && pnpm db:migrate && pnpm db:seed
Applied: 0001_foundation.sql
Seed complete
$ pnpm lint        → Tasks: 3 successful, 3 total
$ pnpm typecheck   → Tasks: 3 successful, 3 total
$ pnpm test
@sa/domain:test:  Test Files  1 passed (1)   — 11 tests
@sa/api:test: Test Suites: 7 passed, 7 total
@sa/api:test: Tests:       50 passed, 50 total
$ pnpm audit --prod → No known vulnerabilities found
```

| البند | الحالة | الدليل |
|---|---|---|
| Monorepo pnpm + Turborepo + config مشتركة | `Complete` | `package.json`، `turbo.json`، `packages/config` |
| بيئة محلية بأمر واحد + `.env.example` دون أسرار | `Complete` | `docker-compose.yml`، README |
| Migrations (كل جداول §3 + RLS + append-only) | `Complete` | `db/migrations/0001_foundation.sql`؛ `isolation.e2e.ts`، `db-constraints.e2e.ts` |
| الدخول بالبريد/الجوال، JWT 15 دقيقة، refresh دوّار مع كشف إعادة الاستخدام | `Complete` | `auth.e2e.ts` |
| MFA (TOTP) إلزامي لـ HR والإدارة + منع إعادة استخدام الرمز | `Complete` | `auth.e2e.ts` |
| RBAC + ABAC بنطاق الفرع | `Complete` | `isolation.e2e.ts` (ABAC)، `domain.test.ts` |
| DeviceLock على الخادم (رمز، ربط، طلب تغيير، اعتماد/رفض، إيقاف/إعادة تفعيل) | `Complete` | `devicelock.e2e.ts` (13 اختبارًا) |
| F6، F7 | `Complete` | `devicelock.e2e.ts` |
| F8 (API + RLS) + «RLS وحده» | `Complete` | `isolation.e2e.ts` |
| F16 على `audit_logs` | `Complete` | `db-constraints.e2e.ts` |
| قيد ارتباط ACTIVE واحد (DB) | `Complete` | `db-constraints.e2e.ts` |
| Audit: داخل معاملة العملية + interceptor للمحاولات المرفوضة | `Complete` | `devicelock.e2e.ts` (`*.denied`)، `auth.e2e.ts` |
| OpenAPI 3.1 مولّد ويغطي كل endpoints | `Complete` | `openapi.e2e.ts`؛ `apps/api/openapi.json` (20 مسارًا) |
| `FakeAttestationAdapter` في التطوير، ورفض التشغيل في الإنتاج | `Complete` | `config.spec.ts` |
| التحقق الحقيقي من App Attest / Key Attestation / Play Integrity | `Blocked` | يحتاج أجهزة حقيقية + Apple Team ID + مشروع Google Cloud/Play Console — Spike ADR-0001. الإنتاج يرفض التشغيل حتى يُنفذ |
| CI (lint، typecheck، unit، e2e على PostGIS حقيقي، OpenAPI، audit، secrets) | `Partial` | `.github/workflows/smart-attendance-ci.yml` — **لم يُشغّل بعد على GitHub**؛ فحص gitleaks لم يُجرّب محليًا (حظر سحب الصورة في البيئة) |
| Seed (عميلان، فرعان لكل منهما، أدوار مختلفة) | `Complete` | `apps/api/src/db/seed.ts` |
| Threat model (STRIDE) | `Complete` | `docs/threat-model.md` |

### قرارات اتُّخذت دون ADR (المرحلة 1)
1. **SQL صريح** للـ migrations (لا Drizzle) مع مشغّل بسيط — مسموح في CLAUDE.md §3.
2. **ثلاثة أدوار DB:** `sa_owner` (migrations)، `sa_app` (NOBYPASSRLS)، `sa_platform` (BYPASSRLS لمسار Super Admin فقط). الدخول قبل معرفة العميل عبر دالتي `SECURITY DEFINER` بأقل الحقول.
3. **البريد والجوال فريدان على مستوى المنصة** (لا لكل عميل) لتبسيط الدخول دون اختيار عميل.
4. **لا تحقق حقيقي من الأجهزة بعد:** الإنتاج يرفض التشغيل بدل قبول أجهزة دون تحقق.
5. **حذف DELETE** من صلاحيات التطبيق على جداول الهوية والأجهزة؛ التغيير بالحالة فقط.
6. **اسم المُصدِر في TOTP:** «Thabt» (PD-01) — يتغير إن تغير الاسم.

### مفتوح من المرحلة 1 إلى المرحلة 2
Rate limiting على مستوى IP، وقناة دعوة آمنة لمسؤول العميل، وربط refresh token بالجهاز، وBullMQ (لا مهام خلفية بعد) — `docs/threat-model.md` «مفتوح».

## سجل الاعتماد — 2026-10-26

المالك: «اعتمد كل شيء، وأي شيء يراه الفريق إضافة وميزة يتم عمله».
- **معتمد بالتوصية:** D-02، D-03، D-04، D-05، D-08 (ADR-0001)، D-10؛ وPD-01 (الاسم «ثَبْت — Thabt»، بعد فحص العلامة)، وPD-02…PD-08، PD-12، PD-14، PD-16؛ وADR-0002…0013.
- **معتمد كإجراء لكنه ما زال `Blocked` لأنه يحتاج فعلًا بشريًا أو معلومة:** D-01/ADR-0013 (التحقق من مناطق GCP/Oracle وعرض سعر)، D-06 (العتبات بعد المقابلات)، D-07 («شؤون» — نحتاج المصدر)، D-09/PD-09/PD-10/PD-11 (تكليف مستشار نظامي)، PD-05 (التسعير بعد المقابلات)، PD-13 (أول موصل حسب العميل)، PD-15 (فحص Jibble يدويًا)، والمقابلات، وسبل، وقالب مُدد.
- **غير مشمول:** التحقق بالوجه — الفريق نفسه صنّفه مخالفًا للميثاق قبل DPIA، فبقي خارج النطاق.

## بوابة نهاية الجلسة (CLAUDE.md §7)

```
$ cd smart-attendance && pnpm lint && pnpm typecheck && pnpm test
 WARN   Local package.json exists, but node_modules missing, did you mean to install?
 ELIFECYCLE  Command failed with exit code 2.
```
**التفسير:** لا يوجد `package.json` في `smart-attendance/` (المرحلة 0 دون شيفرة بنص البرومت)، فحلّ pnpm إلى `package.json` جذر المستودع الذي يخص مشروعًا آخر (masar34) وفشل. **لا ينطبق على هذه المرحلة.** يُنشأ الـ monorepo في المرحلة 1.

## البنود

| البند | الحالة | الدليل |
|---|---|---|
| 1. مصفوفة المنافسين (≥ 10، لكل صف رابط وتاريخ) | `Partial` | `docs/research/competitor-matrix.csv` (76 صفًا، 15 منافسًا، كل صف `source_url` + `verified_on`) + `.md`. الناقص: التحقق تم عبر فهرس البحث المقيد بالنطاق الرسمي لأن الجلب المباشر ممنوع بسياسة الشبكة؛ يلزم فتح الروابط يدويًا قبل أي استخدام علني. «شؤون» غير محددة |
| 2. المتطلبات السعودية | `Partial` | `docs/research/ksa-requirements.md`. الناقص: البنود في §6 (أيام الراحة، ومدة الاحتفاظ، وتصنيف الموقع، وحالة مناطق السحابة) + مراجعة مستشار نظامي |
| 2a. سبل — التكامل الحقيقي | `Blocked` | التسعير وشروط الاستخدام غير منشورة. المطلوب: تواصل مع سبل — مالك المنتج |
| 2b. صيغة مُدد | `Blocked` | القالب من حساب مُدد للعميل التجريبي — HR لدى العميل |
| 2c. الاستضافة داخل المملكة | `Blocked` | Supabase لا يملك منطقة سعودية (مصدر رسمي)؛ AWS «announced» فقط؛ البقية مصادر ثانوية. المطلوب: قرار D-01 |
| 3. أدوات المقابلات | `Complete` (الأدوات) | `docs/research/interviews/` — سكربتان + نموذج تفريغ |
| 3a. إجراء المقابلات | `Blocked — بانتظار المقابلات` | مهمة بشرية — مالك المنتج |
| 4. PRD الـ MVP | `Partial` | `docs/prd-mvp.md` (29 قصة، اختبارات T-01…T-30 + F1–F17). الناقص: عتبات نجاح التجربة (D-06) وتأكيد الافتراضات بالمقابلات |
| 4a. Backlog | `Complete` | `docs/backlog.md` (BL-01…BL-22 + قائمة OUT) |
| 5. الافتراضات | `Complete` | `docs/assumptions.md` (A-01…A-15) |
| 5a. المخاطر | `Complete` | `docs/risks.md` (تقنية 9، نظامية 6، تجارية 6) |
| 5b. ADR-0001 | `Partial` | `docs/adr/0001-mobile-react-native-vs-native.md` — مقترح. الناقص: أرقام صيانة الحزم (npm/GitHub ممنوعان في البيئة) → Spike المرحلة 1 |

> ملاحظة على المعجم: «Complete» هنا تعني أن الوثيقة مكتملة؛ لا توجد اختبارات في المرحلة 0.

## معايير قبول المرحلة 0

- [x] المصفوفة فيها ≥ 10 منافسين، وكل صف له رابط وتاريخ. (15 منافسًا — بتحفظ منهج الوصول أعلاه)
- [x] كل ميزة PARITY لها مقابل في الـ MVP أو سبب تأجيل. (19 صفًا PARITY، كلها لها `US-xx` أو `BL-xx` — فُحص آليًا عند توليد الـ CSV)
- [x] ksa-requirements خالٍ من أي رقم دون مصدر. (الأرقام غير المؤكدة نُقلت إلى §6 دون استخدامها)
- [x] PRD لا يحتوي وظيفة خارج نطاق المرحلة 2. (استثناء محل قرار: US-29 إقفال الفترة — D-03)
- [x] ADR-0001 مكتوب.

## قرارات تحتاج اعتمادًا بشريًا

| ID | القرار | التوصية | لماذا الآن |
|---|---|---|---|
| D-01 | مزوّد الاستضافة داخل المملكة | استبعاد Supabase للإنتاج (لا منطقة سعودية)؛ فتح صفحات مناطق GCP (الدمام) وOracle (جدة/الرياض) وAWS رسميًا وطلب عروض | المرحلة 1 تبني البيئة وCI |
| D-02 | تصدير الرواتب في الـ MVP | كشف حضور عام CSV/XLSX؛ مُدد في المرحلة 3 بعد الحصول على القالب | يحدد نطاق US-22 |
| D-03 | تعارض: معايير المرحلة 2 تشترط F15 (إقفال الفترة) بينما `payroll_periods` في نطاق المرحلة 3 | إدراج إقفال أدنى (LOCKED + reopen بصلاحية) في المرحلة 2 (US-29) | تعارض بين برومتين |
| D-04 | مستوى موافقة واحد في الـ MVP (مدير الفرع **أو** HR) | اعتماد | A-10 |
| D-05 | `BREAK_START/END` في عقد API (specs §D) والاستراحات خارج المرحلة 2 | يبقى العقد كما هو؛ الأنواع معطلة بسياسة `breaks_enabled=false`، ولا يعرضها التطبيق | يمس specs |
| D-06 | عتبات نجاح الـ Pilot (نسبة VERIFIED، والرفض الخاطئ، وزمن البصمة) | تُحدد بعد 5 مقابلات على الأقل | تحدد قرار المضي للمرحلة 3 |
| D-07 | ما المقصود بمنصة «شؤون»؟ | توضيح من صاحب الفكرة؛ حتى ذلك: لا إدراج ولا ادعاء تكامل | ورد في البرومت |
| D-08 | اعتماد ADR-0001 (React Native + Expo dev build + وحدة أصلية داخلية؛ لا Firebase App Check) | اعتماد مع Spike أول المرحلة 1 | المرحلة 1 تبدأ بالـ monorepo |
| D-09 | تكليف مستشار نظامي (نظام العمل + PDPL) | قبل الـ Pilot | R-L1، R-L2 |
| D-10 | تقديم إشعار خصوصية الموظف (BL-16) إلى ما قبل الـ Pilot بدل المرحلة 4 | اعتماد | PDPL حق العلم |

## قرارات اتُّخذت دون ADR في هذه الجلسة

1. **مكان المشروع:** وُضع في `smart-attendance/` داخل مستودع `codex` لأن المستودع يحوي مشاريع أخرى (masar34 في الجذر، `iso-platform/`، `alnadeg-procurement/`). هيكل CLAUDE.md §4 يُطبق نسبةً إلى هذا المجلد.
2. **منهج التحقق من المصادر:** فهرس البحث المقيد بالنطاقات الرسمية بدل الجلب المباشر (سياسة الشبكة). موثق في رأس كل ملف بحث.
3. **TimeMobi:** قُبلت صفحات المتجر التي ينشرها البائع وموقع getattendance.com كمصادر رسمية؛ ملكية النطاق غير متحقق منها مستقلًا.
4. **التصنيف DIFF:** أُعطي لصف Odoo (تسجيل الموقع دون فرض) فقط؛ فرضية التميز بربط الجهاز الموثق موثقة كفرضية غير مثبتة.

## تصميم المنتج الموسّع (طلب المالك: «منتج قوي يُربط بأي برنامج، قوي في الدقة»)

| البند | الحالة | الدليل |
|---|---|---|
| رؤية المنتج والتموضع والباقات | `Partial` (مقترح) | `docs/product/product-vision.md` — بانتظار PD-01…PD-05 |
| Integration Hub | `Partial` (مقترح) | `docs/product/integration-hub.md` — ADR-0007…0012 مقترحة |
| الثقة والدقة | `Partial` (مقترح) | `docs/product/trust-accuracy.md` — ADR-0002…0006 مقترحة؛ F19+ |
| الأمن والامتثال | `Partial` (مقترح) | `docs/product/security-compliance.md` — S1–S31؛ ADR-0013 |
| الصورة المجمّعة + سجل القرارات الموحّد | `Complete` (الوثيقة) | `docs/product/README.md` |

لا شيء من هذا يغيّر الميثاق أو specs قبل الاعتماد. المرحلة 1 لم تبدأ.

## افتراضات جديدة

A-01 … A-15 كلها جديدة في هذه الجلسة — انظر `docs/assumptions.md`.
