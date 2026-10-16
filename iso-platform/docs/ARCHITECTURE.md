# ARCHITECTURE

## القرار الحالي (انظر ADR-001…006 في DECISIONS.md)
- **Web/UI:** Next.js 16 (App Router, React 19, Server Components + Server Actions)، TypeScript strict، Tailwind، `dir="rtl"`.
- **Domain:** طبقة مجال TypeScript مستقلة عن الواجهة (`src/server/domain`) — كل دالة تأخذ `TenantCtx` وتتحقق من الصلاحية ثم تعمل داخل معاملة مقيدة بالمستأجر. تحقق المدخلات بـ Zod على الخادم.
- **Data:** PostgreSQL 16، SQL migrations صريحة مع تحقق SHA-256 من عدم تعديل المطبَّق.
- **Isolation:** Row-Level Security على كل جداول المستأجر. التطبيق يتصل بدور `iso_app` (NOBYPASSRLS، غير مالك). كل طلب = معاملة بـ `SET LOCAL app.org_id / app.user_id`.
- **Jobs:** طابور دائم في Postgres (`FOR UPDATE SKIP LOCKED`) عبر دالة `claim_next_job()` (SECURITY DEFINER تعيد المعرّف فقط)؛ التنفيذ تحت RLS. يعمل داخل الويب بعد الاستجابة (`after()`) وكعامل مستقل `npm run worker`.
- **Docs:** `docx` لتوليد Word أصلي RTL؛ PDF عبر Chromium (playwright-core) من HTML مُهرَّب بخط عربي مضمّن؛ ZIP عبر JSZip.
- **AI Gateway:** واجهة `AiProvider` مستقلة عن المزود؛ مزود Anthropic عبر SDK الرسمي (`claude-opus-5-5`، مع fallback). المحرك الحتمي `rules:v1` هو المسار الافتراضي ولا يحتاج AI.

## الطبقات المعرفية الأربع (الميثاق §12)
```
Common MS Core      src/server/packs/core.ts        عمليات مشتركة + 17 مجالاً + تعارضات
Standard Packs      standards / standard_editions / license_grants (DB)  + blueprint-engine
Industry Packs      src/server/packs/industries.ts  7 حزم مستقلة
Jurisdiction Packs  regulatorsToVerify (فرضيات بحالة NEEDS_SOURCE_VERIFICATION) → جدول مستقل في P6
```

## تدفق الاستشارة
```
Intake (answers) ─► facts (provenance) ─► gate (critical+conflicts) ─► Blueprint (rules:v1)
   ─► client scope approval ─► job: generate_documents ─► controlled_documents + versions (DRAFT)
   ─► edit ─► submit ─► approve (≠ author, no [MISSING]) ─► effective ─► revision ─► supersede
```

## حدود الأمان
| الحد | الآلية |
|---|---|
| مستأجر ↔ مستأجر | RLS + دور قاعدة بيانات بلا BYPASSRLS + `resolveCtx` من قاعدة البيانات + اختبارات عزل + 404 للمعرّفات الأجنبية |
| دور ↔ دور | مصفوفة صلاحيات في `rbac.ts` تُفحص في كل دالة مجال |
| مُعدّ ↔ معتمد | فحص في المجال + محفز قاعدة بيانات `SEGREGATION_OF_DUTIES` |
| سجل الأحداث | صلاحيات INSERT/SELECT فقط للتطبيق |
| الإصدار الساري | محفز يمنع تعديل محتوى أي إصدار غير مسودة وأي انتقال غير مشروع |
| نص العميل ↔ تعليمات AI | تغليف `<client_data>` + مدقق مستقل للمخرج |

## هيكل الملفات
```
iso-platform/
  db/migrations/          0001_core, 0002_grants_and_reference, 0003_capa
  scripts/                db-setup.sh, migrate.ts, worker.ts, e2e.ts, render-sample.ts
  src/server/             db.ts, rbac.ts, errors.ts, web.ts
    domain/               auth, tenant, orgs, projects, blueprint-engine, documents, jobs, capa
    packs/                types, core, industries, index
    docs/                 writer (rules:v1), labels, docx, pdf, package (ZIP)
    ai/                   gateway
  src/app/                الصفحات (تسويق، دخول، تهيئة، /app/...)
  tests/                  engine, auth-rbac, isolation, flow, ai, exports, capa (+ golden dataset)
  docs/                   وثائق P0
```

## المفاضلات
- **Server Actions بدلاً من REST عام الآن:** أسرع وأقل سطح هجوم؛ واجهة REST/OpenAPI تُضاف لطبقة المجال نفسها عند الحاجة للتكاملات (P4).
- **SQL صريح بدلاً من ORM:** RLS والمحفزات والصلاحيات واضحة ومراجَعة؛ الثمن: أنواع يدوية للصفوف.
- **لا serverless وحدها للعمليات الطويلة:** العامل المستقل إلزامي في الإنتاج.
