# مجلس

منصة سعودية لأبحاث المستهلك: مقابلات **صوتية** يديرها مساعد ذكي يُفصح عن هويته، باللهجات السعودية، مع تحليل يبني «ذاكرة مستهلك» تتراكم مع كل دراسة.

> الحالة: **المرحلة 4** (لوحة العميل وتجربة المشارك). انظر [`CHANGELOG.md`](CHANGELOG.md) و [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## المتطلبات

- Node.js 22 أو أحدث، و pnpm 10 (`corepack enable`)
- Docker (لقاعدة البيانات و Redis و MinIO محلياً)
- Python 3.11 أو أحدث (لمختبر الصوت فقط)

## التشغيل محلياً

```bash
cd majlis
cp .env.example .env
docker compose up -d
pnpm install
pnpm build
pnpm --filter @majlis/db db:migrate
SEED_EMAIL=you@example.com SEED_PASSWORD='12+ characters' pnpm --filter @majlis/db db:seed
pnpm dev          # web على :3000 ، voice-gateway على :4100
```

ثم ادخل من `http://localhost:3000/ar/login`.

| الشاشة       | المسار                                       |
| ------------ | -------------------------------------------- |
| لوحة العميل  | `/ar/dashboard`                              |
| دراسة جديدة  | `/ar/dashboard/studies/new`                  |
| صفحة المشارك | `/ar/p/<رمز الدعوة>`، يظهر في تبويب «الدعوة» |

## الفحوصات

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

اختبارات قاعدة البيانات تحتاج `DATABASE_URL_TEST`. كل حزمة تنشئ قاعدتها المعزولة منه.

```bash
DATABASE_URL_TEST=postgresql://majlis:majlis_dev_password@localhost:5432/majlis_test pnpm test
pnpm --filter @majlis/web test:e2e              # الرحلة كاملة في متصفح حقيقي (بعد pnpm build)
pnpm --filter @majlis/voice-gateway test:browser
```

ولمختبر الصوت: راجع [`voice-lab/README.md`](voice-lab/README.md).

## قواعد

- لا مفاتيح API في الكود. كل الإعدادات تأتي من متغيرات البيئة (`.env.example`).
- كل نص يظهر للمستخدم مكانه `packages/i18n/messages`، والعربية هي اللغة الافتراضية.
- الكود والأسماء البرمجية بالإنجليزية، والتوثيق الموجّه للمستخدم بالعربية.
