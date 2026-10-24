# Taqam Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 20 defects found by the 2026-10-24 code review of `taqam/packages/core` and `taqam/apps/api/src`, each one pinned by a failing test first.

**Architecture:** Pure date/payroll math is fixed in `@taqam/core` (vitest). Concurrency, authorization and lifecycle defects are fixed in the NestJS API with guarded, conditional writes inside transactions (jest unit + supertest e2e against `taqam_test`). No API shape changes except new 400s for invalid input.

**Tech Stack:** TypeScript, vitest 2.1.9 (core), NestJS 10 + Prisma 5 + jest/supertest (api), PostgreSQL 16.

**Spec:** the review findings (reproduced as the task list below) + Saudi Labor Law references already in `docs/CORE_API.md`.

## Global Constraints

- Every fix starts with a test that fails for the reported reason; no fix without its test.
- Calendar-day rules (Art. 117 sick tiers, maternity 84 days, unpaid-leave wage deduction on a 30-day basis) count calendar days; working-day counting stays for annual leave balances.
- Concurrency fixes use conditional `updateMany({ where: { id, status: <expected> } })` and treat `count === 0` as 409 `messageAr: 'تمت معالجة هذا الطلب مسبقاً'`.
- The API must refuse to boot in production without `JWT_SECRET` (min 32 chars); dev/test keep a fallback.
- Keep all existing core (85+), api unit (17) and e2e (22) tests green.

## Review Focus

1. Double-click on approve buttons (payroll, requests, leaves) → exactly one effect. Pinned in Tasks 4–5 (parallel `Promise.all` e2e).
2. Overnight shift crossing midnight on check-out → closes the previous day's record. Pinned in Task 6.
3. Employees hired on the 31st / Feb 29 → paid for worked days; leap-year service totals exact. Pinned in Tasks 1–2.
4. Typos in query params (`reason`, `endDate`) → 400, never a silent full award or 500. Pinned in Task 7.
5. Stolen token after password reset → rejected. Pinned in Task 9.

---

### Task 1: Core — leap-year service duration (review #5)
**Files:** `packages/core/src/dates.ts:113`, test `packages/core/src/core.test.ts`
- [ ] Test: `serviceDuration('2022-03-01','2024-02-29').totalYears` `< 2`; `resignationFactor` on that duration → `0`; `serviceDuration('2020-01-01','2023-01-01').totalYears === 3`.
- [ ] Run `npx vitest run` → FAIL.
- [ ] Fix: remainder fraction = remainderDays / (days from last anniversary to next anniversary) instead of `/365`.
- [ ] Run → PASS. Commit.

### Task 2: Core — joiner on the 31st (review #6)
**Files:** `packages/core/src/dates.ts:134`
- [ ] Test: `payableDaysInPeriod('2026-01','2026-01-31') === 1`; `payableDaysInPeriod('2026-02','2026-02-28') === 1`; existing `'2026-01','2026-01-15'` stays `16`.
- [ ] FAIL → fix: joiner on day ≥ the month's last day gets 1 day; otherwise `30 - min(d,30) + 1` → PASS. Commit.

### Task 3: Core + API — calendar-day leave counting for wage deductions and caps (review #3, #15)
**Files:** `packages/core/src/leave.ts` (add `calendarDays(start,end): number`), `apps/api/src/payroll/payroll.engine.ts:106`, `apps/api/src/shared/leave-calc.service.ts:99`
- [ ] Core test: `calendarDays('2026-11-01','2026-11-30') === 30`.
- [ ] API unit test (payroll engine): an APPROVED UNPAID leave covering all of November deducts 30/30 of total wage (net = 0 before GOSI floor rules); a 7-day SICK leave inside the month uses 7 calendar days for tiering.
- [ ] API unit test (leave-calc): MATERNITY request of 117 calendar days → rejected (exceeds 84); ANNUAL still counted in working days.
- [ ] FAIL → implement: payroll uses calendar days clipped to the period for UNPAID/SICK; leave-calc counts calendar days for codes `SICK, MATERNITY, UNPAID` → PASS. Commit.

### Task 4: API — atomic payroll approval (review #1)
**Files:** `apps/api/src/payroll/payroll.engine.ts:213`, e2e `apps/api/test/payroll.e2e-spec.ts` (new)
- [ ] E2E: calculate a run with one loan (remaining 3000, installment 500); fire two `POST /payroll/runs/:id/approve` concurrently → one 200, one 409; loan.remaining === 2500.
- [ ] FAIL → implement: inside the transaction first `updateMany({id, status:'CALCULATED'} → APPROVED)`, abort with 409 when `count===0`, then read slips and deduct loans; calculate also requires status DRAFT|CALCULATED via conditional update → PASS. Commit.

### Task 5: API — loan approval authority and atomic request decisions (review #11)
**Files:** `apps/api/src/requests/requests.service.ts:95`, e2e extend `test/app.e2e-spec.ts`
- [ ] E2E: BRANCH_MANAGER approving a LOAN request → 403 `messageAr` 'اعتماد السلف من صلاحية الموارد البشرية أو الرواتب'; HR concurrent double-approve → exactly one Loan row.
- [ ] FAIL → implement role check for type LOAN (OWNER/HR_ADMIN/PAYROLL) and conditional `updateMany({id,status:'PENDING'})` before side effects; same conditional pattern in `leaves.service` decide → PASS. Commit.

### Task 6: API — overnight self check-out (review #4)
**Files:** `apps/api/src/me/me.controller.ts:149`
- [ ] E2E: shift 22:00–06:00; check-in at D 21:55 Riyadh, check-out at D+1 06:05 → 200, record D gets checkOut and workedMinutes ≈ 490.
- [ ] FAIL → implement: when no record for today, close the most recent open record (checkIn set, checkOut null) within the last 16 hours → PASS. Commit.

### Task 7: API — validate EOSB query and employee status edits (review #7, #12)
**Files:** `apps/api/src/employees/employees.service.ts:198,205`, DTOs
- [ ] E2E: `GET /employees/:id/eosb?reason=resignation` → 400; `?endDate=abc` → 400; `PATCH /employees/:id {status:'TERMINATED'}` → 400 `messageAr` 'استخدم إجراء إنهاء الخدمة'.
- [ ] FAIL → implement `@IsIn(TERMINATION_REASONS)` / `@IsDateString()` query DTO; strip `status: 'TERMINATED'` and `terminationDate` from the update DTO → PASS. Commit.

### Task 8: API — leave status lifecycle and yearly caps (review #8, #9, #13, #18)
**Files:** `apps/api/src/leaves/leaves.service.ts:107`, `apps/api/src/shared/leave-calc.service.ts:35,42,59,131`, new daily job in `apps/api/src/leaves/leave-status.job.ts`
- [ ] Unit tests: `syncLeaveStatuses(today)` sets ON_LEAVE for employees with an APPROVED leave covering today and ACTIVE for ON_LEAVE employees without one; yearly max counts only `startDate` within `[Jan 1, Dec 31]` of the request year; Feb-29 hire uses core `addYears`; balance includes `carriedOver` from prior service years = Σ(entitlement per completed year) − Σ(annual taken before current year start), capped at 0 minimum.
- [ ] FAIL → implement (job runs 00:10 Riyadh and after each approve/cancel) → PASS. Commit.

### Task 9: API — security hardening (review #2, #16, #17)
**Files:** `apps/api/src/auth/auth.module.ts:11`, `apps/api/src/auth/auth.service.ts`, `apps/api/src/admin/admin.service.ts:490`, `prisma/schema.prisma` (User.tokenVersion Int @default(0)), `apps/api/src/common/csv.ts`
- [ ] Unit: `toCsv([{n:'=HYPERLINK("x")'}])` contains `'=HYPERLINK` (prefixed with `'`); values starting with `+ - @` too.
- [ ] Unit: bootstrapping config with `NODE_ENV=production` and no/short `JWT_SECRET` throws.
- [ ] E2E: after admin reset-password or change-password, the old token → 401.
- [ ] FAIL → implement (`tv` claim checked in guard; increment on reset/change) → PASS. Migration `token_version`. Commit.

### Task 10: API — platform expiry race and admin list efficiency (review #10, #19, #20)
**Files:** `apps/api/src/platform/platform.service.ts:42,114`, `apps/api/src/admin/admin.service.ts:67,228`
- [ ] Unit: `expire()` on a company whose `subscriptionEndsAt` was extended after the snapshot leaves it ACTIVE (conditional where includes `subscriptionEndsAt: { lt: now }` / `trialEndsAt: { lt: now }`).
- [ ] Unit: admin `list()` does not call `expireDue()`; MRR rounding uses core `round2` (1.005 → 1.01).
- [ ] FAIL → implement; push status/plan filter + pagination into Prisma → PASS. Commit.

### Task 11: API — attendance PATCH on ABSENT record (review #14)
**Files:** `apps/api/src/attendance/attendance.service.ts:213`
- [ ] E2E: PATCH `{note}` on an ABSENT record → 200 and status stays ABSENT.
- [ ] FAIL → default `status` to the existing record's status → PASS. Commit.

### Task 12: Ship
- [ ] Run core `npm test`, api `npm run typecheck && npm test && npm run test:e2e && npm run build`, web `npx tsc --noEmit`.
- [ ] Mirror behavioural fixes that affect the browser demo mock (`apps/web/src/demo`): payroll approve guard, LOAN approval authority, overnight checkout, CSV escape.
- [ ] Push; confirm CI, Taqam CI and Pages green.
