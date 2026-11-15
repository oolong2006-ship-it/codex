# Spec: Internal Audit Module (التدقيق الداخلي) — V1

Status: proposed
Module id: `internal-audit`
Roadmap item: `docs/ROADMAP.md` → «الخطوة التالية المقترحة» step 3.
Process in the core pack: `MGT-03` «التدقيق الداخلي» (`src/server/packs/core.ts`).

## Assumptions (correct these before approval)

1. One **audit program per org per calendar year**, approved before its audits can start.
2. Process ownership today is only a role string (`processes.owner_role`), not a user. So V1
   enforces auditor independence by **naming the auditees on each audit**: no auditor may also be an
   auditee. Each auditor also signs an independence declaration.
3. Every finding classified as a nonconformity **creates an NC automatically** in the existing CAPA
   module (`source = 'INTERNAL_AUDIT'`), in the same transaction. Follow-up of that NC stays in CAPA.
   The audit module does not duplicate it.
4. Clause references are free text typed by the user (e.g. "8.5.1"). **No ISO standard text** is
   stored or shown (ADR / `STANDARDS_AND_LICENSING.md`).
5. No email or notifications in V1 (blocked on open decision D-07, email provider). Due audits show up on the
   module's dashboard only.
6. The audit report uses the existing `DocContent` → DOCX/PDF pipeline, like `ncReportContent`.

## Objective

A quality manager can plan a year of internal audits, assign independent auditors, record what the
auditors found, and issue an audit report. Every nonconformity found becomes a tracked CAPA case
without retyping. This gives the client the evidence a certification auditor asks for under
internal audit: a risk-based program, independent auditors, recorded results and corrective action.

User stories:
- **Quality manager:** create the yearly program, add audits (scope, processes, site, dates,
  team, auditees), approve the program, and close audits after the report.
- **Auditor:** see my assigned audits, start one, record findings with objective evidence,
  submit the report.
- **Owner/Viewer:** see program progress (% of planned audits reported) and open findings.

## Tech Stack

Unchanged from `iso-platform` (ADR 001–008): Next.js 16 + React 19 Server Actions, raw `pg`, explicit
SQL migrations, Postgres RLS via `withTenant`/`tx`, zod, `docx` + Chromium PDF. **No new dependencies.**

## Commands (inside `iso-platform/`)

```bash
npm ci
PGSUPER_URL=postgresql://postgres:postgres@localhost:5432/postgres bash scripts/db-setup.sh
cp .env.example .env && set -a && . ./.env && set +a
npm run db:migrate
npx vitest run tests/internal-audit.test.ts tests/isolation.test.ts   # focused
npm run verify                                                        # typecheck + test + build
npx tsx scripts/e2e.ts                                                # browser E2E
```

## Data Model — `db/migrations/0004_internal_audit.sql`

| Table | Purpose | Grants to `iso_app` |
|---|---|---|
| `audit_programs` | `year`, `status` DRAFT→APPROVED, `risk_basis` (text: why these processes and how often), `approved_by/at`. `UNIQUE (org_id, year)` | SELECT, INSERT, UPDATE |
| `internal_audits` | `code` `IA-2026-0001` (via `org_counters`), `program_id`, `title`, `scope`, `criteria`, `process_codes text[]`, `site_id`, `planned_start/end`, `status`, timestamps and actors for each transition, `summary`, `conclusion` | SELECT, INSERT, UPDATE |
| `audit_team` | `audit_id`, `user_id`, `role` LEAD/MEMBER, `independence_declaration`, `declared_at`. `UNIQUE (audit_id, user_id)` | SELECT, INSERT, DELETE (DELETE only while the audit is PLANNED, enforced by a trigger) |
| `audit_auditees` | `audit_id`, `user_id` | SELECT, INSERT, DELETE (PLANNED only) |
| `audit_findings` | `audit_id`, `type`, `process_code`, `clause_ref`, `description`, `evidence_note`, `nc_id` (FK `nonconformities`), `recorded_by/at` | **SELECT, INSERT only** (append-only evidence) |

Finding `type` ∈ `CONFORMITY`, `OBSERVATION`, `OPPORTUNITY_FOR_IMPROVEMENT`, `NC_MINOR`, `NC_MAJOR`.

Every table has `ENABLE ROW LEVEL SECURITY` and a `tenant_isolation` policy on `org_id = app_org_id()`.

### Audit lifecycle (domain `requireStatus` **and** DB trigger)

```
PLANNED ──start──→ IN_PROGRESS ──submit report──→ REPORTED ──close──→ CLOSED
   └──cancel (reason)──→ CANCELLED
```

Guards:
- **Start:** program is APPROVED; the audit has exactly one LEAD; every team member has declared
  independence; no team member is an auditee (`INDEPENDENCE_VIOLATION`).
- **Record finding:** only while IN_PROGRESS, and only by a team member.
- **Submit report:** only the LEAD; needs `summary` + `conclusion` and at least one finding.
- **Close:** QM/Owner only. CLOSED and CANCELLED are final and immutable.
- Planned dates: `planned_end >= planned_start`, and the dates fall in the program year.
- All transition timestamps come from the server (`now()`). Nothing can be backdated.

## Domain — `src/server/domain/internal-audit.ts`

Functions (each `tx(ctx, perm, …)` + `audit(...)`):

| Function | Permission | Notes |
|---|---|---|
| `createProgram`, `approveProgram` | `audit.program.manage` | approve: DRAFT→APPROVED, needs `risk_basis` and ≥1 audit |
| `planAudit`, `setTeam`, `setAuditees`, `cancelAudit`, `closeAudit` | `audit.program.manage` | team/auditees editable only while PLANNED |
| `declareIndependence` | `audit.conduct` | the user can declare only for their own team row |
| `startAudit`, `recordFinding`, `submitReport` | `audit.conduct` | plus team membership / LEAD check in the domain |
| `listAudits`, `getAudit`, `programProgress` | `read` | |
| `auditReportContent(ctx, id)` | `read` | returns `DocContent` for DOCX/PDF export |

`recordFinding` with type `NC_MINOR`/`NC_MAJOR` calls the CAPA insert path (same transaction):
`source='INTERNAL_AUDIT'`, `severity` MINOR/MAJOR, `process_code`, `site_id` from the audit,
`detected_on = today`. It stores the returned `nc_id` on the finding. One finding maps to exactly one NC.

### RBAC changes (`src/server/rbac.ts`)

| Permission | OWNER | QUALITY_MANAGER | AUDITOR | CONTRIBUTOR | VIEWER |
|---|---|---|---|---|---|
| `audit.program.manage` | ✓ | ✓ | – | – | – |
| `audit.conduct` | ✓ | ✓ | ✓ | – | – |

## UI — `src/app/app/internal-audits/`

(`src/app/app/audit/` is the audit **log** and is left alone.)

- `page.tsx`: program for the selected year (status, risk basis, approve button), audits table
  (code, title, processes, dates, `StatusBadge`), and progress (`reported / planned`).
- `new/page.tsx`: plan-audit form.
- `[id]/page.tsx`: details, team and auditees, independence declaration, start, findings list and
  add-finding form, linked NC codes (links to `/app/capa/[id]`), submit report, close, export DOCX/PDF.
- Nav entry «التدقيق الداخلي». Every string is Arabic and RTL. Pages use `requireCtx`, `act`, `back` and `flash`.

## Code Style

Copy `capa.ts` exactly:

```ts
export async function startAudit(ctx: TenantCtx, id: string) {
  await tx(ctx, "audit.conduct", async (db) => {
    const a = await loadAudit(db, id);              // UUID check + SELECT … FOR UPDATE
    requireStatus(a, "PLANNED");
    await requireLead(db, a.id, ctx.userId);        // DomainError("FORBIDDEN", "فقط رئيس فريق التدقيق …")
    await assertIndependent(db, a.id);              // DomainError("INDEPENDENCE_VIOLATION", "لا يجوز أن يدقق المدقق عمله")
    await db.query("UPDATE internal_audits SET status='IN_PROGRESS', started_by=$1, started_at=now() WHERE id=$2", [ctx.userId, id]);
    await audit(db, ctx, "internal_audit.started", "internal_audit", id);
  });
}
```

zod with Arabic messages, `DomainError(code, arabicMessage)`, no tenant query outside `tx`.

## Testing Strategy

Vitest against a real Postgres with RLS (`tests/global-setup.ts`), new file `tests/internal-audit.test.ts`:

1. Happy path: program → plan → team + declarations → approve → start → findings (one each type) →
   report → close. Two NCs created with `source=INTERNAL_AUDIT` and the right severities, linked to their findings.
2. Independence: an auditee who is also on the team blocks start. A missing declaration blocks start.
3. State machine: illegal transitions are rejected by the domain **and** by a direct SQL UPDATE (trigger).
4. Append-only: `UPDATE`/`DELETE` on `audit_findings` as `iso_app` fails (permission denied).
5. RBAC: VIEWER/CONTRIBUTOR can't plan or conduct. An AUDITOR not on the team can't record findings.
   Only the LEAD submits the report.
6. Program: can't start an audit in a DRAFT program. One program per year. Dates are outside the year.
7. Export: `auditReportContent` renders to DOCX (zip contains the audit code and the finding count).
8. **Isolation:** add the five tables to `tests/isolation.test.ts`. Org B cannot see or modify org A's
   program, audits or findings, and cannot link a finding to org A's NC.

E2E: extend `scripts/e2e.ts` with one plan → finding → NC-visible-in-CAPA flow.

## Boundaries

- **Always:** do all work through `tx`/`withTenant`. Add RLS + policy + explicit grants per table. Call `audit(...)` on
  every state change. Write Arabic user messages. Run `npm run verify` before pushing.
- **Ask first:** adding a dependency, changing existing CAPA tables or triggers, changing the RBAC
  matrix beyond the two permissions above, pushing to the deploy branch `claude/global-iso-platform-p0-p1`.
- **Never:** reproduce ISO standard text, trust role/org from the client, allow UPDATE/DELETE on
  findings, backdate any timestamp, or skip/weaken a failing test.

## Success Criteria

- [ ] Migration `0004` applies cleanly on a fresh DB and on a DB that already has `0001–0003`.
- [ ] All 8 test groups above pass. `npm run verify` is green. `iso-platform-ci.yml` is green.
- [ ] An NC-type finding produces exactly one `nonconformities` row (`INTERNAL_AUDIT`) visible in `/app/capa`.
- [ ] Starting an audit with a conflicted or undeclared auditor is impossible via both the UI and SQL.
- [ ] The audit report exports to DOCX and PDF with Arabic RTL rendering.
- [ ] `docs/PROGRESS.md` and `docs/ROADMAP.md` are updated to mark the item done.

## Out of Scope (Deferred to V2+)

- Checklist templates / question banks per process — blocked on D-01 (ISO content licence: DECISIONS.md lists audit checklists as dependent on it). Free-text findings in V1.
- Auditor competence records — belongs to the Training module (roadmap P3).
- Evidence file uploads on findings — separate roadmap item 6 (private storage).
- Automatic risk-based scheduling (frequency from risk scores) — manual program in V1.
- Email/calendar reminders — blocked on D-07 (email provider).
- External / supplier / certification-body audits — a different flow.
- AI-suggested findings or report drafts — blocked on D-06 (AI provider) plus the validator contract.
- English UI — the platform-wide item.

## Open Questions

1. Should process ownership move to a named user (`processes.owner_user_id`)? That would enforce
   independence automatically instead of through a manual auditee list. (This changes a core table, so it is ask-first.)
2. Should `approveProgram` be **OWNER-only** (top management) rather than OWNER + QM?
3. Is the finding classification right (CONFORMITY / OBSERVATION / OFI / NC_MINOR / NC_MAJOR), or does
   the client also need `CRITICAL` to match NC severities?
4. Is a yearly program enough, or are multi-year (e.g. 3-year certification cycle) programs needed?
