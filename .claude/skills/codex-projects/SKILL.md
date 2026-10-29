---
name: codex-projects
description: Map of this repository's three products — MASAR 34 (crowd management, apps/), the ISO 9001 platform (iso-platform/) and the Alnadeg procurement portal (alnadeg-procurement/) — with each one's stack, conventions, commands, CI and deploy branch. Use before reading, changing, testing or deploying code anywhere in this repository.
---

# Repository map

This repository holds three independent products. They share no code, no
dependencies and no database. Work out which one a task belongs to first, then
read its reference file before touching code:

| Directory | Product | Stack | Reference |
|---|---|---|---|
| `apps/api`, `apps/web` (root `package.json` workspaces) | **MASAR 34** — crowd, queue and operations management for stadiums and events | NestJS 10 + Prisma + socket.io / Next.js 14 + Tailwind | [references/masar34.md](references/masar34.md) |
| `iso-platform/` | **ISO 9001:2026 consulting & QMS SaaS** | Next.js 16 + React 19 Server Actions + raw `pg` + Postgres RLS | [references/iso-platform.md](references/iso-platform.md) |
| `alnadeg-procurement/` | **Alnadeg restaurants procurement portal** — purchase requests with a 5-stage approval flow | Next.js 15 static export + Supabase (Postgres RLS, Auth, Storage, one Edge Function) | [references/alnadeg-procurement.md](references/alnadeg-procurement.md) |

The root `*.md` files (`ARCHITECTURE.md`, `API.md`, `DATABASE.md`,
`SECURITY.md`, `SIMULATION.md`, `ROADMAP.md`, …) describe **MASAR 34 only**.
The other two products keep their docs inside their own directory.

## Rules that hold across all three

- **Arabic first, RTL.** Every product defaults to Arabic. User-facing strings,
  validation messages and error messages are Arabic; code, identifiers and
  comments are English. Never ship an English-only message to a user screen.
- **Tenant/scope isolation is the core invariant.** Each product enforces it
  differently, so follow that product's mechanism exactly and don't mix them.
  MASAR uses the `tenantWhere`/`resolveOrgId` helpers. The ISO platform uses
  Postgres RLS through `withTenant`. Alnadeg uses Supabase RLS plus the
  `profiles` role. A change that reads or writes tenant data without that
  mechanism is a bug, even if tests pass.
- **Roles come from the server, never the client.** Look roles up from the
  database or JWT claims the server issued. Never trust a role, org id or
  permission sent in a request body.
- **Run the product's own checks before pushing.** Each reference lists them.
  Root CI (`.github/workflows/ci.yml`) runs on every push but only covers
  MASAR 34. `iso-platform-ci.yml` runs only when `iso-platform/**` changes.
  **Alnadeg has no PR CI at all**, so `npm run verify` in its directory is the
  only gate.
- **Deploys are tied to project branches, not the default branch.** Render
  deploys `iso-platform` from `claude/global-iso-platform-p0-p1`
  (`render.yaml`). Alnadeg's site deploys from
  `claude/alnadeg-procurement-portal-6urp3o`. Merging into the default branch
  (`claude/masar-34-crowd-management-nibdx4`) does not deploy those two. If a
  change must go live, it has to reach that product's deploy branch too.
- **No secrets in the repo.** Demo or seed passwords are development-only and
  read from env. Supabase service-role keys, `ANTHROPIC_API_KEY` and
  database URLs belong in env or CI secrets. The repository is public.

## Choosing where a change goes

- Crowd density, queues, gates, zones, alerts, incidents, simulation →
  MASAR 34.
- ISO clauses, blueprints, document generation, DOCX/PDF export, CAPA,
  nonconformities, sector packs → ISO platform.
- Purchase requests, approvals, branches/locations, ERP invoice attachments,
  phone-number login → Alnadeg.

If a request is ambiguous ("the dashboard", "the login page"), all three have
one, so ask which product is meant.
