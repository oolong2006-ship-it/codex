# بوابة مالك المنصة | Platform Admin Portal — Contract (v1)

The platform owner (Shuoon itself) manages every subscriber company from `/admin` in the web app.
This extends `docs/API_CONTRACT.md`; all its conventions apply (JSON, `{statusCode, message, messageAr}` errors, pagination `{data,total,page,pageSize}`).

## Role
New role **`SUPER_ADMIN`**: a platform user with `companyId = null` and `employeeId = null`.
- JWT payload: `{ sub, role: 'SUPER_ADMIN', companyId: null, employeeId: null, branchId: null }`.
- SUPER_ADMIN can call ONLY `/auth/*` and `/admin/*` (403 elsewhere). Company roles get 403 on `/admin/*`.
- `GET /auth/me` for SUPER_ADMIN returns `{ id, email, name, role, companyId: null, employeeId: null, branchId: null, company: null }`.
- Web: `homeFor(user)` → `/admin` for SUPER_ADMIN.
- Seed: `admin@shuoon.demo` / `Shuoon@2026` (name "مدير المنصة"). Also `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD` env vars create/refresh one on API boot (production bootstrap).

## Company lifecycle
New fields on Company:
| field | type | notes |
|---|---|---|
| `status` | `'PENDING'\|'TRIAL'\|'ACTIVE'\|'SUSPENDED'\|'EXPIRED'` | |
| `plan` | `'ESSENTIALS'\|'GROWTH'\|'ENTERPRISE'` | default `GROWTH` |
| `billingCycle` | `'MONTHLY'\|'ANNUAL'` | default `MONTHLY` |
| `maxEmployees` | int \| null | seat limit; null = unlimited |
| `pricePerEmployee` | number \| null | override; null = plan list price (19 / 29 / null) |
| `trialEndsAt` | date \| null | |
| `subscriptionEndsAt` | date \| null | |
| `activatedAt`, `suspendedAt` | datetime \| null | |
| `suspensionReason` | string \| null | |
| `adminNotes` | string \| null | internal, never shown to the company |
| `lastActivityAt` | datetime \| null | updated on any authenticated request by that company (throttled ≤ 1 write / 5 min) |

Rules:
- `POST /auth/register` creates the company with `status = 'PENDING'` (platform setting `requireApproval`, default true) or `'TRIAL'` with `trialEndsAt = now + trialDays` (default 14) when approval is off. The response is still `AuthResponse`, plus `company.status`.
- **Login / any authenticated company request** when company status is:
  - `PENDING` → 403 `messageAr: 'حساب منشأتك قيد المراجعة، وسيتم تفعيله قريباً'`, `code: 'COMPANY_PENDING'`
  - `SUSPENDED` → 403 `messageAr: 'تم إيقاف حساب منشأتك. تواصل مع الدعم'`, `code: 'COMPANY_SUSPENDED'`
  - `EXPIRED` → 403 `messageAr: 'انتهى اشتراك منشأتك. تواصل معنا للتجديد'`, `code: 'COMPANY_EXPIRED'`
  - `TRIAL` / `ACTIVE` → allowed.
- Expiry: a TRIAL past `trialEndsAt`, or an ACTIVE past `subscriptionEndsAt` (if set), is treated as `EXPIRED` (persist the change lazily on access and in a daily job).
- Seat limit: creating an employee when ACTIVE employees ≥ `maxEmployees` → 403 `messageAr: 'وصلت إلى الحد الأقصى لعدد الموظفين في باقتك'`, `code: 'SEAT_LIMIT'`.
- Every lifecycle change writes a `CompanyEvent` `{ id, companyId, type, fromStatus, toStatus, data, adminId, adminName, createdAt }` with `type` in `REGISTERED | ACTIVATED | SUSPENDED | REACTIVATED | PLAN_CHANGED | EXTENDED | NOTE | IMPERSONATED | EXPIRED | DELETED`.

## Endpoints (SUPER_ADMIN only)
| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | /admin/overview | | `{ companies: {total, pending, trial, active, suspended, expired}, employees, users, mrr, arr, signupsByMonth: {period, count}[] (12), mrrByPlan: {plan, mrr, companies}[], expiringSoon: AdminCompany[] (trial/subscription ending ≤ 14 days), recentSignups: AdminCompany[] (5), newLeads }` — `mrr` = Σ ACTIVE companies `activeEmployees × price` (annual cycle × 0.85) |
| GET | /admin/companies | `search, status, plan, sort=createdAt\|name\|employees\|lastActivityAt, page, pageSize` | paginated `AdminCompany` |
| GET | /admin/companies/:id | | `AdminCompany & { owner: {id,name,email,phone?}, users: {id,name,email,role,isActive,lastLoginAt}[], usage: { employees, activeEmployees, branches, users, payrollRuns, lastPayrollPeriod, leaveRequests30d, checkIns30d }, events: CompanyEvent[] (latest 50) }` |
| POST | /admin/companies/:id/activate | `{ plan, billingCycle, maxEmployees?, pricePerEmployee?, mode: 'TRIAL'\|'PAID', trialDays? (default 14), subscriptionEndsAt? }` | `AdminCompany` (status TRIAL or ACTIVE) |
| POST | /admin/companies/:id/suspend | `{ reason }` (required) | `AdminCompany` |
| POST | /admin/companies/:id/reactivate | `{}` | back to ACTIVE (or TRIAL if trial not ended) |
| PATCH | /admin/companies/:id | `{ plan?, billingCycle?, maxEmployees?, pricePerEmployee?, trialEndsAt?, subscriptionEndsAt?, adminNotes?, nameAr?, nameEn? }` | `AdminCompany` (logs PLAN_CHANGED / EXTENDED / NOTE as relevant) |
| POST | /admin/companies/:id/extend | `{ days }` | extends trialEndsAt (TRIAL) or subscriptionEndsAt (ACTIVE); EXPIRED → ACTIVE |
| POST | /admin/companies/:id/impersonate | | `AuthResponse` for the company OWNER (token 1h, payload adds `impersonatedBy: adminId`); logs IMPERSONATED. Allowed even when PENDING/SUSPENDED (support use) |
| POST | /admin/companies/:id/users/:userId/reset-password | | `{ temporaryPassword }` |
| DELETE | /admin/companies/:id | `{ confirmName }` must equal nameAr | `{ ok: true }` (hard delete all tenant data) |
| GET | /admin/leads | `status=NEW\|CONTACTED\|CONVERTED\|LOST, search, page` | paginated `Lead = { id, name, company, email, phone, employeesCount, sector, message, status, notes, createdAt }` |
| PATCH | /admin/leads/:id | `{ status?, notes? }` | `Lead` |
| GET | /admin/events | `companyId?, type?, page` | paginated CompanyEvent (platform activity log) |
| GET | /admin/admins | | `{ id, name, email, isActive, lastLoginAt, createdAt }[]` |
| POST | /admin/admins | `{ name, email, password }` | admin |
| PATCH | /admin/admins/:id | `{ isActive?, name? }` (cannot deactivate yourself → 400) | admin |
| GET / PATCH | /admin/settings | `{ requireApproval: boolean, trialDays: number, prices: { ESSENTIALS: 19, GROWTH: 29, ENTERPRISE: null }, annualDiscount: 0.15 }` | settings |
| POST | /admin/broadcast | `{ title, body, target: 'ALL'\|'ACTIVE'\|'TRIAL', }` | `{ sent: number }` — creates a Notification for every OWNER/HR_ADMIN of matching companies |

`AdminCompany = { id, nameAr, nameEn, sector, city, crNumber, status, plan, billingCycle, maxEmployees, pricePerEmployee, effectivePrice, employeesCount, activeEmployees, usersCount, branchesCount, mrr, trialEndsAt, subscriptionEndsAt, daysLeft (null|int), activatedAt, suspendedAt, suspensionReason, adminNotes, ownerName, ownerEmail, ownerPhone, lastActivityAt, createdAt }`

## Seed additions
- `admin@shuoon.demo` (SUPER_ADMIN).
- Demo company "مطاعم ورد الشام" → ACTIVE, GROWTH, MONTHLY, maxEmployees 60, subscriptionEndsAt +10 months.
- 7 extra small companies (few employees each, realistic Saudi names across sectors) in mixed states: 2 PENDING (registered 1–3 days ago), 2 TRIAL (one ending in 3 days), 1 SUSPENDED (reason "تأخر السداد"), 1 EXPIRED, 1 ACTIVE ENTERPRISE with pricePerEmployee 22. Each has an OWNER user (password `Shuoon@2026`) and 3–15 employees, plus events history.
- 6 leads across statuses.

## Web: `/admin` (SUPER_ADMIN only; others → their home)
Shell distinct from the company dashboard (night `#0C1F24` sidebar, label «بوابة المنصة»). Pages:
- `/admin` overview: KPI tiles (companies by status, MRR/ARR, employees, users), signups chart (12 mo), MRR by plan, "تحتاج إجراء": pending approvals (activate inline), trials/subscriptions expiring soon, new leads.
- `/admin/companies`: table with status chips, plan, employees/seat limit bar, MRR, days left, last activity; filters (status tabs with counts, plan, search), sort.
- `/admin/companies/[id]`: header with status + primary action (تفعيل / إيقاف / إعادة تفعيل); tabs: نظرة عامة (info, owner, usage stats), الاشتراك (plan, cycle, price, seats, dates; edit + extend), المستخدمون (list, reset password → show temp password once), السجل (events timeline), ملاحظات داخلية. Actions: activate modal (plan, cycle, trial/paid, seats, price, end date), suspend modal (reason required), impersonate («الدخول كمالك المنشأة» → stores admin token, switches to company session at /app with a sticky banner «أنت تتصفح كـ … — العودة إلى بوابة المنصة» that restores the admin token), delete (type name to confirm).
- `/admin/leads`: kanban or table by status, notes, mark contacted/converted/lost.
- `/admin/activity`: platform event log.
- `/admin/broadcast`: send announcement to companies.
- `/admin/settings`: approval required toggle, trial days, plan prices, annual discount; platform admins management.
- Login page: show the API's Arabic message for PENDING/SUSPENDED/EXPIRED in a clear state; after signup, if `company.status === 'PENDING'`, show a success screen «تم استلام طلبك، وسنفعّل حسابك خلال يوم عمل» instead of entering /app.
