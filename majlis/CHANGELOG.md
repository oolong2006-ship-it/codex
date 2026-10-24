# سجل التغييرات

## [المرحلة 0] — 2026-10-24

### أُضيف

- Monorepo بـ pnpm workspaces و Turborepo داخل `majlis/`، معزول عن بقية المستودع.
- `apps/web`: Next.js 15 + Tailwind 4، مسار `/[locale]` بالعربية افتراضياً، RTL كامل، خط IBM Plex Sans Arabic مستضاف ذاتياً، و`Permissions-Policy` يمنع الكاميرا.
- `apps/voice-gateway`: خادم Fastify فيه `/healthz` ونقطة WebSocket محجوزة للمرحلة 3.
- `apps/worker`: سجل المهام (`final-transcription`, `analyze-session`, `update-personas`, `retention-sweep`).
- `packages/providers`: واجهات ASR / TTS / LLM / الهاتف / واتساب، مزودات `mock` حتمية، واختيار المزود من متغيرات البيئة.
- `packages/i18n`: ملفات `ar` و `en` بمفاتيح مُنمَّطة، واختبار تطابق المفاتيح.
- حزم مبدئية: `dialect` (قائمة اللهجات)، `interviewer` (مراحل المقابلة)، `db`.
- `voice-lab/`: هيكل Python مع فاحص بنية مجموعات البيانات واختباراته.
- `docker-compose.yml` (PostgreSQL + pgvector، Redis، MinIO)، `.env.example`، و`docs/ARCHITECTURE.md`.
- CI مستقل `.github/workflows/majlis-ci.yml` لا يعمل إلا عند تغيّر `majlis/**`.

### الاختبارات

- Node: 12 اختباراً ناجحاً (providers 5، i18n 4، worker 2، voice-gateway 1).
- voice-lab: 3 اختبارات ناجحة.
- format و lint و typecheck و build: ناجحة.
