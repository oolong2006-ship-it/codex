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

---

# v2 — Billing (invoices) & subscription reminders

Extends v1 above. All money values are numbers rounded with core `round2`. Dates: `YYYY-MM-DD` for calendar days (Riyadh), ISO for instants.

## Settings additions (`GET/PATCH /admin/settings`)
```
billing:   { sellerName: 'شؤون لتقنية المعلومات', sellerNameEn: 'Shuoon IT', sellerVatNumber: '', sellerCrNumber: '',
             sellerAddress: 'الرياض، المملكة العربية السعودية', sellerEmail: 'hello@shuoon.net', sellerPhone: '+966 55 042 1235',
             vatRate: 0.15, invoiceDueDays: 7, bankName: '', iban: '' }
reminders: { enabled: true, trialDays: [7, 3, 1], subscriptionDays: [14, 7, 1], notifyOnExpiry: true, overdueInvoiceDays: [1, 7] }
```
PATCH accepts partial `billing` / `reminders` objects (merged). Validation: vatRate 0..1, invoiceDueDays 0..90, day lists = ints 0..60 (max 6 items).

## Invoice
```
Invoice = { id, number, companyId, companyName, status: 'ISSUED'|'PAID'|'VOID', overdue: boolean,
  plan, billingCycle, periodStart, periodEnd, months, employees, unitPrice,
  subtotal, discountRate, discount, taxable, vatRate, vat, total,
  issueDate, dueDate, paidAt, paymentMethod: 'BANK_TRANSFER'|'CARD'|'CASH'|'OTHER'|null, paymentRef, notes, voidReason,
  createdByName, createdAt }
```
- `number` = `SH-<issue year>-<4-digit sequence per year>` (e.g. `SH-2026-0007`), unique.
- `months` = 1 (MONTHLY) or 12 (ANNUAL). `periodEnd` = periodStart + months − 1 day.
- `subtotal = employees × unitPrice × months`; `discountRate` = annualDiscount for ANNUAL else 0; `discount = round2(subtotal × discountRate)`;
  `taxable = subtotal − discount`; `vat = round2(taxable × vatRate)`; `total = round2(taxable + vat)`.
- `overdue` = status ISSUED and dueDate < today (Riyadh).

## Endpoints (SUPER_ADMIN)
| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | /admin/invoices | `status, companyId, search (number or company name), overdue=true, page, pageSize` | `Paginated<Invoice> & { summary: { outstanding: {count, amount}, overdue: {count, amount}, paidThisMonth: {count, amount} } }` (summary ignores filters) |
| GET | /admin/invoices/:id | | `Invoice & { company: { id, nameAr, nameEn, crNumber, vatNumber, city, ownerName, ownerEmail, ownerPhone }, seller: billing settings }` |
| POST | /admin/companies/:id/invoices | `{ periodStart?, employees?, unitPrice?, billingCycle?, notes?, sendEmail? = true }` | `Invoice` (201). Defaults: periodStart = day after the latest non-void invoice's periodEnd, else today; employees = max(1, activeEmployees); unitPrice = effectivePrice; billingCycle = company's. 400 `'حدد سعر الموظف لهذه المنشأة أولاً'` when no price; 400 `'لا يمكن إصدار فاتورة لمنشأة بانتظار الموافقة'` for PENDING. Logs `INVOICE_ISSUED`; emails owner (`INVOICE_ISSUED`) unless sendEmail=false. |
| POST | /admin/invoices/:id/pay | `{ paymentMethod, paymentRef?, paidAt? (YYYY-MM-DD, default today), extendSubscription? = true }` | `Invoice`. Atomic ISSUED→PAID (else 409 `'تمت معالجة هذه الفاتورة مسبقاً'`). When extendSubscription: subscriptionEndsAt = max(current, end of periodEnd day); TRIAL/EXPIRED → ACTIVE (activatedAt if null); SUSPENDED stays suspended. Logs `INVOICE_PAID`; emails `PAYMENT_RECEIVED`. |
| POST | /admin/invoices/:id/void | `{ reason }` (required) | `Invoice`. Atomic ISSUED→VOID (else 409 same message). Logs `INVOICE_VOIDED`. |
| GET | /admin/emails | `type, status, companyId, page, pageSize` | `Paginated<EmailLog & { companyName }>` newest first |
| POST | /admin/companies/:id/remind | `{ message? }` | `EmailLog` — manual reminder to the owner (`MANUAL_REMINDER`), body includes plan, status, days left, contact |
| POST | /admin/reminders/run | | `{ sent: number }` — runs the reminder job now |

`GET /admin/companies/:id` adds `invoices: Invoice[]` (latest 20) and `emails: EmailLog[]` (latest 20).
`CompanyEventType` adds `INVOICE_ISSUED | INVOICE_PAID | INVOICE_VOIDED | REMINDER_SENT`.

## Company owner (OWNER only)
| GET | /billing/subscription | | `{ status, plan, billingCycle, effectivePrice, maxEmployees, activeEmployees, trialEndsAt, subscriptionEndsAt, daysLeft }` |
| GET | /billing/invoices | `page, pageSize` | `Paginated<Invoice>` (own company; VOID included) |
| GET | /billing/invoices/:id | | same shape as admin invoice detail (own company only, else 404) |

## Email
```
EmailLog = { id, companyId, to, subject, body, type, status: 'SENT'|'FAILED'|'LOGGED', error, createdAt }
type ∈ TRIAL_ENDING | SUBSCRIPTION_ENDING | EXPIRED | INVOICE_ISSUED | PAYMENT_RECEIVED | INVOICE_OVERDUE | MANUAL_REMINDER
```
- Sent with SMTP when `SMTP_HOST` is set (`SMTP_PORT` default 587, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `SMTP_FROM` default `شؤون <hello@shuoon.net>`); otherwise stored with status `LOGGED` (outbox, nothing leaves the server). A send error → `FAILED` with `error`; never throws to the caller.
- Recipient: the company's first active OWNER user (fallback: first OWNER). No owner → skipped.
- Bodies are Arabic first with an English paragraph; plain text (`body`) plus simple RTL HTML generated from it.
- Every reminder also creates an in-app `Notification` for the owner.
- Dedupe: automatic reminders store a unique `dedupeKey` (`TRIAL_ENDING:<companyId>:<endDay>:<daysLeft>`, `SUBSCRIPTION_ENDING:…`, `EXPIRED:<companyId>:<endDay>`, `INVOICE_OVERDUE:<invoiceId>:<daysOverdue>`) so re-running the job never double-sends.

## Reminder job
Daily 09:00 Asia/Riyadh (`subscription-reminders`) and `POST /admin/reminders/run`, when `reminders.enabled`:
1. TRIAL with daysLeft ∈ trialDays → `TRIAL_ENDING`.
2. ACTIVE with subscriptionEndsAt and daysLeft ∈ subscriptionDays → `SUBSCRIPTION_ENDING`.
3. ISSUED invoices with (today − dueDate) ∈ overdueInvoiceDays → `INVOICE_OVERDUE`.
4. Each successful automatic reminder logs a `REMINDER_SENT` CompanyEvent with `{ type, daysLeft }`.
On expiry (`PlatformService.expire`) when `notifyOnExpiry` → `EXPIRED` email.

## Web
- Admin sidebar: «الفواتير» `/admin/invoices`, «الرسائل» `/admin/emails`.
- `/admin/invoices`: summary tiles (مستحقة، متأخرة، محصّلة هذا الشهر), status tabs, search, table (number, company, period, total, due, status chip, overdue in red); actions: view, «تسجيل الدفع», «إلغاء».
- `/admin/invoices/view?id=…`: printable A4 tax invoice (فاتورة ضريبية): seller & buyer blocks with VAT numbers, line table, subtotal/discount/VAT/total, bank details, status stamp (مدفوعة / ملغاة), Print button. (Query param, not a dynamic segment, so it works in the static demo.)
- Company detail: tabs «الفواتير» (list + «إصدار فاتورة» modal with live calculation preview) and «الرسائل» (email log); header action «إرسال تذكير».
- `/admin/emails`: log with type/status filters, preview drawer of the body, button «تشغيل التذكيرات الآن». Banner when status LOGGED: «لم يُضبط خادم البريد بعد؛ الرسائل محفوظة ولم تُرسل».
- `/admin/settings`: sections «بيانات الفوترة» and «التذكيرات التلقائية».
- Company app: `/app/billing` «الاشتراك والفواتير» (OWNER only, nav item under الإعدادات): subscription card + invoices list + the same printable invoice (`/app/billing/view?id=…`).
- Demo mock mirrors all of the above; demo emails are always `LOGGED`; the reminder job runs lazily when `/admin/overview` loads (once per demo day).

## Implementation notes (API)
- **Storage**: `PlatformSettings.billing` / `.reminders` are JSON columns holding partial overrides; `GET /admin/settings` always returns the full shape with defaults merged in. PATCH day lists are de-duplicated and sorted descending (`[1,7]` → `[7,1]`).
- **Master switch**: `reminders.enabled = false` also suppresses the `EXPIRED` email (sent only when `enabled && notifyOnExpiry`).
- **Money**: `round2` is applied after trimming binary noise from the product (12 significant digits), so `683.3 × 0.15` → `102.5` (half-up), not `102.49`.
- **periodEnd** clamps month-ends: `2026-01-31` monthly → `2026-02-27` (Jan 31 + 1 month = Feb 28, − 1 day); `2028-02-29` annual → `2029-02-27`.
- **Numbers**: next = highest sequence used in that year + 1 (retried on a unique clash). A hard-deleted company takes its invoices with it, so its numbers can be reused.
- **Invoice.companyName** is the buyer name snapshotted at issue; the detail's `company` block is live company data. Invoice dates (`periodStart`, `periodEnd`, `issueDate`, `dueDate`) are `YYYY-MM-DD`; `paidAt` is an ISO instant (now when `paidAt` is today or omitted, else 12:00 Riyadh of that day).
- **Pay**: when the company has no `subscriptionEndsAt` (open-ended), paying sets it to the end of `periodEnd` (literal `max`). TRIAL → ACTIVE also clears `trialEndsAt`. `extendSubscription=false` changes nothing on the company. PENDING (never invoiced in practice) is left as is.
- **REMINDER_SENT data**: `{ type, daysLeft }` for TRIAL_ENDING / SUBSCRIPTION_ENDING; `{ type: 'EXPIRED', daysLeft: 0 }`; `{ type: 'INVOICE_OVERDUE', daysOverdue, invoiceId, number }`. The manual reminder also logs `REMINDER_SENT` (with the admin) as `{ type: 'MANUAL_REMINDER', daysLeft, emailId, status }`.
- **`POST /admin/reminders/run`** first persists due expiries (which send `EXPIRED` emails); `sent` counts only the TRIAL_ENDING / SUBSCRIPTION_ENDING / INVOICE_OVERDUE reminders of that run that ended `SENT` or `LOGGED`.
- **`POST /admin/companies/:id/remind`** → `201`; `404 'لا يوجد مالك لهذه المنشأة'` when the company has no OWNER.
- **Notifications**: an in-app notification (link `/app/billing`) is created for the owner for every email type, not only reminders.
- **Email log**: responses omit `dedupeKey`; in `/admin/emails`, `companyName` is the live name (`null` once the company is deleted — the rows are kept). With SMTP the row is claimed first (status `FAILED`, error `sending…`) and flipped to `SENT` when accepted, so concurrent runs never double-send; a real failure releases the dedupe key so a later run retries.
- `GET /admin/invoices?overdue=false` is accepted too (excludes overdue).

---

# v2.1 — Review fixes (2026-10-29): tax-invoice compliance, integrity, concurrency

Decisions taken after the five-specialist review. Supersedes conflicting v2 rules above.

## Tax-invoice compliance (ZATCA)
- **VAT registration gate.** `billing.sellerVatNumber` must be empty or a valid Saudi TRN: 15 digits, starts and ends with `3` (400 `'الرقم الضريبي يجب أن يكون 15 رقماً يبدأ وينتهي بالرقم 3'`).
  - Registered (valid TRN): invoices carry `vatRate` from settings, `documentType: 'TAX_INVOICE'`, title «فاتورة ضريبية / Tax Invoice».
  - Not registered (empty TRN): invoices are issued with `vatRate = 0`, `vat = 0`, `documentType: 'INVOICE'`, title «فاتورة / Invoice» and the note «المنشأة غير مسجلة في ضريبة القيمة المضافة».
- **Snapshots.** At issue, the invoice row stores `seller` (name, nameEn, vatNumber, crNumber, address, email, phone, bankName, iban) and `buyer` (nameAr, nameEn, vatNumber, crNumber, address, city) as JSON. Views render only from the snapshot; later settings/company edits never change an issued document. Detail responses keep `company` (live, for links) but the document uses `seller`/`buyer` from the invoice.
- **Issue instant.** `issuedAt` (ISO instant) stored and printed with time (Riyadh). `issueDate` stays the Riyadh calendar day.
- **Supply period** printed as a labelled field «فترة التوريد / Supply period» (periodStart–periodEnd).
- **Line VAT.** The line table shows unit price «غير شامل الضريبة», VAT rate and VAT amount per line.
- **QR (Phase 1).** Tax invoices show a ZATCA Phase-1 TLV QR (base64 of tags 1 seller name, 2 VAT number, 3 timestamp ISO 8601, 4 total incl. VAT, 5 VAT total). Not shown on non-tax invoices. Footer wording: «صادرة من نظام شؤون» — never claim FATOORA integration.
- **No voiding issued documents — credit notes instead.** `POST /admin/invoices/:id/void` is removed. New `POST /admin/invoices/:id/credit` `{ reason }` (required, ≤ 1000):
  - Allowed when the invoice is ISSUED or PAID and not already credited (atomic; else 409 `'تمت معالجة هذه الفاتورة مسبقاً'`).
  - Creates a credit note: `documentType: 'CREDIT_NOTE'`, own sequence `SHC-<year>-<4 digits>`, `creditsInvoiceId` + `creditsNumber`, same seller/buyer snapshot, same lines/period, amounts equal to the original (positive numbers, presented as a credit), `status: 'ISSUED'`, `reason`.
  - The original becomes `status: 'CREDITED'` with `creditedByNumber` (it stays printable, stamped «صدر بحقها إشعار دائن SHC-…»).
  - Does not change the subscription. Logs `INVOICE_CREDITED`. No email to the customer by default.
  - Credit notes are not payable and are excluded from outstanding/overdue summaries; list filter `status=CREDITED` shows credited originals; `type=CREDIT_NOTE` lists credit notes. Default list shows both kinds.
  - Period overlap checks ignore CREDITED invoices (the period can be re-invoiced).
- **Retention.** Invoices are never deleted: `DELETE /admin/companies/:id` returns 409 `'لا يمكن حذف منشأة لها فواتير صادرة؛ أوقف الحساب بدلاً من ذلك'` when the company has any invoice or credit note. FK is `onDelete: Restrict`.
- **Numbering** uses a per-year, per-series counter table updated atomically inside the issue transaction (`UPDATE … RETURNING`). Numbers are never reused, even if rows disappear.
- **Minimum billing.** Default `employees` = max(`billing.minBilledEmployees` (default 10), activeEmployees) for ESSENTIALS/GROWTH; ENTERPRISE = max(1, activeEmployees). Explicit `employees` still allowed (≥ 1).

## Integrity & concurrency
- Issue: per-company advisory lock inside the transaction; default period computed inside it; reject a period overlapping a non-CREDITED invoice of the same company with 409 `'توجد فاتورة تغطي هذه الفترة'`. Default `periodStart` = max(day after last periodEnd, today) when the company is EXPIRED or the computed start is in the past by more than 0 days for EXPIRED companies.
- `periodStart` must be within [today − 60 days, today + 90 days]; `unitPrice` ≤ 2 decimals and ≤ 99,999,999; `employees` ≤ 100,000; totals over 9,999,999,999.99 → 400.
- Pay: `SELECT … FOR UPDATE` on the company inside the transaction; only revive TRIAL/EXPIRED → ACTIVE when the new end is in the future (else 400 `'فترة هذه الفاتورة انتهت؛ أصدر فاتورة لفترة حالية'` unless `extendSubscription=false`). `paidAt` cannot be in the future or before issueDate.
- Summary `paidThisMonth` bounded to the current Riyadh month.
- Monthly periods anchored to the original day of month; a clamped month ends on its last day (Jan 31 → Feb 28, next starts Mar 1… then Mar 31).
- Reminders catch up: for each target, send the smallest configured threshold ≥ daysLeft that has not been sent for that end day (same dedupe keys).
- Expiry listeners never block the request path (fire-and-forget, errors logged). Notifications are created only for non-FAILED emails. Stale "sending" email claims (> 15 min) are released by the job.
- Company names: ≤ 200 chars, control characters/newlines stripped.

## Security
- Logout and every login/register clear the stored impersonation admin token.
- Admin bootstrap: creates the admin if missing; when it exists, only updates the password if it differs from `PLATFORM_ADMIN_PASSWORD` and then bumps `tokenVersion`; never forces `isActive`.

### v2.1 field names (API ↔ web)
`Invoice` adds: `documentType: 'TAX_INVOICE'|'INVOICE'|'CREDIT_NOTE'`, `issuedAt` (ISO), `seller` (snapshot object), `buyer` (snapshot object), `creditsInvoiceId`, `creditsNumber`, `creditedByNumber`, `reason`, `qr` (base64 ZATCA Phase-1 TLV for TAX_INVOICE and credit notes of tax invoices, else null — computed by the API, rendered as a QR image by the web).
`status` ∈ `ISSUED | PAID | CREDITED` (VOID removed; existing VOID rows migrate to CREDITED only if a credit note is created — the migration converts VOID → CREDITED and creates matching credit notes). List query adds `type=INVOICE|CREDIT_NOTE`. Settings `billing` adds `minBilledEmployees` (default 10). `GET /api/health` checks the database (`SELECT 1`) and returns 503 when it is down.
