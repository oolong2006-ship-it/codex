# Taqam API · واجهة طاقم البرمجية

NestJS 10 + Prisma 5 + PostgreSQL. All labor-law math (GOSI, EOSB, overtime, payslips, leave, attendance, geofence, WPS, Nitaqat) comes from `@taqam/core` (`../../packages/core`).

## English

```bash
cd packages/core && npm install && npm run build     # core must be built first
cd ../../apps/api && npm install
cp .env.example .env                                # adjust DATABASE_URL / JWT_SECRET
npm run db:migrate                                  # prisma migrate deploy
npm run db:seed                                     # demo company "مطاعم ورد الشام" (idempotent)
npm run dev                                         # or: npm run build && npm start
```

- Base URL `http://localhost:4100/api`, Swagger at `/api/docs`, health at `/api/health`.
- Demo logins (password `Taqam@2026`): `owner@`, `hr@`, `payroll@`, `manager@`, `employee@taqam.demo`.
- Scripts: `typecheck`, `build`, `test` (unit), `test:e2e` (creates/resets `taqam_test` from `TEST_DATABASE_URL`), `db:generate`, `db:migrate`, `db:seed`, `db:reset`.
- Errors are always `{ statusCode, message, messageAr? }`. Money is returned as numbers, calendar days as `YYYY-MM-DD`.
- Docker (context = repo root): `docker build -f apps/api/Dockerfile -t taqam-api .` — runs `prisma migrate deploy` on start.

## العربية

```bash
cd packages/core && npm install && npm run build
cd ../../apps/api && npm install && cp .env.example .env
npm run db:migrate && npm run db:seed && npm run dev
```

- الواجهة على `http://localhost:4100/api` والتوثيق التفاعلي على `/api/docs`.
- حسابات التجربة (كلمة المرور `Taqam@2026`): المالك، الموارد البشرية، الرواتب، مدير فرع العليا، وموظف.
- كل الحسابات النظامية (التأمينات، نهاية الخدمة، الإضافي، قسائم الرواتب، الإجازات، النطاق الجغرافي، ملف حماية الأجور، نطاقات) تتم عبر مكتبة `@taqam/core`.
- كل البيانات معزولة حسب المنشأة، ومدير الفرع يرى موظفي فرعه فقط، والموظف يصل إلى الخدمة الذاتية `/me` فقط. كل عملية تعديل تُسجَّل في سجل التدقيق.
- رسائل الأخطاء تتضمن `messageAr` بالعربية.
