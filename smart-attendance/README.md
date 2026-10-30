# Smart Attendance OS

منصة SaaS للحضور والانصراف من جوال الموظف، دون أجهزة بصمة.

- الميثاق: [`CLAUDE.md`](./CLAUDE.md)
- المواصفات الملزمة: [`docs/specs.md`](./docs/specs.md)
- برومتات المراحل: [`prompts/`](./prompts)
- الحالة الحالية: [`docs/status.md`](./docs/status.md) — المرحلة 1 (الأساس الآمن) منتهية
- ملخص المرحلة 0: [`docs/phase-0-summary.md`](./docs/phase-0-summary.md)

## التشغيل المحلي

```bash
cp .env.example .env            # قيم تطوير فقط
docker compose up -d --wait     # Postgres 16 + PostGIS، وRedis
pnpm install
set -a && . ./.env && set +a
pnpm db:migrate && pnpm db:seed # عميلان A وB + مسؤول منصة (platform@sa.dev)
pnpm dev                        # API على :3000 — التوثيق على /docs
pnpm lint && pnpm typecheck && pnpm test
```

- الاختبارات تنشئ قاعدة `smart_attendance_test` نظيفة في كل تشغيل.
- حسابات seed: `admin@a.dev`، `hr@a.dev`، `manager1@a.dev`، `emp1@a.dev`… (وكذلك `@b.dev`)، وكلمة المرور من `SEED_PASSWORD`. أدوار HR والإدارة تطلب تفعيل TOTP عند أول دخول.
- `apps/api/openapi.json` يُولَّد بـ `pnpm openapi` ويفحصه CI.

## لوحة الإدارة (apps/admin)

الواجهة للإدارة والمدراء: الحضور اللحظي، والاستثناءات، والجلسات والكشوف، وتقرير الورديات، وإدارة الورديات، وفترات الحضور، والأجهزة، والموظفون.

```bash
pnpm --filter @sa/admin build
API_BASE_URL=http://localhost:3000 pnpm --filter @sa/admin start   # http://localhost:3100
```

- الجلسة: رمز الوصول ورمز التحديث في ملفات كوكيز `httpOnly`، ولا يصل أي منهما إلى JavaScript في المتصفح. التجديد يتم في الوسيط (middleware).
- الخادم هو صاحب القرار: الواجهة تخفي الأزرار حسب الصلاحيات، والـ API يفرضها.
- الروابط بلا `prefetch` لتقليل طلبات التجديد المتزامنة (رمز التحديث يُدار بتدوير وكشف إعادة الاستخدام).

