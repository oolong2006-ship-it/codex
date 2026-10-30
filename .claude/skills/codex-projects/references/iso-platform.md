# ISO platform (`iso-platform/`)

Arabic-first SaaS for consulting on and running ISO 9001:2026 management
systems. Start with `docs/PROGRESS.md`, which says what is done, what is next
and how to resume. `docs/DECISIONS.md` holds the ADRs and the open founder
decisions (D-01…D-10). Don't build anything that depends on an open decision
(payments, pricing, ZATCA, email, AI key, hosting) without saying so.

## Architecture decisions to respect (ADR 001–008)

- Next.js 16 + React 19 with **Server Actions** instead of a REST API. The
  only `src/app/api/` routes are `health`, file downloads and exports.
- **Raw SQL with `pg` and explicit migrations** in `db/migrations/NNNN_*.sql`.
  There is no ORM, and Prisma was rejected.
- **Isolation by Postgres RLS.** The app connects as `iso_app` (no
  BYPASSRLS). Every tenant table has `ENABLE ROW LEVEL SECURITY` plus a
  `tenant_isolation` policy on `org_id = app_org_id()`. Only migrations and
  scripts use the owner role `iso_owner` (`MIGRATION_DATABASE_URL`).
- Background jobs run on a Postgres job queue (`SKIP LOCKED`) with a separate
  worker (`npm run worker`).
- Document content comes from the deterministic `rules:v1` engine. AI is
  optional and assistive, and an independent validator checks its output.
  Never reproduce ISO standard text. Mark requirements as
  `REQUIRED_UNVERIFIED` until a licence exists.
- The editor is plain structured text (`##` headings and `|` tables), not
  WYSIWYG.

## Layout

- `src/server/db.ts` provides `withTenant(orgId, userId, fn)`, which sets
  `app.org_id`/`app.user_id` inside a transaction, and `withGlobal` for
  global tables only.
- `src/server/domain/tenant.ts` provides `resolveCtx` (reads the role from
  `memberships`), `tx(ctx, permission, fn)` (permission check plus tenant
  transaction) and `audit(db, ctx, action, entityType, entityId, data)`.
- `src/server/rbac.ts` defines 5 roles (`OWNER`, `QUALITY_MANAGER`,
  `CONTRIBUTOR`, `AUDITOR`, `VIEWER`), a `PERMISSIONS` list, `can` and
  `assertCan`.
- `src/server/domain/*.ts` holds the business logic (`auth`, `orgs`,
  `projects`, `blueprint-engine`, `documents`, `jobs`, `capa`). Each file has
  zod schemas, state machines and SQL.
- `src/server/docs/` handles DOCX (`docx`), PDF (Chromium through
  `playwright-core`, embedded IBM Plex Sans Arabic, JS disabled, network
  blocked) and ZIP packages.
- `src/server/packs/` holds the core pack and 7 sector packs.
- `src/server/web.ts` provides the page/action helpers `requireCtx`, `str(fd,
  k)`, `back(path, 'ok'|'err', msg)`, `act(path, okMsg, fn)` and
  `errorMessage`.
- `src/components/ui.tsx` provides `PageHeader`, `Flash`/`flash`, `Badge`,
  `StatusBadge`, `Field`, `Empty` and the `SP` search-params type.
- `src/app/app/<feature>/` holds the authenticated pages (`projects`,
  `documents`, `capa`, `members`, `org`, `audit`, `standards`).

## Conventions to copy

- Domain functions take `ctx: TenantCtx` and do all DB work inside
  `tx(ctx, '<permission>', async (db) => …)`. Never query tenant tables
  outside `withTenant`/`tx`.
- Validate input with zod. Messages are Arabic (`"العنوان قصير جداً"`).
- Throw `DomainError(code, arabicMessage)` (`NOT_FOUND`, `FORBIDDEN`, …).
  Validate UUIDs before querying. Load rows for mutation with `FOR UPDATE`.
- Record every state change with `audit(...)`. Timestamps are server-side
  only, so nothing can be backdated.
- State machines are enforced twice: in the domain function
  (`requireStatus`) and in DB triggers (see `0003_capa.sql`). Evidence tables
  are append-only: grant `SELECT, INSERT` only.
- Per-org sequential codes use `org_counters` with `INSERT … ON CONFLICT DO
  UPDATE … RETURNING`. See `nextCode` in `capa.ts` for the `NC-2026-0001`
  pattern.
- Pages are async server components. Forms post to inline `"use server"`
  actions that call the domain function, then `redirect` with `?ok=` or call
  `back(..., 'err', errorMessage(e))`.
- A new migration needs `ENABLE ROW LEVEL SECURITY`, a `tenant_isolation`
  policy and explicit `GRANT`s to `iso_app` for every new tenant table. Add a
  case to `tests/isolation.test.ts`.

## Commands (inside `iso-platform/`)

```bash
npm ci
PGSUPER_URL=postgresql://postgres:postgres@localhost:5432/postgres bash scripts/db-setup.sh
cp .env.example .env && set -a && . ./.env && set +a
npm run db:migrate
npm run verify            # typecheck + vitest (real Postgres + RLS) + build
npm start                 # http://localhost:3100
npm run worker            # job worker
npx tsx scripts/e2e.ts    # browser E2E checks
```

Tests in `tests/` hit a real Postgres (`global-setup.ts`). PDF tests need
Chromium (`npx playwright-core install chromium`) and `poppler-utils`.

## CI and deploy

`.github/workflows/iso-platform-ci.yml` (Node 22) runs db-setup, migrate,
typecheck, test, build and `npm audit --omit=dev --audit-level=high`. It runs
only when `iso-platform/**` changes. A new dependency with a high-severity
advisory fails CI.

Render deploys `iso-platform/Dockerfile` from branch
`claude/global-iso-platform-p0-p1` (`render.yaml`, free plan, Frankfurt).

## Open items (from PROGRESS.md)

Client document upload and analysis, the remaining P3 modules (internal audit,
management review, KPIs, suppliers, training, complaints linked to CAPA,
evidence upload), the full English UI, MFA, RLS on `users`, CSP and global
rate limiting.
