# مجلس

منصة سعودية لأبحاث المستهلك: مقابلات **صوتية** يديرها مساعد ذكي يُفصح عن هويته، باللهجات السعودية، مع تحليل يبني «ذاكرة مستهلك» تتراكم مع كل دراسة.

> الحالة: **المرحلة 0** (الهيكل). انظر [`CHANGELOG.md`](CHANGELOG.md) و [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

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
pnpm dev          # web على :3000 ، voice-gateway على :4100
```

## الفحوصات

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

ولمختبر الصوت: راجع [`voice-lab/README.md`](voice-lab/README.md).

## قواعد

- لا مفاتيح API في الكود. كل الإعدادات تأتي من متغيرات البيئة (`.env.example`).
- كل نص يظهر للمستخدم مكانه `packages/i18n/messages`، والعربية هي اللغة الافتراضية.
- الكود والأسماء البرمجية بالإنجليزية، والتوثيق الموجّه للمستخدم بالعربية.
