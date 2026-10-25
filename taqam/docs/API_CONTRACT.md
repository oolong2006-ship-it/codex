# Shuoon REST API — Contract (v1)

Base URL: `http://localhost:4100/api` (env `NEXT_PUBLIC_API_URL` in web = `http://localhost:4100/api`).
Swagger UI at `/api/docs`.

## Conventions
- JSON everywhere. Dates: ISO strings. Day-only fields: `YYYY-MM-DD`. Money: numbers (SAR).
- Auth: `Authorization: Bearer <accessToken>` (JWT, 12h). Payload: `{ sub: userId, companyId, role, employeeId|null, branchId|null }`.
- Multi-tenancy: every query is scoped to `companyId` from the token. Never trust companyId from the body.
- BRANCH_MANAGER is automatically scoped to employees of their own branch (branchId of their employee record).
- Lists: `GET /x?page=1&pageSize=20&search=&...filters` → `{ data: T[], total, page, pageSize }`.
- Errors: `{ statusCode, message, messageAr? }` with proper HTTP codes (400 validation, 401, 403, 404, 409).
- Enums are UPPER_SNAKE strings exactly as in this doc.
- Roles: OWNER, HR_ADMIN, PAYROLL, BRANCH_MANAGER, EMPLOYEE. "ADMIN" below = OWNER|HR_ADMIN.

## Public (no auth)
| Method | Path | Body / Notes | Response |
|---|---|---|---|
| POST | /auth/register | `{ companyNameAr, companyNameEn?, sector, employeesCount?, ownerName, email, phone?, password }` creates Company + default leave types + OWNER user | `AuthResponse` |
| POST | /auth/login | `{ email, password }` | `AuthResponse` |
| POST | /public/leads | `{ name, company, email, phone, employeesCount?, sector?, message? }` (demo request) | `{ id }` |
| POST | /public/eosb | core `EosbInput` (free calculator) | core `EosbResult` |
| GET | /health | | `{ status: 'ok' }` |

`AuthResponse = { accessToken, user: { id, email, name, role, companyId, employeeId|null, branchId|null }, company: { id, nameAr, nameEn } }`

## Me / session
| GET | /auth/me | | `AuthResponse['user'] & { company }` |
| POST | /auth/change-password | `{ currentPassword, newPassword }` | `{ ok: true }` |

## Dashboard (ADMIN, PAYROLL, BRANCH_MANAGER)
`GET /dashboard` →
```
{ headcount, saudis, nonSaudis, saudizationRate, nitaqatBand,
  presentToday, lateToday, absentToday, onLeaveToday,
  pendingLeaves, pendingRequests,
  monthlyPayrollCost,               // last approved run gross+employer gosi, or estimate from wages
  expiringDocuments: { employeeId, employeeName, type, expiryDate, status }[],   // next 90 days + expired
  headcountByBranch: { branchId, branchName, count, saudis }[],
  headcountByDepartment: { departmentId, name, count }[],
  payrollTrend: { period, gross, net }[],   // last 6 runs
  attendanceTrend: { date, present, late, absent }[], // last 14 days
  recentActivity: { id, action, entity, createdAt, userName }[] }
```

## Company & settings (ADMIN)
| GET/PATCH | /company | fields: nameAr, nameEn, crNumber, establishmentId (MOL/Mudad), gosiNumber, vatNumber, sector, city, iban, bankCode, weekendDays:number[], payrollDay:number(1-28) |
| GET/POST | /users | create: `{ email, name, role, password, employeeId? }` |
| PATCH/DELETE | /users/:id | `{ role?, isActive?, name? }` |
| GET/POST | /leave-types | `{ code, nameAr, nameEn, paid, maxDaysPerYear|null }` |
| PATCH/DELETE | /leave-types/:id | |
| GET/POST | /holidays | `{ date, nameAr, nameEn? }` (`GET ?year=2026`) |
| DELETE | /holidays/:id | |
| GET | /audit-logs | paginated `{ id, action, entity, entityId, userName, createdAt, data }` |

## Branches & departments
| GET | /branches | (all roles except EMPLOYEE) `Branch & { employeesCount, saudis, saudizationRate, nitaqatBand, managerName }`[] |
| POST/PATCH/DELETE | /branches(/:id) | ADMIN. `{ nameAr, nameEn?, city, address?, lat, lng, radiusMeters (default 150), managerEmployeeId? }` |
| GET | /departments | `{ id, name, parentId, employeesCount }[]` |
| POST/PATCH/DELETE | /departments(/:id) | ADMIN `{ name, parentId? }` |

## Employees
`Employee = { id, employeeNumber, firstNameAr, lastNameAr, fullNameEn, nationality (ISO2, 'SA' = Saudi), isSaudi, gender: 'MALE'|'FEMALE', birthDate, maritalStatus?, nationalId, idExpiry, passportNumber?, passportExpiry?, phone, email, branchId, branch?: {id,nameAr}, departmentId, department?: {id,name}, managerId, manager?: {id, name}, jobTitle, hireDate, contractType: 'UNLIMITED'|'FIXED', contractEndDate?, probationEndDate?, status: 'ACTIVE'|'ON_LEAVE'|'TERMINATED', terminationDate?, terminationReason?, basicSalary, housingAllowance, transportAllowance, otherAllowances, iban, bankCode, gosiRegistered, hoursPerDay, avatarColor, createdAt }`
| GET | /employees | filters: search, branchId, departmentId, status, nationality(SA|NON_SA) — paginated |
| GET | /employees/:id | Employee & `{ documents, leaveBalance: { entitlementPerYear, accrued, taken, balance }, user?: {id,email,role} }` |
| POST | /employees | ADMIN. Body = Employee writable fields (+ optional `createUser: { email, password }` to create EMPLOYEE login). employeeNumber auto `EMP-0001` if absent |
| PATCH | /employees/:id | ADMIN |
| POST | /employees/:id/terminate | ADMIN `{ terminationDate, reason: TerminationReason }` → `{ employee, eosb: EosbResult }` |
| GET | /employees/:id/eosb?endDate=&reason= | ADMIN, PAYROLL → EosbResult (preview) |
| GET/POST | /employees/:id/documents | `{ type: 'IQAMA'|'PASSPORT'|'CONTRACT'|'CERTIFICATE'|'INSURANCE'|'OTHER', number?, issueDate?, expiryDate?, note? }` |
| DELETE | /employees/:id/documents/:docId | |
| GET | /documents/expiring?days=90 | `{ id, employeeId, employeeName, type, number, expiryDate, status }[]` |
| GET | /org-chart | `{ id, name, jobTitle, managerId, branchName }[]` |

## Shifts & attendance
`Shift = { id, branchId, name, startTime "HH:mm", endTime, breakMinutes, graceMinutes, days: number[] (0=Sun..6=Sat), color }`
| GET/POST | /shifts | ?branchId= |
| PATCH/DELETE | /shifts/:id | ADMIN, BRANCH_MANAGER(own branch) |
| GET | /roster?branchId=&weekStart=YYYY-MM-DD | `{ employees: {id,name}[], assignments: { id, employeeId, shiftId, date }[] }` |
| PUT | /roster | `{ assignments: { employeeId, shiftId|null, date }[] }` upsert/delete |
| GET | /attendance?date=YYYY-MM-DD&branchId= | daily board: `{ employeeId, employeeName, branchName, shiftName, checkIn, checkOut, workedMinutes, lateMinutes, overtimeMinutes, status: 'PRESENT'|'LATE'|'ABSENT'|'ON_LEAVE'|'INCOMPLETE'|'OFF' , recordId }[]` |
| GET | /attendance/summary?from=&to=&branchId=&employeeId= | per employee `{ employeeId, employeeName, presentDays, lateDays, absentDays, lateMinutes, overtimeMinutes, workedHours }[]` |
| POST | /attendance/manual | ADMIN, BRANCH_MANAGER `{ employeeId, date, checkIn, checkOut, note }` |
| PATCH | /attendance/:id | same |

## Leaves
`LeaveRequest = { id, employeeId, employee?: {id,name,branchName}, leaveTypeId, leaveType?: {code,nameAr,nameEn}, startDate, endDate, days, reason, status: 'PENDING'|'APPROVED'|'REJECTED'|'CANCELLED', approverName?, decidedAt?, comment?, createdAt }`
| GET | /leaves | filters status, employeeId, branchId, from, to — paginated |
| POST | /leaves | ADMIN on behalf `{ employeeId, leaveTypeId, startDate, endDate, reason }` (days computed via core.countLeaveDays w/ company weekend+holidays; validates balance for ANNUAL → 400 messageAr) |
| POST | /leaves/:id/approve , /leaves/:id/reject | `{ comment? }` ADMIN, BRANCH_MANAGER(own branch) |
| GET | /leaves/balances?employeeId= | `{ leaveTypeId, code, nameAr, entitlement|null, taken, balance|null }[]` |

## Employee requests
`EmployeeRequest = { id, employeeId, employee?, type: 'SALARY_CERTIFICATE'|'EXPENSE_CLAIM'|'LOAN'|'EXIT_REENTRY'|'ATTENDANCE_CORRECTION'|'LETTER'|'OTHER', title, details, amount?, payload?: object, status: 'PENDING'|'APPROVED'|'REJECTED'|'CANCELLED', approverName?, decidedAt?, comment?, createdAt }`
| GET | /requests | filters type, status, employeeId — paginated |
| POST | /requests/:id/approve , /reject | `{ comment? }`. Approving LOAN creates Loan (payload `{ months }`). Approving ATTENDANCE_CORRECTION upserts attendance (payload `{date, checkIn, checkOut}`) |

## Loans (ADMIN, PAYROLL)
| GET/POST | /loans | `{ employeeId, amount, monthlyDeduction, startPeriod "YYYY-MM", note? }` → `Loan = {..., remaining, status: 'ACTIVE'|'PAID'|'CANCELLED', employee}` |
| PATCH | /loans/:id | |

## Payroll (ADMIN, PAYROLL)
`PayrollRun = { id, period, status: 'DRAFT'|'CALCULATED'|'APPROVED'|'PAID', employeesCount, totalGross, totalDeductions, totalNet, totalGosiEmployer, totalEmployerCost, createdAt, approvedAt?, paidAt?, approvedByName? }`
`Payslip = { id, payrollRunId, period, employeeId, employee: {id, employeeNumber, name, branchName, iban, isSaudi}, payableDays, earnings: [...], deductions: [...], gross, totalDeductions, net, gosiEmployee, gosiEmployer, notes: string[] }` (earnings/deductions as core PayslipResult lines)
| GET | /payroll/runs | |
| POST | /payroll/runs | `{ period }` (409 if exists) → DRAFT run |
| POST | /payroll/runs/:id/calculate | runs core.calculatePayslip for every ACTIVE employee (and those terminated within period) using attendance (absent days, overtime from attendance overtimeMinutes), unpaid leaves, adjustments, active loans → status CALCULATED |
| GET | /payroll/runs/:id | run & `{ payslips: Payslip[] }` |
| POST | /payroll/runs/:id/approve | CALCULATED → APPROVED (deduct loan installments) |
| POST | /payroll/runs/:id/mark-paid | APPROVED → PAID; notifies employees |
| DELETE | /payroll/runs/:id | only DRAFT/CALCULATED |
| GET | /payroll/runs/:id/wps | `text/csv` download (core.generateWpsCsv); 400 with `{ errors }` JSON if `?validate=1` |
| GET | /payroll/payslips/:id | Payslip |
| GET/POST | /payroll/adjustments | `{ employeeId, period, type: 'BONUS'|'COMMISSION'|'ALLOWANCE'|'DEDUCTION'|'PENALTY', amount, note }` |
| DELETE | /payroll/adjustments/:id | |

## Saudization
| GET | /saudization | `{ company: { total, saudis, rate, band, hiresToNextBand }, branches: { branchId, branchName, total, saudis, rate, band }[], thresholds }` |
| GET | /saudization/simulate?addSaudis=&addNonSaudis= | `{ before: {rate, band}, after: {rate, band} }` |

## Performance
| GET/POST | /performance/cycles | `{ name, startDate, endDate }` → `{ id, name, startDate, endDate, status: 'DRAFT'|'ACTIVE'|'CLOSED', reviewsCount, completedCount }` |
| PATCH | /performance/cycles/:id | status changes; ACTIVE auto-creates reviews for active employees (reviewer = manager) |
| GET | /performance/reviews?cycleId= | `{ id, cycleId, employee, reviewerName, goals: {title, weight, score}[], overallScore, comments, status: 'PENDING'|'SUBMITTED' }[]` |
| PATCH | /performance/reviews/:id | `{ goals, comments, status }` overallScore computed (weighted, 1-5) |

## Recruitment
| GET/POST | /jobs | `{ title, branchId?, departmentId?, employmentType, description, status: 'OPEN'|'CLOSED' }` → & `{ candidatesCount }` |
| PATCH/DELETE | /jobs/:id | |
| GET/POST | /jobs/:id/candidates | `{ name, email, phone, nationality, expectedSalary?, notes? }` |
| PATCH | /candidates/:id | `{ stage: 'APPLIED'|'SCREENING'|'INTERVIEW'|'OFFER'|'HIRED'|'REJECTED', notes? }` |

## Announcements & notifications
| GET/POST | /announcements | ADMIN post `{ title, body, branchId? }`; all roles GET |
| DELETE | /announcements/:id | |
| GET | /notifications | current user, latest 50 `{ id, title, body, link, readAt, createdAt }` |
| POST | /notifications/:id/read , /notifications/read-all | |

## Reports (ADMIN, PAYROLL)
| GET | /reports/headcount | `{ byBranch, byDepartment, byNationality: {nationality,count}[], byGender, joinersByMonth: {period,count}[], leaversByMonth }` |
| GET | /reports/payroll-cost?from=YYYY-MM&to=YYYY-MM | `{ period, gross, net, gosiEmployer, employerCost }[]` |
| GET | /reports/attendance?from=&to= | same as /attendance/summary aggregated by branch |
| GET | /reports/:name/export | `text/csv` for headcount, payroll-cost, attendance, employees |

## Employee self-service (role EMPLOYEE; also any role that has employeeId)
| GET | /me/profile | Employee (own) |
| GET | /me/home | `{ employee: {name, jobTitle, branchName}, today: { shift: {name,startTime,endTime}|null, checkIn, checkOut, status }, leaveBalance, pendingRequests, lastPayslip: {id, period, net}|null, announcements: [...] (latest 5), branch: { lat, lng, radiusMeters } }` |
| POST | /me/attendance/check-in | `{ lat, lng }` → 400 `messageAr: 'أنت خارج نطاق الفرع'` when outside geofence (core.isWithinGeofence); 409 if already checked in |
| POST | /me/attendance/check-out | `{ lat, lng }` |
| GET | /me/attendance?month=YYYY-MM | records `{ date, checkIn, checkOut, workedMinutes, lateMinutes, overtimeMinutes, status }[]` |
| GET | /me/leaves | own LeaveRequest[] + `balances` same as /leaves/balances: `{ data, balances }` |
| POST | /me/leaves | `{ leaveTypeId, startDate, endDate, reason }` |
| POST | /me/leaves/:id/cancel | only PENDING |
| GET | /me/payslips | `{ id, period, net, gross, status }[]` (only APPROVED/PAID runs) |
| GET | /me/payslips/:id | Payslip |
| GET | /me/requests | |
| POST | /me/requests | `{ type, title, details, amount?, payload? }` |
| GET | /leave-types | (also allowed for EMPLOYEE, read-only) |

## Demo data (seed)
`npm run db:seed` creates company **"مطاعم ورد الشام" / Ward Al-Sham Restaurants**:
- 4 branches (Riyadh Olaya, Riyadh Al-Malqa, Jeddah Tahlia, Dammam Corniche) with real-ish coordinates.
- 5 departments, ~40 employees (mixed Saudi/non-Saudi, realistic Arabic names), shifts, 30 days attendance, leaves, requests, 3 approved payroll runs, loans, a performance cycle, 2 job openings with candidates, announcements, expiring documents.
- Logins (password `Shuoon@2026` for all):
  - `owner@shuoon.demo` (OWNER), `hr@shuoon.demo` (HR_ADMIN), `payroll@shuoon.demo` (PAYROLL),
  - `manager@shuoon.demo` (BRANCH_MANAGER, Riyadh Olaya), `employee@shuoon.demo` (EMPLOYEE, Riyadh Olaya).
