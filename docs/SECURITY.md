# Security notes

Security is enforced on the **server**, never on the frontend alone. The UI hides controls a
role can't use, but every mutating action independently re-checks permission and tenant scope.

## Authentication
- NextAuth credentials provider; passwords hashed with **bcrypt** (cost 12).
- JWT sessions (8h). `NEXTAUTH_SECRET` must be a strong random value in production.
- Session carries `role` and `organizationId`; these are read from the token, never from client input.

## Authorization (RBAC)
- A single permission catalogue (`src/lib/rbac.ts`) maps roles → permissions.
- Server Actions call `requireUser` / `requirePermission` / `requireProcurement`
  (`src/lib/session.ts`) before any write.
- `src/middleware.ts` gates whole route trees (procurement vs supplier) as defense-in-depth.

## Tenant isolation
- Every tenant-owned query filters by `organizationId` from the session.
- Cross-tenant object access is impossible through the actions: lookups use
  `findFirst({ where: { id, organizationId } })`, so an id from another tenant resolves to null.

## File upload safety
- MIME-type allowlist and configurable size cap (`MAX_UPLOAD_MB`) in `src/lib/storage.ts`.
- Stored under a tenant/supplier-scoped key with a random UUID filename (no user-controlled paths).
- Downloads go through `/api/documents/[id]`, which authenticates, authorizes (owner or
  procurement in-tenant), and streams with `Cache-Control: private, no-store`.

## Input validation & sanitization
- All action inputs validated with zod before persistence.
- Prisma parameterizes all queries (no string-concatenated SQL) — SQL injection safe.
- React escapes rendered output by default (XSS safe); no `dangerouslySetInnerHTML` is used.

## Auditability
- `activity_logs` records supplier registration, document upload/verification, profile edits,
  status changes, notes, evaluations, and info requests — with actor, target, and timestamp.
- `supplier_status_history` is an append-only record of every status transition.

## AI safety
- AI-extracted products are stored in a review queue and **require explicit human approval**
  before entering the live catalog — AI output is never trusted blindly.
- The AI layer degrades to a deterministic heuristic when `ANTHROPIC_API_KEY` is absent, so no
  data leaves the environment unless a key is configured.

## Hardening checklist for production
- [ ] Strong `NEXTAUTH_SECRET`; HTTPS + secure cookies
- [ ] Move file storage to S3/Supabase with signed URLs
- [ ] Add rate limiting (e.g. middleware or a WAF) on auth and registration
- [ ] Add OTP/email verification on supplier sign-up (registration is structured for it)
- [ ] Row-Level Security in Postgres as a second isolation layer
- [ ] Rotate and scope the Anthropic key; log AI usage
