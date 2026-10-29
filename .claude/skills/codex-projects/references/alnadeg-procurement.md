# Alnadeg procurement portal (`alnadeg-procurement/`)

Purchase-request and approval system for the branches of Alnadeg restaurants.
It is fully Arabic and RTL, and works on mobile, tablet and desktop. The
README (Arabic) is thorough, so read its security section before changing
auth, RLS or storage.

## Architecture

- The frontend is Next.js 15 with **`output: "export"`**. It is a static
  site with no Node server, so there are no server components fetching data,
  no Server Actions and no API routes. Pages are client components talking to
  Supabase directly (RLS-protected) or to the Edge Function.
- The backend is Supabase:
  - Postgres with RLS on every `public` table. Sensitive functions live in the
    unexposed `app` schema with a pinned `search_path` and `EXECUTE`
    revoked from `PUBLIC`.
  - Auth uses **phone + password with no SMS**. The phone is normalised to
    `9665XXXXXXXX`, mapped to `9665XXXXXXXX@phone.alnadeg.local` and signed in
    with `signInWithPassword`.
  - Storage is the private bucket `procurement-documents` with path
    `location_id/request_id/document_type/uuid.ext`. Signed URLs live for 60
    seconds. Type and size are checked server-side **after** upload, and
    files that fail the check are deleted.
  - One Edge Function, `supabase/functions/procurement-portal/index.ts`
    (Deno), serves JSON only (never HTML). It routes on `route === "…" &&
    req.method === "…"`: `health`, `activation/verify`, `activate`,
    `admin/users`, `documents/sign-upload|confirm-upload|sign-download` and
    `reports/export`. It is deployed with `--no-verify-jwt`, and each route
    authenticates itself through `requireCaller`. It uses the service role
    and calls DB functions with `svc.rpc(...)`.
- The frontend can't be hosted on the Edge Function, because Supabase serves
  it as `text/plain` under a CSP that blocks JS. Host it on
  Vercel/Netlify/Cloudflare Pages from `out/`.

## Domain

Roles (`profiles.role`, never `user_metadata`): `super_admin`, `requester`,
`production_officer`, `branch_manager`, `production_manager`, `procurement`
and `finance`.

The approval flow is `APPROVAL_FLOW` in `src/lib/constants.ts`:
production_officer → branch_manager → production_manager → procurement →
finance. There are 11 statuses: draft, submitted, one pending status per
stage, returned, rejected, completed and cancelled.

Two rules must never break:
1. No financial close before the ERP invoice-entry document is attached.
2. Only `super_admin` may skip stages, and must give a reason that goes to the
   audit log.

Approval is atomic: a row lock (`FOR UPDATE`), a stage condition and a unique
index make double-approving a stage impossible. The audit log is read-only
(writes revoked, `FORCE ROW LEVEL SECURITY`).

## Layout

- `src/app/(portal)/` holds the authenticated screens (`dashboard`,
  `requests`, `request?id=`, `approvals`, `reports`, `profile` and
  `admin/{users,locations,audit}`). `login`, `activate` and
  `change-password` sit at top level. Because the export is static, dynamic
  pages use query strings (`/request?id=…`), not `[id]` segments.
- `src/lib/` holds `supabase.ts` (client and `API_BASE`), `api.ts`
  (`callApi<T>(path, { method, body, auth })`, which throws `ApiError` with
  an Arabic message), `auth-context.tsx`, `constants.ts`, `labels.ts` (Arabic
  labels for roles, stages and statuses), `validation.ts` (zod), `format.ts`
  and `data.ts`.
- `src/types/database.ts` holds the DB types.
- `src/components/` holds `RequestForm`, `Timeline`, `StatusBadge`,
  `FileUpload`, `Attachments` and `ui`.
- `supabase/migrations/` holds five idempotent migrations (core schema,
  functions, RLS, reference seed with 27 locations, admin functions).
  `supabase/tests/*.sql` holds the DB test suites (workflow, security,
  activation).
- `deploy/` holds single-file SQL and Edge bundles built by `npm run
  build:deploy` for pasting into the Supabase dashboard.

## Conventions to copy

- Migrations must stay **re-runnable** (`IF NOT EXISTS`, `CREATE OR
  REPLACE`, guarded inserts). Never write destructive changes. Every `UPDATE`
  policy needs both `USING` and `WITH CHECK`. No policy may rely on `TO
  authenticated` alone. `anon` gets nothing.
- Anything privileged (creating users, signing storage URLs, activation,
  exports) goes through the Edge Function, never the browser. Keep
  user-facing errors Arabic and generic, and log technical detail
  server-side only.
- Labels and statuses go in `labels.ts`/`constants.ts`, and
  `tests/workflow.test.ts` asserts them (test names are Arabic).
- After changing `supabase/functions/**` or migrations, rebuild `deploy/`
  with `npm run build:deploy` so the paste-in bundles match.

## Commands (inside `alnadeg-procurement/`)

```bash
npm install
cp .env.example .env.local       # NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY
npm run dev                      # :3000
npm run verify                   # typecheck + vitest + static build
npm run db:test                  # migrations + SQL tests on a throwaway local Postgres
npm run lint
```

`npm run acceptance` (25 live acceptance tests) and `npm run db:inspect` hit
the **live** Supabase project and need the service-role key. Don't run them
unless the user asks.

## CI and deploy

There is **no CI on pull requests** for this project. Run `npm run verify` and
`npm run db:test` yourself before pushing. The workflows are:
- `alnadeg-deploy-site.yml` deploys the static site on push to
  `claude/alnadeg-procurement-portal-6urp3o` (or on manual dispatch).
- `alnadeg-setup-supabase.yml`, `alnadeg-acceptance.yml` and
  `alnadeg-check-secrets.yml` are manual only and touch the live Supabase
  project (`wdtylpgeyjuetarwtbev`). Never trigger them without explicit
  approval.
