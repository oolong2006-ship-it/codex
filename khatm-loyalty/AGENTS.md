# AGENTS.md — Khatm loyalty (`khatm-loyalty/`)

Independent product inside this monorepo. It shares no code, dependencies or database with MASAR 34,
the ISO platform or Alnadeg.

## Stack
Next.js 16 (App Router, Server Actions, route handlers) · React 19 · Tailwind 4 · PostgreSQL 16 via raw `pg`
· zod · node-forge (Apple pass signing) · jose (Google Wallet JWT) · Vitest · Playwright.

## Commands
`npm run dev` (port 3200) · `npm run typecheck` · `npm test` · `npm run build` · `npm run test:e2e` ·
`npm run db:migrate` · `npm run db:seed` · `npm run worker` · `npm run verify` (gate before pushing).

## Rules
- **Arabic first.** Every user-facing string goes in `src/lib/i18n.ts` as an `{ ar, en }` pair. Errors are
  `AppError("errors.<key>")` and are translated at the edge (`errorMessage`, `apiError`). Code and comments are English.
- **Tenant isolation.** All domain functions take an `Actor` built on the server from the session row
  (`actorFromToken`). Every query on tenant data filters `merchant_id = actor.merchantId`. Never accept a
  merchant id, role or branch from a request body. Out-of-tenant rows are reported as not found.
- **Permissions** come from `src/server/rbac.ts`; call `requirePermission(actor, PERMISSIONS.X)` first in every domain function.
- **State changes that affect wallets or messages** must `enqueue()` an outbox job inside the same transaction
  (`tx(...)`) and `onCommit(scheduleDrain)`. Never call Apple/Google/WhatsApp inside a transaction.
- **Stamping** goes through `addStamps`/`redeemReward` only (row lock + cooldown + event log).
- **Migrations** are append-only SQL files in `db/migrations/NNN_name.sql`.
- **Secrets** only via env (`.env.example` documents all of them). Wallet certificates live outside the repo.
- Tests that touch the database use `tests/helpers.ts` (`resetDb`, `makeMerchant`, `makeCard`).
