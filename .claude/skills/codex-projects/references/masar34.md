# MASAR 34 (`apps/api`, `apps/web`)

Multi-tenant crowd, queue and operations platform. It runs end to end without
sensors through a built-in simulation engine. The root `README.md` has the
honest status matrix (✅ / 🟡 / ⚪). Check it before assuming a feature exists.

## Layout

- `apps/api/src/<module>/` holds one NestJS module per domain: `alerts`,
  `incidents`, `crowd`, `queues`, `gates`, `zones`, `venues`, `events`,
  `tasks`, `users`, `organizations`, `dashboard`, `simulator`, `health`.
  Each module has `*.module.ts`, `*.controller.ts`, `*.service.ts` and
  `*.dto.ts`.
- `apps/api/src/common/` holds the shared pieces:
  - `rbac.ts` is the single source of truth for `ROLES`, `PERMISSIONS`
    (`resource:action`) and `ROLE_PERMISSIONS`. The seed reads from it, so the
    database and the guards never drift.
  - `tenant.ts` provides `tenantWhere` and `resolveOrgId`.
  - `analytics.ts` holds pure forecasting and queue maths. It is
    unit-tested in `analytics.spec.ts`.
  - `decorators/` provides `@CurrentUser`, `@RequirePermissions` and `@Public`.
- `apps/api/src/realtime/events.gateway.ts` is the socket.io gateway on
  namespace `/realtime`. Clients join room `org:<id>`, and services call
  `gateway.emitToOrg(orgId, 'entity:event', payload)`.
- `apps/api/prisma/` holds `schema.prisma`, `migrations/` and `seed.ts`.
- `apps/web/src/app/(app)/` holds the authenticated pages (`dashboard`,
  `crowd`, `queues`, `alerts`, `simulation`). `login/` is public.
- `apps/web/src/lib/` holds `api.ts` (fetch wrapper, token in
  `localStorage`), `i18n.ts` (`dict` of `{ ar, en }` pairs, `DEFAULT_LANG =
  'ar'`) and `lang-context.tsx`.

## Conventions to copy

A new controller looks like the existing ones:

```ts
@ApiTags('alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('alerts')
export class AlertsController {
  @Get()
  @RequirePermissions(PERMISSIONS.ALERTS_READ)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: AlertQueryDto) { … }
}
```

- Every service method takes `user: AuthenticatedUser` first.
- Reads use `where: tenantWhere(user, { …filters })`. Single-row lookups of
  tenant data use `findFirst({ where: tenantWhere(user, { id }) })`, never
  `findUnique({ where: { id } })`, because `findUnique` skips the tenant
  filter. The global lookups in `auth` and `users` (by unique email) are the
  only `findUnique` calls.
- Writes take the org from `resolveOrgId(user, dto.organizationId)` and strip
  `organizationId` from the DTO before spreading it into `data`.
- Throw `NotFoundException` for missing or out-of-tenant rows. Don't
  distinguish the two cases.
- After a state change, emit over the gateway: `<entity>:new` /
  `<entity>:updated`.
- New permissions go into `PERMISSIONS` and `ROLE_PERMISSIONS` in
  `common/rbac.ts`, then into the seed.
- Business logic that can be pure (risk, density, forecasts, state
  machines) lives in pure functions with a Jest spec next to it. See
  `analytics.spec.ts` and `events.service.spec.ts`.
- Web strings go into `apps/web/src/lib/i18n.ts` as `{ ar, en }`. Colours use
  the Tailwind `masar-*` palette and the `risk.safe|watch|busy|danger|critical`
  scale.

## Commands (from repo root)

```bash
npm install
npm run db:generate          # prisma generate (needed before typecheck/test)
npm run db:migrate           # prisma migrate deploy
npm run db:seed              # demo org, venue, event and 7 demo users
npm run dev                  # API :4000 (Swagger at /api/docs), web :3000
npm run lint && npm run typecheck && npm run test
npm run build
```

New schema changes use `npm run db:migrate:dev --workspace=apps/api` to create a
migration. Demo users share `SEED_DEMO_PASSWORD`, and the README lists the
emails. `docker compose up --build` runs Postgres, Redis, API and web together.

## CI

`.github/workflows/ci.yml` has two jobs. **API** runs lint, typecheck, Jest and
build against Postgres 16. **Web** runs lint, typecheck and build with
`NEXT_PUBLIC_API_URL`. Both run on every push to every branch, even when only
the other products changed.

## Known gaps

- `EventsGateway.handleJoin` accepts any `organizationId` from any socket
  without checking a JWT. Any client can subscribe to another tenant's live
  stream. Fix it by verifying the token in `handleConnection` and joining only
  the user's own org (super admins excepted). Do this before relying on
  realtime isolation.
- Partner portal, fan PWA, field-ops mobile, report export, the digital twin
  and the Prophet/XGBoost service are scaffolded or documented only (see the
  README status matrix and `ROADMAP.md`).
