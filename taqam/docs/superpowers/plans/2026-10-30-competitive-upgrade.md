# Shuoon Competitive Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the seven competitive gaps from the research report and reprice Shuoon to compete (Essential 12 / Growth 19 SAR).

**Architecture:** Pure rules live in `packages/core` (vitest), persisted and exposed by the NestJS API (`apps/api`, Prisma migrations, jest unit + supertest e2e), and rendered by the Next.js app (`apps/web`) whose in-browser demo mock (`apps/web/src/demo/**`) must mirror every new endpoint so the GitHub Pages demo keeps working.

**Tech Stack:** TypeScript, vitest 2.1.9, NestJS 10, Prisma 5 / PostgreSQL 16, jest + supertest, Next.js 15 / React 19 / Tailwind, Playwright for smoke checks.

**Spec:** `taqam/docs/superpowers/specs/2026-10-30-competitive-upgrade.md`

## Global Constraints
- Every rule value (rates, thresholds, codes, Arabic messages, prices) is copied verbatim from the spec.
- Each task: failing test first, then code (TDD). Core tests in `packages/core/src/core.test.ts` or a new `packages/core/src/<topic>.test.ts`; API unit `apps/api/src/**/*.spec.ts`; API e2e `apps/api/test/<topic>.e2e-spec.ts`; web/mock `apps/web/src/**/*.test.ts`.
- One Prisma migration per task that changes the schema (`npx prisma migrate dev --name <task_slug> --create-only`, then edit SQL for backfills); must apply cleanly on a DB holding the previous migrations + seed.
- Demo mock parity: same paths, field names, status codes and Arabic messages as the API; bump `DB_VERSION` in `apps/web/src/demo/db.ts` once per task that changes mock data shape; seed realistic demo data for the feature.
- Bilingual UI via the existing `t(ar, en)` helpers; RTL-first; reuse `src/components/ui` and the Button/Modal patterns (Button `disabled` after spread, `useDialog`).
- Every new API route is tenant-scoped (`companyId` from the token) and role-guarded with the existing `@Roles` decorator; branch managers are limited to their branch via `ScopeService`.
- Gates before each commit: `npx tsc --noEmit` in the touched app(s), the touched test suites green. Commit per task on branch `claude/great-hawking-bm4a83`.

## Review Focus
1. A company with zero active employees or a branch with zero staff — every new calculation (official rate, margin, cost per employee) must return 0, never NaN/Infinity. Pinned in Tasks 2 and 5.
2. An employee who changes branch or is terminated mid-period — WPS "missing from run", labor cost and open-shift eligibility use status/branch as of the period, terminated staff are excluded. Pinned in Tasks 3 and 5.
3. Concurrency: two employees claiming the last open-shift slot, or a swap approved while one assignment changed — exactly one wins, the other gets 409. Pinned in Task 8.
4. Offline punch replay sent twice (flaky network) — the second is idempotent (no duplicate record, 200 with the existing record). Pinned in Task 6.
5. Kiosk brute force — repeated wrong PINs lock the employee for 15 minutes without revealing whether the employee number exists. Pinned in Task 7.

---

### Task 1: GOSI two regimes

**Files:**
- Modify: `packages/core/src/gosi.ts`, `packages/core/src/core.test.ts`
- Modify: `apps/api/prisma/schema.prisma` (Employee.gosiFirstRegisteredAt `DateTime? @db.Date`), migration `gosi_regimes`
- Modify: `apps/api/src/payroll/payroll.engine.ts` (+ spec), employee DTO/service (`apps/api/src/employees/*`), `apps/api/src/dashboard/dashboard.controller.ts`
- Modify: `apps/web` employee form + detail, `apps/web/src/demo/**` payroll calc and employee routes/seed

**Interfaces:**
- Produces: `export type GosiRegime = 'LEGACY' | 'NEW'`; `gosiRegime(isSaudi: boolean, firstRegisteredAt: DateInput | null): GosiRegime`; `saudiPensionRate(regime: GosiRegime, period: string /* YYYY-MM */): number`; `gosiRatesFor(input: { isSaudi: boolean; firstRegisteredAt: DateInput | null }, period: string): GosiRates` (returns full rates object for `calculateGosi`).

- [ ] **Step 1: Write failing core tests**
```ts
expect(gosiRegime(true, '2024-07-02')).toBe('LEGACY');
expect(gosiRegime(true, '2024-07-03')).toBe('NEW');
expect(gosiRegime(true, null)).toBe('LEGACY');
expect(gosiRegime(false, '2025-01-01')).toBe('LEGACY');
expect(saudiPensionRate('NEW', '2025-06')).toBe(0.09);
expect(saudiPensionRate('NEW', '2025-07')).toBe(0.095);
expect(saudiPensionRate('NEW', '2026-07')).toBe(0.10);
expect(saudiPensionRate('NEW', '2027-07')).toBe(0.105);
expect(saudiPensionRate('NEW', '2031-01')).toBe(0.11);
expect(saudiPensionRate('LEGACY', '2030-01')).toBe(0.09);
const r = gosiRatesFor({ isSaudi: true, firstRegisteredAt: '2025-01-10' }, '2026-07');
expect(r.saudiEmployee).toBeCloseTo(0.1075, 6); // 10% + 0.75% SANED
expect(r.saudiEmployer).toBeCloseTo(0.1275, 6); // 10% + 0.75% + 2%
expect(calculateGosi({ basic: 10000, housing: 2500, isSaudi: true }, r).employee).toBe(1343.75);
```
- [ ] **Step 2:** `cd packages/core && npx vitest run` → FAIL (not defined).
- [ ] **Step 3:** Implement in `gosi.ts`; schedule as a data table `NEW_REGIME_PENSION_SCHEDULE: { from: 'YYYY-MM'; rate: number }[]`; export from index. Run → PASS.
- [ ] **Step 4: API test first** — payroll engine spec: a Saudi with `gosiFirstRegisteredAt 2025-01-10` in period `2026-07` gets employee GOSI 10.75% of base; a LEGACY Saudi still 9.75%. Run jest → FAIL; wire `gosiRatesFor` into the engine (non-registered still `NO_GOSI`) and dashboard cost; migration adds the column (null for existing rows). Run → PASS.
- [ ] **Step 5: Web + mock** — employee form date field «تاريخ أول تسجيل في التأمينات» with hint «يحدد نظام النسب (القديم/الجديد)»; detail shows regime badge; mock payroll uses `gosiRatesFor`; mock seed gives 3 Saudi demo employees a post-2024-07-03 date. Vitest for the mock payroll line. `npx tsc --noEmit`.
- [ ] **Step 6: Commit** `feat: GOSI two regimes (new Social Insurance Law rates)`

### Task 2: Qiwa-documented Saudization

**Files:**
- Modify: `packages/core/src/nitaqat.ts` (+ test)
- Modify: schema (Employee.qiwaDocumented `Boolean @default(false)`, qiwaDocumentedAt `DateTime?`), migration `qiwa_documented`
- Modify: `apps/api/src/saudization/saudization.controller.ts` (+ new `saudization.spec.ts`), employees DTO/service, e2e `apps/api/test/saudization.e2e-spec.ts`
- Modify: `apps/web/src/app/app/saudization/**`, employee form/list (bulk action), mock routes/seed

**Interfaces:**
- Produces: `officialSaudization(employees: { isSaudi: boolean; qiwaDocumented: boolean }[], t?: NitaqatThresholds): { total: number; saudis: number; documentedSaudis: number; undocumentedSaudis: number; officialRate: number; internalRate: number; band: NitaqatBand; marginToDrop: number }`; `marginToDrop(documentedSaudis: number, total: number, t?): number`.
- API: `GET /saudization` company and each branch gain `officialRate, internalRate, documentedSaudis, undocumentedSaudis, marginToDrop, alert: boolean` (`rate`/`band` now = official); `POST /employees/qiwa-documented {employeeIds: string[], documented: boolean}` (OWNER/HR_ADMIN) → `{updated: number}`.

- [ ] **Step 1: Failing core tests**
```ts
const emps = [...Array(7)].map(() => ({ isSaudi: false, qiwaDocumented: false }))
  .concat([{ isSaudi: true, qiwaDocumented: true }, { isSaudi: true, qiwaDocumented: true }, { isSaudi: true, qiwaDocumented: false }]);
const s = officialSaudization(emps);
expect(s).toMatchObject({ total: 10, saudis: 3, documentedSaudis: 2, undocumentedSaudis: 1, officialRate: 20, internalRate: 30, band: 'MID_GREEN' });
expect(s.marginToDrop).toBe(0); // losing 1 of 2 → 11.11% (<12) drops two bands; already at the MID_GREEN floor
expect(officialSaudization([]).officialRate).toBe(0);
expect(marginToDrop(0, 10)).toBe(0);
expect(marginToDrop(5, 10)).toBe(1); // 50%→ 4/9=44.4 still PLATINUM, 3/8=37.5 drops
```
- [ ] **Step 2:** run vitest → FAIL; implement (margin = largest k such that band(rate(d−k, n−k)) is unchanged; 0 when RED or total 0) → PASS.
- [ ] **Step 3: API tests first** — e2e: seed 10 employees as above → `GET /saudization` returns officialRate 20 / internalRate 30 / alert true; `POST /employees/qiwa-documented` by OWNER flips the third → officialRate 30; BRANCH_MANAGER → 403; ids of another company are ignored (updated counts only own). Run → FAIL; implement + migration (existing rows false). Run → PASS.
- [ ] **Step 4: Web + mock** — saudization page: official vs internal tiles, «X سعوديين غير موثقة عقودهم في قوى» list with bulk «تأكيد التوثيق», banner when `alert`; employee form checkbox «العقد موثق في منصة قوى»; mock mirrors (seed: 2 undocumented Saudis). tsc + vitest.
- [ ] **Step 5: Commit** `feat: Qiwa-documented Saudization (official vs internal rate)`

### Task 3: WPS pre-upload checker

**Files:**
- Create: `packages/core/src/wps-check.ts` (+ `wps-check.test.ts`)
- Modify: schema (PayrollRun.wpsExportedAt `DateTime?`), migration `wps_check`
- Modify: `apps/api/src/payroll/payroll.service.ts`, `payroll.controller.ts`, e2e `apps/api/test/wps-check.e2e-spec.ts`
- Modify: web payroll run detail page, mock payroll routes

**Interfaces:**
- Produces: `type WpsIssueCode = 'INVALID_IBAN'|'MISSING_NATIONAL_ID'|'NON_POSITIVE_NET'|'DUPLICATE_NATIONAL_ID'|'EMPLOYEE_MISSING_FROM_RUN'|'NET_MISMATCH'|'DEDUCTION_OVER_HALF'|'PAID_BELOW_CONTRACT'|'LATE_PAYMENT'`; `interface WpsIssue { code: WpsIssueCode; severity: 'ERROR'|'WARNING'; employeeNumber: string | null; messageAr: string }`; `checkWpsRun(input: { period: string; paymentDate: string; rows: { employeeNumber: string; nationalId: string; iban: string; gross: number; deductions: number; net: number; basicPaid: number; contractBasic: number; hasAbsenceOrUnpaidLeave: boolean }[]; activeEmployeeNumbers: string[] }): { issues: WpsIssue[]; errors: number; warnings: number; ready: boolean }`.
- API: `GET /payroll/runs/:id/wps-check` (OWNER/HR_ADMIN/PAYROLL) → that result + `exportedAt`; WPS export sets `wpsExportedAt`.

- [ ] **Step 1: Failing core tests** — one test per code in the spec table, asserting code, severity and the exact Arabic message; plus `ready` true for a clean run and false when any ERROR; LATE_PAYMENT boundary: period `2026-10`, paymentDate `2026-11-07` → no issue, `2026-11-08` → WARNING.
- [ ] **Step 2:** run → FAIL; implement (reuse `validateSaudiIban`); export → PASS.
- [ ] **Step 3: API e2e first** — calculated run with one employee missing IBAN and one active employee excluded → check returns INVALID_IBAN + EMPLOYEE_MISSING_FROM_RUN, `ready:false`; employee terminated before period start is NOT reported missing; export sets `exportedAt`. FAIL → implement → PASS.
- [ ] **Step 4: Web + mock** — run page panel «فحص الملف قبل الرفع إلى مُدد» (badge «جاهز للرفع» / «X أخطاء تمنع الرفع»), issues grouped by severity with employee links; mock mirrors using the core function. tsc + vitest.
- [ ] **Step 5: Commit** `feat: WPS pre-upload checker for Mudad`

### Task 4: Sector documents compliance

**Files:**
- Modify: `packages/core/src/documents.ts` (+ test)
- Modify: schema (DocumentType + 4 values; Employee.docExemptions `DocumentType[] @default([])`), migration `sector_documents`
- Modify: `apps/api/src/employees/*` (+ `GET /documents/compliance`), e2e `apps/api/test/documents-compliance.e2e-spec.ts`
- Modify: web documents page + employee documents tab, labels in `src/lib/labels.ts`, mock

**Interfaces:**
- Produces: `type SectorKey = 'RESTAURANTS'|'RETAIL'|'CONTRACTING'|'HEALTHCARE'|'LOGISTICS'|string`; `requiredDocTypes(sector: SectorKey | null, isSaudi: boolean): string[]`; `documentCompliance(input: { sector: SectorKey | null; today: string; employees: { id: string; isSaudi: boolean; exemptions: string[] }[]; documents: { employeeId: string; type: string; expiryDate: string | null }[] }): { employeeId: string; type: string; status: 'MISSING'|'EXPIRED'|'CRITICAL'|'WARNING' }[]` (latest expiry per type wins; OK and NONE-with-no-requirement omitted).
- API: `GET /documents/compliance` (OWNER/HR_ADMIN; branch manager scoped) → `{ items: (row & {employeeName, branchName})[], counts: {MISSING, EXPIRED, CRITICAL, WARNING} }`; `PATCH /employees/:id` accepts `docExemptions`.

- [ ] **Step 1: Failing core tests** — RESTAURANTS non-Saudi with iqama but no health cert → `[{type:'HEALTH_CERTIFICATE', status:'MISSING'}]`; HEALTHCARE with license expiring in 20 days → CRITICAL; LOGISTICS requires both DRIVER_CARD and DRIVING_LICENSE; exemption removes the requirement; Saudi never requires IQAMA; two health certs, newest valid → no item; null sector → only IQAMA rule.
- [ ] **Step 2:** run → FAIL; implement (reuse `expiryStatus`) → PASS.
- [ ] **Step 3: API e2e first** — restaurant company: compliance lists a missing health certificate; adding one via `POST /employees/:id/documents {type:'HEALTH_CERTIFICATE', expiryDate}` clears it; BRANCH_MANAGER sees only own branch. FAIL → implement + migration (`ALTER TYPE ... ADD VALUE` outside a transaction-using statement if Prisma requires) → PASS.
- [ ] **Step 4: Web + mock** — documents page tab «امتثال القطاع» with counts and table; Arabic labels: الشهادة الصحية (بلدي)، ترخيص مزاولة المهنة، بطاقة سائق (هيئة النقل)، رخصة القيادة; employee page exemption toggles; mock seeds a restaurant with missing/expiring health certificates. tsc + vitest.
- [ ] **Step 5: Commit** `feat: sector document compliance (Baladi, SCFHS, TGA)`

### Task 5: Compliance center — government-services risk and true labor cost

**Files:**
- Create: `packages/core/src/compliance.ts` (+ `compliance.test.ts`)
- Modify: schema (Company.expatLevyMonthly `Decimal @default(800) @db.Decimal(10,2)`, iqamaFeeAnnual `Decimal @default(650) @db.Decimal(10,2)`), migration `compliance_center`; settings DTO
- Create: `apps/api/src/compliance/compliance.controller.ts` + module, e2e `apps/api/test/compliance.e2e-spec.ts`
- Create: `apps/web/src/app/app/compliance/page.tsx` (+ nav item «مركز الامتثال», icon `ShieldCheck`, roles OWNER/HR_ADMIN/PAYROLL), dashboard card linking to it; mock route
- Use the `dataviz` skill for the branch-cost chart and risk tiles.

**Interfaces:**
- Consumes: `officialSaudization` (Task 2), `checkWpsRun` (Task 3), `documentCompliance` (Task 4), `gosiRatesFor` (Task 1).
- Produces: `type RiskLevel = 'HIGH'|'MEDIUM'|'LOW'`; `governmentRisk(input: { band: NitaqatBand; marginToDrop: number; undocumentedSaudis: number; prevMonthWpsExported: boolean; dayOfMonth: number; latestWpsErrors: number; expiredIqamas: number; iqamasExpiring30: number; docsExpired: number; docsMissing: number }): { level: RiskLevel; items: { key: string; level: RiskLevel; count: number; titleAr: string; titleEn: string; href: string }[] }`; `branchLaborCost(rows: { branchId: string | null; isSaudi: boolean; gross: number; gosiEmployer: number }[], fees: { expatLevyMonthly: number; iqamaFeeAnnual: number }): { branchId: string | null; headcount: number; saudis: number; gross: number; gosiEmployer: number; govFees: number; total: number; perEmployee: number }[]`.
- API: `GET /compliance/overview` → `{ risk, saudization, wps: { prevPeriod, exported, latestRunId, errors }, documents: counts }`; `GET /compliance/branch-costs?period=YYYY-MM` → `{ period, estimated: boolean, fees, branches: (row & {branchName})[], totals }`.

- [ ] **Step 1: Failing core tests** — RED band → item HIGH and overall HIGH; prev month not exported on day 9 → no WPS item, on day 10 → HIGH; all clean → `level:'LOW'`, items empty; `branchLaborCost` with 2 expats (gross 3000, gosi 60) + 1 Saudi (gross 8000, gosi 940) in one branch, fees 800/650 → `{headcount:3, saudis:1, gross:14000, gosiEmployer:1060, govFees:1708.33, total:16768.33, perEmployee:5589.44}`; branch with 0 rows absent; perEmployee 0 never NaN.
- [ ] **Step 2:** run → FAIL; implement → PASS.
- [ ] **Step 3: API e2e first** — overview reflects seeded undocumented Saudis and an expired iqama; branch-costs uses payslips when the period run exists (`estimated:false`) and contract salaries otherwise (`estimated:true`); BRANCH_MANAGER gets only own branch; an employee terminated before the period is excluded from headcount and cost; EMPLOYEE 403. FAIL → implement → PASS.
- [ ] **Step 4: Web + mock** — page: headline «خدماتك الحكومية: مخاطر …» with level colour, risk item cards linking to the fixing page, branch cost table + horizontal bar chart (dataviz rules: neutral palette, labelled values, accessible contrast), period picker, «تقديري» badge when estimated, fees note from the spec; settings fields for the two fees. Mock mirrors. tsc + vitest + quick Playwright screenshot review.
- [ ] **Step 5: Commit** `feat: compliance center (government-services risk + true labor cost per branch)`

### Task 6: Selfie and offline punches

**Files:**
- Modify: schema (Company.requireSelfie `Boolean @default(false)`; AttendanceRecord.flags `String[] @default([])`; new model `AttendancePhoto { id, companyId, recordId, kind 'IN'|'OUT', mime, data Bytes, createdAt; @@unique([recordId, kind]) }`), migration `attendance_selfie_offline`
- Modify: `apps/api/src/me/me.controller.ts` (LocationDto + `selfie?`, `capturedAt?`), attendance service/controller (`GET /attendance/:id/photo/:kind`), e2e `apps/api/test/attendance-anti-tamper.e2e-spec.ts`
- Modify: web ESS check-in (`src/components/ess/CheckInCard.tsx` camera capture via `<input type="file" accept="image/*" capture="user">` resized to ≤ 200 KB with canvas), new `src/lib/offlineQueue.ts` (IndexedDB, + test with fake-indexeddb or an injected store), attendance board photo viewer, settings toggle, mock

**Interfaces:**
- API: check-in/out body `{ lat, lng, selfie?: string /* data:image/jpeg;base64 */, capturedAt?: string /* ISO */ }`. Errors: selfie > 200 KB or not JPEG/PNG → 400 «الصورة غير صالحة أو أكبر من 200 كيلوبايت»; required & missing → 400 «التقاط صورة مطلوب لتسجيل الحضور»; capturedAt older than 12h or in the future (> now + 2 min) → 400 «وقت التسجيل خارج المدة المسموحة (12 ساعة)».
- Offline replay idempotency: a second check-in replay for the same day with the same `capturedAt` returns 200 with the existing record (no 409).
- Web: `enqueuePunch(p: { kind: 'IN'|'OUT'; lat: number; lng: number; capturedAt: string; selfie?: string }): Promise<void>`; `flushPunches(send: (p) => Promise<void>): Promise<{ sent: number; failed: number }>`.

- [ ] **Step 1: API e2e first** — requireSelfie on → no selfie 400 with the message; with a tiny JPEG → 200 and photo retrievable by HR, not by another company; 300 KB → 400; `capturedAt` 3h ago → record checkIn equals capturedAt and flags contain `OFFLINE`; 13h ago → 400; same replay twice → 200 both, one record. FAIL → implement + migration → PASS.
- [ ] **Step 2: Web tests first** — offline queue: enqueue twice, flush with a sender that fails the 2nd → `{sent:1, failed:1}` and the failed item stays queued. FAIL → implement → PASS.
- [ ] **Step 3: UI + mock** — check-in card camera step (shown when required or user taps «إضافة صورة»), offline banner «لا يوجد اتصال — سيُرسل التسجيل تلقائياً عند عودة الاتصال», auto-flush on `online` event; attendance board badge «دون اتصال» and photo thumbnail; mock mirrors (store photo data URL). tsc + vitest.
- [ ] **Step 4: Commit** `feat: selfie check-in and offline punch queue`

### Task 7: Branch kiosk mode

**Files:**
- Modify: schema (model `KioskDevice { id, companyId, branchId, name, tokenHash @unique, lastSeenAt, revokedAt, createdAt }`; Employee.kioskPinHash `String?`, kioskFailCount `Int @default(0)`, kioskFirstFailAt `DateTime?`, kioskLockedUntil `DateTime?` — count resets when the first failure is older than 15 min or on success), migration `kiosk_mode`
- Create: `apps/api/src/kiosk/{kiosk.controller.ts,kiosk.service.ts,kiosk.guard.ts,kiosk.module.ts}` (+ `kiosk.service.spec.ts`), e2e `apps/api/test/kiosk.e2e-spec.ts`
- Create: `apps/web/src/app/kiosk/page.tsx` (fullscreen keypad, branch name, clock, success screen with name and time, optional selfie), branch page «أجهزة الحضور» (pair/revoke), ESS profile «رمز الحضور السريع (PIN)», mock

**Interfaces:**
- API: `POST /branches/:id/kiosks {name}` (OWNER/HR_ADMIN/that branch's manager) → `{ id, name, token }` (token once, 32 random bytes hex; stored sha256); `GET /branches/:id/kiosks`; `DELETE /kiosks/:id` (revoke); `POST /me/kiosk-pin {pin}` (4–6 digits) and `POST /employees/:id/kiosk-pin {pin}` (OWNER/HR_ADMIN); `POST /kiosk/punch` with header `X-Kiosk-Token` body `{ employeeNumber, pin, selfie? }` → `{ action: 'IN'|'OUT', employeeName, time, lateMinutes }` (IN when no check-in today, else OUT); `GET /kiosk/me` → `{ branchName, companyName }`.
- Errors: bad/revoked token → 401; unknown employee, wrong PIN, or other branch → the same 401 «رقم الموظف أو الرمز غير صحيح»; locked → 423 «تم إيقاف الرمز مؤقتاً لكثرة المحاولات، حاول بعد 15 دقيقة» (only after 5 failures in 15 min for an existing employee); records get `source: 'KIOSK'` and flag `KIOSK`; selfie rule from Task 6 applies.

- [ ] **Step 1: API e2e first** — pair → token works once listed; punch IN then OUT; wrong PIN ×5 → 423 on 6th even with the right PIN; unknown employee number → 401 (same message); employee from another branch → 401; revoked device → 401; EMPLOYEE role cannot pair (403). FAIL → implement (guard resolves device by sha256, updates lastSeenAt; reuse attendance compute from me.controller via the attendance service) → PASS.
- [ ] **Step 2: UI + mock** — kiosk page stores token in localStorage after a pairing screen («أدخل رمز الجهاز»), large keypad, Arabic-Indic digits accepted, auto-reset after 5 s; mock mirrors (seed one paired demo kiosk for «فرع العليا» and PIN 1234 for demo employees, shown on the demo kiosk screen). tsc + vitest (PIN lock logic test in mock).
- [ ] **Step 3: Commit** `feat: branch kiosk mode with PIN and lockout`

### Task 8: Open shifts and shift swaps

**Files:**
- Modify: schema (models `OpenShift { id, companyId, branchId, shiftId, date @db.Date, slots Int, filled Int @default(0), note, status OPEN|FILLED|CANCELLED, createdById, createdAt }`, `OpenShiftClaim { id, openShiftId, employeeId, assignmentId, createdAt; @@unique([openShiftId, employeeId]) }`, `ShiftSwapRequest { id, companyId, requesterId, requesterAssignmentId, targetEmployeeId, targetAssignmentId?, status PENDING_PEER|PENDING_MANAGER|APPROVED|REJECTED|CANCELLED, note, decidedById?, createdAt, updatedAt }`), migration `open_shifts_swaps`
- Create: `apps/api/src/scheduling/{scheduling.controller.ts,scheduling.service.ts,scheduling.module.ts,scheduling.dto.ts}`, e2e `apps/api/test/scheduling.e2e-spec.ts`
- Modify: web roster page (publish open shift, swap approvals inbox), new ESS page `src/app/me/shifts/page.tsx` (my week, open shifts to claim, swap requests in/out) + ESS nav, mock

**Interfaces:**
- API (managers = OWNER/HR_ADMIN/BRANCH_MANAGER scoped): `POST /open-shifts {branchId, shiftId, date, slots, note?}`; `GET /open-shifts?branchId&from&to`; `POST /open-shifts/:id/cancel`. Employees: `GET /me/open-shifts` (own branch, date ≥ today, OPEN); `POST /me/open-shifts/:id/claim` → ShiftAssignment (409 «لديك وردية في هذا اليوم» / 409 «اكتملت هذه الوردية»). Swaps: `POST /me/swaps {myAssignmentId, targetEmployeeId, targetAssignmentId?: string|null, note?}`; `GET /me/swaps` (incoming + outgoing); `POST /me/swaps/:id/accept|reject|cancel`; managers `GET /swaps?status=PENDING_MANAGER`, `POST /swaps/:id/approve|reject`.
- Atomicity: claim uses conditional `updateMany({ where: { id, status: 'OPEN', filled: { lt: slots } } ... })` — implement as `filled < slots` check via raw `UPDATE … SET filled = filled + 1 WHERE id = $1 AND filled < slots RETURNING filled, slots` in a transaction, then create assignment; approve re-checks both assignments still belong to the original employees/dates (409 «تغيّر الجدول، أعد إنشاء الطلب»).
- Notifications (existing NotifyService): new open shift → branch employees; swap request → target; accepted → branch manager; decision → both.

- [ ] **Step 1: API e2e first** — publish 1-slot open shift; two concurrent claims → one 201, one 409 «اكتملت هذه الوردية», status FILLED; employee with an assignment that day → 409 «لديك وردية في هذا اليوم»; employee of another branch cannot see/claim; swap flow peer accept → manager approve swaps employeeIds of both assignments; give-away (`targetAssignmentId:null`) moves the assignment; approve after requester's assignment was deleted → 409; BRANCH_MANAGER of another branch → 403. FAIL → implement → PASS.
- [ ] **Step 2: UI + mock** — roster: «نشر وردية مفتوحة» modal, open-shift chips on the grid, swaps inbox; ESS «وردياتي» page; mock mirrors incl. slot race guard. tsc + vitest (mock claim/approve logic).
- [ ] **Step 3: Commit** `feat: open shifts and shift swaps`

### Task 9: Competitive repricing and copy

**Files:**
- Modify: `apps/api/src/platform/platform.service.ts` (`DEFAULT_PRICES` ESSENTIALS 12, GROWTH 19), schema default JSON for `PlatformSettings.prices`, migration `repricing` (UPDATE the row only when prices still equal `{"ESSENTIALS":19,"GROWTH":29,"ENTERPRISE":null}`), affected unit/e2e expectations
- Modify: `apps/web/src/components/marketing/data.ts` (TIERS 12/19, features per spec §8, COMPARISON rows for new features, FAQ min-10/monthly/annual −15%), pricing page copy, `apps/web/src/demo/seed-platform.ts` settings, `taqam/marketing/build/profile.template.html` (+ rebuild PDF via `cd apps/web && node ../../marketing/build/build.cjs`, no OVERFLOW), `taqam/README.md`, `taqam/docs/ADMIN_PORTAL.md` price lines

- [ ] **Step 1: Tests first** — platform settings unit: defaults ESSENTIALS 12 / GROWTH 19; migration e2e/check: settings row with old defaults becomes 12/19, a customised row (e.g. GROWTH 25) unchanged; web test: TIERS prices 12/19 and Growth lists «مركز الامتثال». FAIL → implement → PASS.
- [ ] **Step 2:** update copy, profile PDF (pricing + the new features pages) and docs; rebuild PDF; run all web/api suites.
- [ ] **Step 3: Commit** `feat: competitive pricing (12/19 SAR) and updated product copy`

### Task 10: Final verification and release

- [ ] Run `packages/core npm test`, `apps/api npx tsc --noEmit && npm test && npm run test:e2e && npm run build`, `apps/web npx tsc --noEmit && npx vitest run`, demo build `NEXT_PUBLIC_DEMO=1 NEXT_PUBLIC_BASE_PATH= npx next build` and standalone `npx next build`.
- [ ] Playwright smoke on the export: compliance center, saudization official/internal, WPS checker on a run, sector documents tab, ESS selfie + offline banner, kiosk punch with PIN 1234, open-shift claim and swap approval, pricing page 12/19; screenshots reviewed.
- [ ] Code review of the whole branch diff with the `code-review` skill (high) and fix confirmed findings.
- [ ] Push; confirm CI, Taqam CI and Pages are green.
