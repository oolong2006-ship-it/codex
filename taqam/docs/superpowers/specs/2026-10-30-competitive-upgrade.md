# Shuoon competitive upgrade — spec (2026-10-30)

Source: `reports/مقارنة شؤون بالمنافسين.md` (competitive research). Approved by the owner: implement gaps 1–7 and reprice to compete.

## 1. Qiwa-documented Saudization
- Since 15 Apr 2026 only Saudis whose contracts are documented in Qiwa count for Nitaqat.
- Employee gets `qiwaDocumented: boolean` (default `false`) and `qiwaDocumentedAt: Date | null`. Migration sets existing **Saudi** employees to `false` (the owner must confirm each — the UI explains why).
- Official rate = documented Saudis / all active employees. Internal rate = all Saudis / all active employees. Both shown; the band uses the **official** rate.
- `marginToDrop` = how many documented Saudis can leave before the official band drops (0 when already RED).
- Alert «تنبيه نطاقات» when `undocumentedSaudis > 0` or `marginToDrop <= 1`.

## 2. Mudad / WPS pre-upload checker
Issue codes and severity (ERROR blocks the «جاهز للرفع» badge, WARNING does not):
| code | severity | rule | messageAr |
|---|---|---|---|
| INVALID_IBAN | ERROR | IBAN fails mod-97 / not SA | رقم الآيبان غير صالح |
| MISSING_NATIONAL_ID | ERROR | empty id | رقم الهوية/الإقامة مفقود |
| NON_POSITIVE_NET | ERROR | net ≤ 0 | صافي الراتب يجب أن يكون أكبر من صفر |
| DUPLICATE_NATIONAL_ID | ERROR | id appears twice | رقم الهوية مكرر في الملف |
| EMPLOYEE_MISSING_FROM_RUN | ERROR | active employee hired on/before period end without a payslip | موظف نشط غير موجود في المسير |
| NET_MISMATCH | ERROR | abs(gross − deductions − net) > 0.01 | الصافي لا يساوي الإجمالي ناقص الخصومات |
| DEDUCTION_OVER_HALF | WARNING | deductions > 50% of gross (Art. 92) | الخصومات تتجاوز نصف الأجر (م92) |
| PAID_BELOW_CONTRACT | WARNING | basic paid < contracted basic and no absence/unpaid leave recorded | الأجر الأساسي المدفوع أقل من العقد دون غياب مسجل |
| LATE_PAYMENT | WARNING | paymentDate > period end + 7 days | تاريخ الصرف متأخر عن نهاية الشهر بأكثر من 7 أيام |
Payroll run stores `wpsExportedAt` on export.

## 3. GOSI two regimes (new Social Insurance Law)
- Employee gets `gosiFirstRegisteredAt: Date | null`. Saudi employee is NEW regime when that date ≥ 2024-07-03, else LEGACY (null ⇒ LEGACY).
- Pension (annuity) rate per side: LEGACY 9%. NEW: 9% for periods before 2025-07, 9.5% from 2025-07, 10% from 2026-07, 10.5% from 2027-07, 11% from 2028-07 onward.
- SANED 0.75% per side and occupational hazards 2% employer unchanged; non-Saudi unchanged; base clamp 1,500–45,000 unchanged.
- Note on screens/docs: «النسب وفق نظام التأمينات الجديد؛ يُنصح بمطابقتها مع التأمينات».

## 4. Sector documents
- New `DocumentType` values: `HEALTH_CERTIFICATE` (الشهادة الصحية — بلدي), `PROFESSIONAL_LICENSE` (ترخيص مزاولة — الهيئة السعودية للتخصصات الصحية), `DRIVER_CARD` (بطاقة السائق — هيئة النقل العام), `DRIVING_LICENSE` (رخصة القيادة).
- Required per company sector: RESTAURANTS → HEALTH_CERTIFICATE; HEALTHCARE → PROFESSIONAL_LICENSE; LOGISTICS → DRIVER_CARD + DRIVING_LICENSE; all sectors, non-Saudis → IQAMA. Employee may be exempted per type (`docExemptions: DocumentType[]`, e.g. an accountant in a clinic).
- Compliance result per employee: MISSING / EXPIRED / CRITICAL (≤30d) / WARNING (≤90d).

## 5. Compliance center: government-services risk + true labor cost per branch
- Page «مركز الامتثال» (`/app/compliance`, roles OWNER/HR_ADMIN, PAYROLL read).
- Risk items (each with level HIGH/MEDIUM/LOW, Arabic title, count, link):
  - Official Nitaqat band RED → HIGH; LOW_GREEN or `marginToDrop <= 1` → MEDIUM.
  - Undocumented Saudis > 0 → MEDIUM.
  - Previous month has no payroll run with `wpsExportedAt` (from the 10th of the month) → HIGH; WPS check of the latest run has ERRORs → MEDIUM.
  - Expired iqamas → HIGH; iqamas expiring ≤ 30 days → MEDIUM.
  - Missing/expired sector documents → HIGH (expired) / MEDIUM (missing).
  - Overall level = max item level; headline «خدماتك الحكومية: مخاطر مرتفعة / متوسطة / منخفضة».
- True labor cost per branch for a period: gross + GOSI employer + government fees for non-Saudis. Company settings `expatLevyMonthly` (default 800) and `iqamaFeeAnnual` (default 650; monthly = /12). Source: payslips of the period's run when it exists, else contract salaries (flag `estimated: true`). Output per branch: headcount, saudis, gross, gosiEmployer, govFees, total, perEmployee.
- Fee defaults labelled «قابلة للتعديل من الإعدادات — تحقق من الرسوم الحالية».

## 6. Anti-tamper attendance (privacy-respecting — NO photos)
Owner decision: no selfies or any employee photo capture (cultural/religious acceptability, especially for female staff). Never add camera capture of people.
- **Device binding:** the ESS app generates a random device id (stored in localStorage) sent as header `X-Device-Id` on check-in/out. First punch binds it (`EmployeeDevice`). A different device → 403 «هذا الجهاز غير مسجل لحسابك. اطلب من الموارد البشرية اعتماد الجهاز الجديد» and a pending device request HR can approve (replaces the old binding) or reject. Company setting `deviceBinding` (default true).
- **Rotating branch code:** each branch kiosk screen shows a 6-digit code that changes every 30 seconds (HMAC-SHA256 TOTP from a per-branch secret; accept current ±1 step). Company setting `requireBranchCode` (default false); when true, ESS check-in/out must include `branchCode` → else 400 «أدخل رمز الفرع الظاهر على شاشة الحضور»; wrong → 400 «رمز الفرع غير صحيح أو منتهي».
- **Branch kiosk:** OWNER/HR/branch manager pairs a device to a branch (`KioskDevice`, token shown once, stored hashed). Kiosk calls `POST /kiosk/punch {employeeNumber, pin}` with header `X-Kiosk-Token`; employee PIN (4–6 digits, hashed) set by HR or by the employee in /me. Employee must belong to the kiosk's branch. 5 wrong PINs in 15 min → locked 15 min. Source `KIOSK`. Web route `/kiosk` (fullscreen keypad + the rotating branch code). The kiosk never uses the camera.
- **Offline:** ESS queues punches in IndexedDB when offline with `capturedAt`; server accepts `capturedAt` within the last 12 hours (not future), uses it as the punch time, and adds flag `OFFLINE`. Geofence and device binding still apply; branch code is not required for offline punches but the flag is shown to managers.
- `AttendanceRecord.flags: string[]` (`OFFLINE`, `KIOSK`, `NEW_DEVICE_APPROVED`).

## 7. Open shifts and swaps
- Open shift: manager publishes `{branchId, shiftId, date, slots, note}`; employees of that branch see it in the app and claim; a claim creates the ShiftAssignment immediately when the employee has no assignment that date (atomic slot decrement); status FILLED at 0 slots. Manager can cancel.
- Swap: employee proposes swapping their assignment with a colleague's (same branch, or give-away with `targetAssignmentId = null`) → colleague accepts → manager approves → assignments swapped atomically (conditional on both unchanged). States PENDING_PEER → PENDING_MANAGER → APPROVED, or REJECTED / CANCELLED. Notifications at each step.

## 8. Repricing (owner decision: monthly equal to Jisr, annual discount chosen by the team)
- Essential **10** SAR, Growth **16** SAR per active employee/month on **monthly** billing (same as Jisr's list prices, but Jisr bills annually only).
- Annual billing discount **20%** → effective 8 / 12.80 SAR per employee/month. Platform setting `annualDiscount` 0.20.
- Enterprise on request; minimum billed 10 employees; 14-day trial; monthly billing allowed.
- Essential: core HR, geofenced attendance with device binding and offline, leave, requests, payroll + WPS checker, GOSI two regimes, document tracking, ESS app.
- Growth adds: Qiwa-documented Saudization + compliance center, true labor cost per branch, kiosk mode with rotating branch code, open shifts & swaps, performance, recruitment, advanced reports.
- Existing platform settings rows still holding the old defaults (19/29 and 0.15) are migrated to 10/16 and 0.20; customised values untouched. Existing companies' `pricePerEmployee` overrides untouched.
