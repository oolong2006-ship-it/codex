# Khatm loyalty (`khatm-loyalty/`)

Arabic-first SaaS: stamp cards in Apple/Google Wallet, a cashier PWA and a merchant dashboard. Start with
`khatm-loyalty/AGENTS.md` and `khatm-loyalty/docs/ARCHITECTURE.md`; the README has the honest status matrix.

- Domain logic lives in `src/server/domain/*` and takes an `Actor` first. `Actor` is built only by
  `actorFromToken` from a session cookie (`khatm_session` dashboard, `khatm_pos` cashier device).
- Tenant scoping: every query filters `merchant_id = actor.merchantId`; never `findById` without it.
- Permissions: `src/server/rbac.ts` + `requirePermission`.
- Wallet/message side effects: `enqueue()` inside `tx()` + `onCommit(scheduleDrain)`; `npm run worker` retries.
- Strings: `src/lib/i18n.ts` (`{ ar, en }`), errors are `AppError("errors.<key>")`.
- Checks: `npm run verify` (typecheck + 43 Vitest tests on real Postgres + build) and `npm run test:e2e`.
  Local DB: `npm run db:setup && npm run db:migrate && npm run db:seed`.
- CI: `.github/workflows/khatm-loyalty-ci.yml` (path-filtered to `khatm-loyalty/**`). No deploy branch yet.
