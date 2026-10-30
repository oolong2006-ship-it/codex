# AI_CONTRACTS — عقود المهام والتقييم والتكلفة

## المبدأ
محرك واحد للتنسيق مع أدوار منطقية؛ المهام الحتمية (الترقيم، البوابات، الصلاحيات، الانطباق، توليد المحتوى الأساسي، DOCX) لا تستخدم نموذجاً لغوياً. الذكاء الاصطناعي مساعد اختياري ولا يصح أن يتحقق من مخرجه بنفسه.

## الأدوار المنفذة
| الدور | التنفيذ | النوع |
|---|---|---|
| Intake Consultant | `packs/index.ts` (nextQuestion/branching) | حتمي |
| Industry Specialist | `packs/industries.ts` | معرفة مُراجعة |
| Organization Architect / QMS Systems Designer | `blueprint-engine.ts` (rules:v1) | حتمي |
| Risk & Opportunity Analyst | فرضيات الحزم (INFERRED) | حتمي |
| Policy & Procedure Writer / Forms Engineer | `docs/writer.ts` (rules:v1) | حتمي |
| Consistency / Quality Gate Controller | `detectConflicts`، `findPlaceholders`، محفزات DB | حتمي |
| Editorial (AI) | `suggestSectionRewrite` (rewrite-section@1) | AI + مدقق مستقل |
| Editorial & Document Renderer | `docs/docx.ts` | حتمي |

## عقد مهمة AI (`runAiTask`)
- المدخلات: taskType، promptVersion، system، instruction، untrustedData (مغلفة `<client_data>`)، maxTokens، validate().
- قبل الاستدعاء: فحص سقف التكلفة الشهري للمستأجر (`AI_MONTHLY_BUDGET_USD`).
- بعده: مدقق حتمي (لا أرقام/تواريخ جديدة، لا حذف لعلامات MISSING، لا ادعاء اعتماد/توقيع، حد طول).
- التسجيل: `model_runs` (provider، model، prompt_version، tokens، cost_usd، status، error_code) — المحاولات الفاشلة والمرفوضة تُسجل في معاملة مستقلة كي لا تضيع تكلفتها (خلل اكتشفه اختبار وأُصلح).
- المخرج لا يُحفظ تلقائياً؛ الإنسان يقرر.

## المزودون
- `AnthropicProvider` — SDK الرسمي، النموذج الافتراضي `claude-opus-5-5` ($4/$20 لكل مليون رمز)، `output_config.effort: medium`، وfallback الخادم `fallbacks: "default"` (beta server-side-fallback-2026-07-01)؛ معالجة `refusal` و`max_tokens` كفشل.
- مزودون آخرون (OpenAI/Gemini) يُضافون بتطبيق `AiProvider` نفسه.
- بلا مفتاح API: الميزة معطلة بوضوح (GATE_BLOCKED) والمنصة تعمل كاملة بالمحرك الحتمي.

## الحقول المطلوبة في الميثاق §8 — التغطية
task_id (jobs.id)، tenant_id (org_id)، project_id (payload)، status، retry_count (attempts)، timestamps، error_code (last_error/model_runs.error_code)، model/prompt_version (model_runs + document_versions.generated_by)، cost (model_runs.cost_usd). مخطط: input/output_schema معلنة لكل نوع مهمة، reviewer لمهام المراجعة البشرية (review_tasks) في P3/P4.
