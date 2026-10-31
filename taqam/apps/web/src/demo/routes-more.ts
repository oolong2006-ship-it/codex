/** Demo API — leaves, requests & loans, payroll, saudization, performance, recruitment, comms, reports, self-service. */
import { checkWpsRun, DEFAULT_NITAQAT_THRESHOLDS, generateWpsCsv, haversineMeters, hiresNeededForBand, isWithinGeofence, nitaqatAlert, nitaqatBand, officialSaudization, saudizationRate, type NitaqatBand } from '@taqam/core';
import { jobId, JOB_POOL, runId } from './ids';
import { addMonths, periodOf, periodRange, r2, todayStr } from './dates';
import { nextId, type Employee, type Goal } from './db';
import { badRequest, conflict, forbidden, notFound } from './errors';
import { route, v, pick, paginate, byCreatedAsc, byCreatedDesc, leaveView, empLite, payslipView, ok, PERIOD_RE, type Route } from './router';
import { attendanceSummary, employeeDetail, upsertRecord } from './routes-core';
import { ADMIN, ALL_ROLES, STAFF, PayrollStateError, Services, byNumber, fullName, nowIso, type AuthUser } from './services';

const APPROVERS = ['OWNER', 'HR_ADMIN', 'BRANCH_MANAGER'] as const;
const FINANCE = ['OWNER', 'HR_ADMIN', 'PAYROLL'] as const;
const LOAN_APPROVERS = FINANCE;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** How far back a self check-out may reach to close an open (overnight) record. */
const OVERNIGHT_WINDOW_MS = 16 * 3600 * 1000;
export const REQUEST_TYPE_AR: Record<string, string> = {
  SALARY_CERTIFICATE: 'تعريف بالراتب', EXPENSE_CLAIM: 'مطالبة مصروفات', LOAN: 'سلفة', EXIT_REENTRY: 'خروج وعودة', ATTENDANCE_CORRECTION: 'تصحيح حضور', LETTER: 'خطاب', OTHER: 'طلب آخر',
};
const REQUEST_TYPES = Object.keys(REQUEST_TYPE_AR);
const ORDER: NitaqatBand[] = ['RED', 'LOW_GREEN', 'MID_GREEN', 'HIGH_GREEN', 'PLATINUM'];
const nextBand = (b: NitaqatBand) => { const i = ORDER.indexOf(b); return i < ORDER.length - 1 ? ORDER[i + 1] : null; };
const DEFAULT_GOALS: Goal[] = [
  { title: 'جودة العمل وخدمة العملاء', weight: 40, score: null },
  { title: 'الالتزام بالحضور والأنظمة', weight: 30, score: null },
  { title: 'العمل الجماعي والمبادرة', weight: 30, score: null },
];
function weightedScore(goals: { weight: number; score?: number | null }[]): number | null {
  const scored = goals.filter((g) => typeof g.score === 'number' && g.weight > 0);
  const w = scored.reduce((s, g) => s + g.weight, 0);
  if (!w) return null;
  return Math.round((scored.reduce((s, g) => s + g.weight * (g.score as number), 0) / w) * 100) / 100;
}
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const field = (x: unknown) => {
    let s = x === null || x === undefined ? '' : String(x);
    if (typeof x === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`; // CSV/formula injection
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const cols = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  return '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => field(r[c])).join(','))].join('\n') + '\n';
}

// ---------- leaves ----------
function createLeaveFor(svc: Services, actor: AuthUser, emp: Employee, body: Record<string, unknown>) {
  const leaveTypeId = v.str(body, 'leaveTypeId')!; const startDate = v.match(body, 'startDate', DAY_RE)!; const endDate = v.match(body, 'endDate', DAY_RE)!;
  if (emp.status === 'TERMINATED') throw badRequest('Employee is terminated', 'لا يمكن إنشاء إجازة لموظف منتهية خدمته');
  const type = svc.db.leaveTypes.find((t) => t.id === leaveTypeId && t.companyId === actor.companyId);
  if (!type) throw notFound('Leave type', 'نوع الإجازة غير موجود');
  const days = svc.validateLeave(emp, type, startDate, endDate);
  const l = { id: nextId(svc.db, 'lv'), companyId: actor.companyId, employeeId: emp.id, leaveTypeId: type.id, startDate, endDate, days, reason: (body.reason as string) ?? null, status: 'PENDING' as const, approverId: null, approverName: null, decidedAt: null, comment: null, createdAt: nowIso() };
  svc.db.leaves.push(l);
  svc.audit(actor, 'CREATE', 'LeaveRequest', l.id, { employeeId: emp.id, code: type.code, days, leaveTypeId, startDate, endDate, reason: body.reason });
  if (actor.employeeId === emp.id) svc.notifyApprovers(actor.companyId, emp.branchId, 'طلب إجازة جديد', `${fullName(emp)} — ${type.nameAr} (${days} يوم)`, '/leaves');
  return leaveView(svc, l);
}
function decideLeave(svc: Services, u: AuthUser, id: string, approve: boolean, comment?: string) {
  const l = svc.db.leaves.find((x) => x.id === id && x.companyId === u.companyId);
  if (!l) throw notFound('Leave request', 'طلب الإجازة غير موجود');
  const type = svc.leaveType(l.leaveTypeId)!;
  const emp = svc.scopedEmployee(u, l.employeeId);
  if (l.status !== 'PENDING') throw badRequest('Only pending requests can be decided', 'يمكن البت في الطلبات المعلقة فقط');
  if (u.employeeId && u.employeeId === l.employeeId && u.role === 'BRANCH_MANAGER') throw badRequest('You cannot approve your own request', 'لا يمكنك اعتماد طلبك بنفسك');
  if (approve && type.code === 'ANNUAL') svc.validateLeave(emp, type, l.startDate, l.endDate, l.id);
  Object.assign(l, { status: approve ? 'APPROVED' : 'REJECTED', approverId: u.id, approverName: u.name, decidedAt: nowIso(), comment: comment ?? null });
  const today = todayStr();
  if (approve && today >= l.startDate && today <= l.endDate) emp.status = 'ON_LEAVE';
  svc.audit(u, approve ? 'APPROVE' : 'REJECT', 'LeaveRequest', id, { comment });
  svc.notifyEmployees(u.companyId, [l.employeeId], approve ? 'تمت الموافقة على طلب إجازتك' : 'تم رفض طلب إجازتك', `${type.nameAr}: ${l.startDate} → ${l.endDate}${comment ? ` — ${comment}` : ''}`, '/me/leaves');
  return leaveView(svc, l);
}

// ---------- requests ----------
function decideRequest(svc: Services, u: AuthUser, id: string, approve: boolean, comment?: string) {
  const db = svc.db;
  const r = db.requests.find((x) => x.id === id && x.companyId === u.companyId);
  if (!r) throw notFound('Request', 'الطلب غير موجود');
  const emp = svc.scopedEmployee(u, r.employeeId);
  if (r.status !== 'PENDING') throw badRequest('Only pending requests can be decided', 'يمكن البت في الطلبات المعلقة فقط');
  if (u.employeeId === r.employeeId && u.role === 'BRANCH_MANAGER') throw badRequest('You cannot approve your own request', 'لا يمكنك اعتماد طلبك بنفسك');
  if (approve && r.type === 'LOAN' && !(LOAN_APPROVERS as readonly string[]).includes(u.role)) throw forbidden('Loan approval requires HR or payroll', 'اعتماد السلف من صلاحية الموارد البشرية أو الرواتب');
  let loanId: string | undefined;
  if (approve && r.type === 'LOAN') {
    const amount = r.amount ?? 0;
    if (amount <= 0) throw badRequest('Loan amount missing', 'مبلغ السلفة غير محدد');
    const months = Math.max(1, Math.min(60, Number((r.payload ?? {}).months) || 1));
    const now = nowIso();
    const loan = { id: nextId(db, 'loan'), companyId: u.companyId, employeeId: r.employeeId, amount, monthlyDeduction: r2(amount / months), remaining: amount, startPeriod: addMonths(periodOf(todayStr()), 1), status: 'ACTIVE' as const, note: r.title, requestId: r.id, createdAt: now, updatedAt: now };
    db.loans.push(loan);
    loanId = loan.id;
    svc.audit(u, 'CREATE', 'Loan', loan.id, { fromRequest: r.id, amount, months });
  }
  if (approve && r.type === 'ATTENDANCE_CORRECTION') {
    const p = (r.payload ?? {}) as { date?: string; checkIn?: string; checkOut?: string };
    if (!p.date || !p.checkIn) throw badRequest('Invalid correction payload', 'بيانات التصحيح غير مكتملة');
    const rec = upsertRecord(svc, u.companyId, emp, p.date, p.checkIn, p.checkOut, { source: 'CORRECTION', note: r.title });
    svc.audit(u, 'CORRECTION', 'AttendanceRecord', rec.id, p);
  }
  Object.assign(r, { status: approve ? 'APPROVED' : 'REJECTED', approverId: u.id, approverName: u.name, decidedAt: nowIso(), comment: comment ?? null });
  svc.audit(u, approve ? 'APPROVE' : 'REJECT', 'EmployeeRequest', id, { comment, loanId });
  svc.notifyEmployees(u.companyId, [r.employeeId], approve ? `تمت الموافقة على طلبك: ${REQUEST_TYPE_AR[r.type]}` : `تم رفض طلبك: ${REQUEST_TYPE_AR[r.type]}`, comment ?? r.title, '/me/requests');
  return { ...r, employee: empLite(svc, r.employeeId), loanId };
}
function loanView(svc: Services, l: (typeof svc.db.loans)[number]) {
  return { ...l, employee: empLite(svc, l.employeeId), paid: r2(l.amount - l.remaining) };
}

// ---------- payroll ----------
function getRun(svc: Services, u: AuthUser, id: string) {
  const run = svc.run(u.companyId, id);
  if (!run) throw notFound('Payroll run', 'مسير الرواتب غير موجود');
  return run;
}
function mapStateError(e: unknown): never {
  if (e instanceof PayrollStateError) {
    if (e.message === 'NOT_FOUND') throw notFound('Payroll run', 'مسير الرواتب غير موجود');
    if (e.message === 'LOCKED') throw badRequest('Run is already approved', 'لا يمكن إعادة احتساب مسير معتمد');
    if (e.message === 'ALREADY_APPROVED') throw conflict('Run was already approved', 'تمت معالجة هذا الطلب مسبقاً');
    if (e.message === 'NOT_CALCULATED') throw badRequest('Run must be CALCULATED first', 'يجب احتساب المسير قبل اعتماده');
  }
  throw e;
}
function runDetail(svc: Services, u: AuthUser, id: string) {
  const run = getRun(svc, u, id);
  const slips = svc.db.payslips.filter((p) => p.companyId === u.companyId && p.payrollRunId === id).sort((a, b) => byNumber(svc.emp(a.employeeId)!, svc.emp(b.employeeId)!));
  return { ...run, payslips: slips.map((p) => payslipView(svc, p)) };
}
/** Salary payment date used in the WPS file: the paid date, else the company's payroll day in the period. */
function wpsPaymentDate(run: { period: string; paidAt: string | null }, payrollDay: number | null) {
  const payDay = String(Math.min(28, payrollDay || 27)).padStart(2, '0');
  return run.paidAt ? run.paidAt.slice(0, 10) : `${run.period}-${payDay}`;
}
/**
 * Date the checker tests LATE_PAYMENT against: the paid date once paid; before that the scheduled day,
 * or today (Riyadh) once the scheduled day has passed — an unpaid run checked after the deadline warns.
 */
function wpsCheckPaymentDate(run: { period: string; paidAt: string | null }, payrollDay: number | null, today: string) {
  const scheduledPaymentDate = wpsPaymentDate(run, payrollDay);
  return { scheduledPaymentDate, paymentDate: run.paidAt || today <= scheduledPaymentDate ? scheduledPaymentDate : today };
}
const lineSum = (lines: { code: string; amount: number }[], code: string) => lines.filter((l) => l.code === code).reduce((s, l) => s + l.amount, 0);
/** Wage-loss lines that legitimately reduce what is paid against the contract (absence, unpaid/sick leave). */
const WAGE_LOSS_CODES = ['ABSENCE', 'UNPAID_LEAVE', 'SICK'];
/**
 * Mudad pre-upload check (spec §2) — same rules as the API (core checkWpsRun). "Active" = employed during
 * the period as of the period: hired on/before its end and not terminated before its start (ON_LEAVE included).
 */
export function wpsCheck(svc: Services, u: AuthUser, id: string) {
  const run = getRun(svc, u, id);
  if (run.status === 'DRAFT') throw badRequest('Run is not calculated', 'يجب احتساب المسير أولاً');
  const company = svc.company(u.companyId);
  const { start, end } = periodRange(run.period);
  const slips = svc.db.payslips.filter((p) => p.companyId === u.companyId && p.payrollRunId === id).sort((a, b) => byNumber(svc.emp(a.employeeId)!, svc.emp(b.employeeId)!));
  const active = svc.db.employees
    .filter((e) => e.companyId === u.companyId && e.hireDate <= end && (e.terminationDate ? e.terminationDate >= start : e.status !== 'TERMINATED'))
    .sort(byNumber);
  const { paymentDate, scheduledPaymentDate } = wpsCheckPaymentDate(run, company.payrollDay, todayStr());
  const rows = slips.map((s) => {
    const e = svc.emp(s.employeeId)!;
    const inputs = (s.inputs ?? {}) as { absentDays?: number; unpaidLeaveDays?: number; sickLeaveDeduction?: number; wage?: { basic?: number } };
    // current salary while the run can be recalculated; the calculation snapshot once APPROVED/PAID
    const snapshot = inputs.wage?.basic;
    const contractBasic = run.status !== 'CALCULATED' && typeof snapshot === 'number' ? snapshot : e.basicSalary;
    const wageLoss = WAGE_LOSS_CODES.some((code) => lineSum(s.deductions, code) > 0);
    return {
      employeeNumber: e.employeeNumber, nationalId: e.nationalId, iban: e.iban || '', gross: s.gross, deductions: s.totalDeductions, net: s.net,
      basicPaid: lineSum(s.earnings, 'BASIC'), contractBasic, payableDays: s.payableDays,
      hasAbsenceOrUnpaidLeave: wageLoss || (inputs.absentDays ?? 0) > 0 || (inputs.unpaidLeaveDays ?? 0) > 0 || (inputs.sickLeaveDeduction ?? 0) > 0,
    };
  });
  const result = checkWpsRun({ period: run.period, paymentDate, rows, activeEmployeeNumbers: active.map((e) => e.employeeNumber) });
  const byEmpNumber = new Map([...slips.map((s) => svc.emp(s.employeeId)!), ...active].map((e) => [e.employeeNumber, e]));
  return {
    period: run.period, paymentDate, scheduledPaymentDate, exportedAt: run.wpsExportedAt ?? null, ready: result.ready, errors: result.errors, warnings: result.warnings,
    issues: result.issues.map((i) => {
      const e = i.employeeNumber ? byEmpNumber.get(i.employeeNumber) : undefined;
      return { ...i, employeeId: e?.id ?? null, employeeName: e ? fullName(e) : null };
    }),
  };
}
function wps(svc: Services, u: AuthUser, id: string) {
  const run = getRun(svc, u, id);
  if (run.status === 'DRAFT') throw badRequest('Run is not calculated', 'يجب احتساب المسير أولاً');
  const company = svc.company(u.companyId);
  const lineAmount = (lines: { code: string; amount: number }[], code: string) => lines.filter((l) => l.code === code).reduce((s, l) => s + l.amount, 0);
  const slips = svc.db.payslips.filter((p) => p.companyId === u.companyId && p.payrollRunId === id).sort((a, b) => byNumber(svc.emp(a.employeeId)!, svc.emp(b.employeeId)!));
  const paymentDate = wpsPaymentDate(run, company.payrollDay);
  const rows = slips.map((s) => {
    const e = svc.emp(s.employeeId)!;
    const basic = lineAmount(s.earnings, 'BASIC');
    const housing = lineAmount(s.earnings, 'HOUSING');
    return { employeeNumber: e.employeeNumber, nationalId: e.nationalId, nameEn: e.fullNameEn || fullName(e), iban: e.iban || '', bankCode: e.bankCode || '', basic, housing, otherEarnings: r2(s.gross - basic - housing), deductions: s.totalDeductions, net: s.net };
  });
  const result = generateWpsCsv({ establishmentId: company.establishmentId || '', companyNameEn: company.nameEn || company.nameAr, companyIban: company.iban || '', bankCode: company.bankCode || '', period: run.period, paymentDate }, rows);
  svc.audit(u, 'EXPORT_WPS', 'PayrollRun', id, { count: result.count, errors: result.errors.length });
  return { ...result, period: run.period };
}
function assertPeriodOpen(svc: Services, companyId: string, period: string) {
  const run = svc.db.runs.find((r) => r.companyId === companyId && r.period === period);
  if (run && (run.status === 'APPROVED' || run.status === 'PAID')) throw badRequest('Payroll for this period is already approved', 'مسير هذا الشهر معتمد ولا يمكن تعديله');
}

// ---------- saudization / reports ----------
/** Active employees the viewer may see — a BRANCH_MANAGER gets their branch only (same scope as the dashboard). */
function counts(svc: Services, u: AuthUser) {
  const where = svc.employeeWhere(u);
  const active = svc.db.employees.filter((e) => where(e) && e.status !== 'TERMINATED');
  return { active, total: active.length, saudis: active.filter((e) => e.isSaudi).length, documentedSaudis: active.filter((e) => e.isSaudi && e.qiwaDocumented).length };
}
/** Official (Qiwa-documented) vs internal Saudization — `rate`/`band` are the official rate (since 15 Apr 2026). */
function saudizationSummary(emps: Employee[]) {
  const s = officialSaudization(emps);
  return {
    total: s.total, saudis: s.saudis, documentedSaudis: s.documentedSaudis, undocumentedSaudis: s.undocumentedSaudis,
    rate: s.officialRate, officialRate: s.officialRate, internalRate: s.internalRate, band: s.band, marginToDrop: s.marginToDrop, alert: nitaqatAlert(s),
  };
}
function headcount(svc: Services, u: AuthUser) {
  const emps = svc.db.employees.filter((e) => e.companyId === u.companyId);
  const active = emps.filter((e) => e.status !== 'TERMINATED');
  const group = (key: (e: Employee) => string) => { const m = new Map<string, number>(); active.forEach((e) => m.set(key(e), (m.get(key(e)) ?? 0) + 1)); return m; };
  const thisPeriod = periodOf(todayStr());
  const months = Array.from({ length: 12 }, (_, i) => addMonths(thisPeriod, i - 11));
  return {
    total: active.length,
    byBranch: svc.db.branches.filter((b) => b.companyId === u.companyId).sort(byCreatedAsc).map((b) => ({ branchId: b.id, branchName: b.nameAr, count: active.filter((e) => e.branchId === b.id).length, saudis: active.filter((e) => e.branchId === b.id && e.isSaudi).length })),
    byDepartment: svc.db.departments.filter((d) => d.companyId === u.companyId).sort(byCreatedAsc).map((d) => ({ departmentId: d.id, name: d.name, count: active.filter((e) => e.departmentId === d.id).length })),
    byNationality: [...group((e) => e.nationality).entries()].map(([nationality, count]) => ({ nationality, count })).sort((a, b) => b.count - a.count),
    byGender: [...group((e) => e.gender).entries()].map(([gender, count]) => ({ gender, count })),
    joinersByMonth: months.map((p) => ({ period: p, count: emps.filter((e) => periodOf(e.hireDate) === p).length })),
    leaversByMonth: months.map((p) => ({ period: p, count: emps.filter((e) => e.terminationDate && periodOf(e.terminationDate) === p).length })),
  };
}
function payrollCost(svc: Services, u: AuthUser, from?: string, to?: string) {
  return svc.db.runs.filter((r) => r.companyId === u.companyId && r.status !== 'DRAFT' && r.period >= (from || '0000-00') && r.period <= (to || '9999-99'))
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((r) => ({ period: r.period, status: r.status, employeesCount: r.employeesCount, gross: r.totalGross, net: r.totalNet, deductions: r.totalDeductions, gosiEmployer: r.totalGosiEmployer, employerCost: r.totalEmployerCost }));
}
function attendanceReport(svc: Services, u: AuthUser, from?: string, to?: string) {
  const map = new Map<string, { branchId: string | null; branchName: string | null; employees: number; presentDays: number; lateDays: number; absentDays: number; lateMinutes: number; overtimeMinutes: number; workedHours: number }>();
  for (const r of attendanceSummary(svc, u, { from, to })) {
    const k = r.branchId ?? 'none';
    const a = map.get(k) ?? { branchId: r.branchId, branchName: r.branchName, employees: 0, presentDays: 0, lateDays: 0, absentDays: 0, lateMinutes: 0, overtimeMinutes: 0, workedHours: 0 };
    a.employees++; a.presentDays += r.presentDays; a.lateDays += r.lateDays; a.absentDays += r.absentDays; a.lateMinutes += r.lateMinutes; a.overtimeMinutes += r.overtimeMinutes; a.workedHours = r2(a.workedHours + r.workedHours);
    map.set(k, a);
  }
  return [...map.values()];
}

// ---------- recruitment / performance ----------
function jobView(svc: Services, j: (typeof svc.db.jobs)[number]) {
  const b = svc.branch(j.branchId);
  const d = svc.dept(j.departmentId);
  return { ...j, branch: b ? { id: b.id, nameAr: b.nameAr } : null, department: d ? { id: d.id, name: d.name } : null, candidatesCount: svc.db.candidates.filter((c) => c.jobId === j.id).length };
}
function scopedJob(svc: Services, u: AuthUser, id: string) {
  const j = svc.db.jobs.find((x) => x.id === id && x.companyId === u.companyId);
  if (!j) throw notFound('Job', 'الوظيفة غير موجودة');
  return j;
}
function jobRefs(svc: Services, u: AuthUser, dto: Record<string, unknown>) {
  if (dto.branchId && !svc.db.branches.some((b) => b.id === dto.branchId && b.companyId === u.companyId)) throw badRequest('Invalid branchId', 'الفرع غير موجود');
  if (dto.departmentId && !svc.db.departments.some((d) => d.id === dto.departmentId && d.companyId === u.companyId)) throw badRequest('Invalid departmentId', 'القسم غير موجود');
}
function cycleView(svc: Services, c: (typeof svc.db.cycles)[number]) {
  const rs = svc.db.reviews.filter((r) => r.cycleId === c.id);
  return { ...c, reviewsCount: rs.length, completedCount: rs.filter((r) => r.status === 'SUBMITTED').length };
}
function announcementsFor(svc: Services, u: AuthUser) {
  const scoped = u.role === 'EMPLOYEE' || u.role === 'BRANCH_MANAGER';
  return svc.db.announcements.filter((a) => a.companyId === u.companyId && (!scoped || a.branchId === null || (!!u.branchId && a.branchId === u.branchId))).sort(byCreatedDesc);
}

// ---------- self-service ----------
function me(svc: Services, u: AuthUser) {
  if (!u.employeeId) throw forbidden('This account is not linked to an employee', 'حسابك غير مرتبط بملف موظف');
  const e = svc.db.employees.find((x) => x.id === u.employeeId && x.companyId === u.companyId);
  if (!e) throw notFound('Employee', 'ملف الموظف غير موجود');
  return e;
}
function geofence(svc: Services, e: Employee, body: Record<string, unknown>) {
  const lat = v.num(body, 'lat', { min: -90, max: 90 })!;
  const lng = v.num(body, 'lng', { min: -180, max: 180 })!;
  const b = svc.branch(e.branchId);
  if (!b) throw badRequest('No branch assigned', 'لا يوجد فرع مرتبط بملفك');
  const center = { lat: b.lat, lng: b.lng };
  if (!isWithinGeofence({ lat, lng }, center, b.radiusMeters)) {
    throw badRequest('You are outside the branch geofence', 'أنت خارج نطاق الفرع', { distanceMeters: Math.round(haversineMeters({ lat, lng }, center)), radiusMeters: b.radiusMeters });
  }
  return { lat, lng };
}
const releasedRun = (svc: Services, companyId: string, runIdValue: string) => { const s = svc.runStatus(companyId, runIdValue); return s === 'APPROVED' || s === 'PAID'; };

export const moreRoutes: Route[] = [
  // ---------- leaves ----------
  route('GET', '/leaves', STAFF, ({ db, svc, user: u, query: q }) => {
    const b = svc.branchFilter(u, q.branchId);
    const where = svc.employeeWhere(u);
    const rows = db.leaves.filter((l) => {
      const e = svc.emp(l.employeeId);
      return l.companyId === u.companyId && !!e && where(e) && (!b || e.branchId === b) && (!q.status || l.status === q.status) && (!q.employeeId || l.employeeId === q.employeeId)
        && (!q.leaveTypeId || l.leaveTypeId === q.leaveTypeId) && (!q.from || l.endDate >= q.from) && (!q.to || l.startDate <= q.to);
    }).sort(byCreatedDesc);
    const page = paginate(rows, q);
    return { ...page, data: page.data.map((l) => leaveView(svc, l)) };
  }),
  route('GET', '/leaves/balances', STAFF, ({ svc, user: u, query }) => {
    const id = query.employeeId || u.employeeId;
    if (!id) throw badRequest('employeeId is required', 'رقم الموظف مطلوب');
    return svc.balances(svc.scopedEmployee(u, id));
  }),
  route('POST', '/leaves', [...APPROVERS], ({ svc, user: u, body }) => createLeaveFor(svc, u, svc.scopedEmployee(u, v.str(body, 'employeeId')!), body)),
  route('POST', '/leaves/:id/approve', [...APPROVERS], ({ svc, user, params, body }) => decideLeave(svc, user, params.id, true, body.comment as string | undefined)),
  route('POST', '/leaves/:id/reject', [...APPROVERS], ({ svc, user, params, body }) => decideLeave(svc, user, params.id, false, body.comment as string | undefined)),

  // ---------- requests & loans ----------
  route('GET', '/requests', STAFF, ({ db, svc, user: u, query: q }) => {
    const b = svc.branchFilter(u, q.branchId);
    const where = svc.employeeWhere(u);
    const rows = db.requests.filter((r) => {
      const e = svc.emp(r.employeeId);
      return r.companyId === u.companyId && !!e && where(e) && (!b || e.branchId === b) && (!q.type || r.type === q.type) && (!q.status || r.status === q.status) && (!q.employeeId || r.employeeId === q.employeeId);
    }).sort(byCreatedDesc);
    const page = paginate(rows, q);
    return { ...page, data: page.data.map((r) => ({ ...r, employee: empLite(svc, r.employeeId) })) };
  }),
  route('POST', '/requests/:id/approve', STAFF, ({ svc, user, params, body }) => decideRequest(svc, user, params.id, true, body.comment as string | undefined)),
  route('POST', '/requests/:id/reject', STAFF, ({ svc, user, params, body }) => decideRequest(svc, user, params.id, false, body.comment as string | undefined)),
  route('GET', '/loans', [...FINANCE], ({ db, svc, user: u, query: q }) => db.loans.filter((l) => l.companyId === u.companyId && (!q.status || l.status === q.status) && (!q.employeeId || l.employeeId === q.employeeId)).sort(byCreatedDesc).map((l) => loanView(svc, l))),
  route('POST', '/loans', [...FINANCE], ({ db, svc, user: u, body }) => {
    v.str(body, 'employeeId'); const amount = v.num(body, 'amount', { min: 1 })!; const monthlyDeduction = v.num(body, 'monthlyDeduction', { min: 1 })!; const startPeriod = v.match(body, 'startPeriod', PERIOD_RE)!;
    svc.scopedEmployee(u, String(body.employeeId));
    if (monthlyDeduction > amount) throw badRequest('monthlyDeduction exceeds amount', 'القسط الشهري أكبر من مبلغ السلفة');
    const now = nowIso();
    const l = { id: nextId(db, 'loan'), companyId: u.companyId, employeeId: String(body.employeeId), amount, monthlyDeduction, remaining: amount, startPeriod, status: 'ACTIVE' as const, note: (body.note as string) ?? null, requestId: null, createdAt: now, updatedAt: now };
    db.loans.push(l);
    svc.audit(u, 'CREATE', 'Loan', l.id, pick(body, ['employeeId', 'amount', 'monthlyDeduction', 'startPeriod', 'note']));
    return { ...l, employee: empLite(svc, l.employeeId) };
  }),
  route('PATCH', '/loans/:id', [...FINANCE], ({ db, svc, user: u, params, body }) => {
    const l = db.loans.find((x) => x.id === params.id && x.companyId === u.companyId);
    if (!l) throw notFound('Loan', 'السلفة غير موجودة');
    const dto = pick(body, ['monthlyDeduction', 'remaining', 'startPeriod', 'status', 'note']);
    if (dto.monthlyDeduction !== undefined) dto.monthlyDeduction = v.num(dto, 'monthlyDeduction', { min: 1 });
    if (dto.remaining !== undefined) dto.remaining = v.num(dto, 'remaining', { min: 0 });
    if (dto.startPeriod !== undefined) v.match(dto, 'startPeriod', PERIOD_RE);
    if (dto.status !== undefined) v.oneOf(dto, 'status', ['ACTIVE', 'PAID', 'CANCELLED'] as const);
    Object.assign(l, dto, { updatedAt: nowIso() });
    if (dto.remaining !== undefined && (dto.remaining as number) <= 0 && !dto.status) l.status = 'PAID';
    svc.audit(u, 'UPDATE', 'Loan', l.id, dto);
    return { ...l, employee: empLite(svc, l.employeeId) };
  }),

  // ---------- payroll ----------
  route('GET', '/payroll/runs', [...FINANCE], ({ db, user }) => db.runs.filter((r) => r.companyId === user.companyId).sort((a, b) => b.period.localeCompare(a.period))),
  route('POST', '/payroll/runs', [...FINANCE], ({ db, svc, user: u, body }) => {
    const period = v.match(body, 'period', PERIOD_RE)!;
    if (db.runs.some((r) => r.companyId === u.companyId && r.period === period)) throw conflict(`Payroll run for ${period} already exists`, `يوجد مسير رواتب لشهر ${period} مسبقاً`);
    const now = nowIso();
    const run = { id: runId(period), companyId: u.companyId, period, status: 'DRAFT' as const, employeesCount: 0, totalGross: 0, totalDeductions: 0, totalNet: 0, totalGosiEmployer: 0, totalEmployerCost: 0, calculatedAt: null, approvedAt: null, approvedById: null, approvedByName: null, paidAt: null, wpsExportedAt: null, createdAt: now, updatedAt: now };
    db.runs.push(run);
    svc.audit(u, 'CREATE', 'PayrollRun', run.id, { period });
    return run;
  }),
  route('GET', '/payroll/runs/:id', [...FINANCE], ({ svc, user, params }) => runDetail(svc, user, params.id)),
  route('POST', '/payroll/runs/:id/calculate', [...FINANCE], ({ svc, user: u, params }) => {
    let run;
    try { run = svc.calculateRun(u.companyId, params.id); } catch (e) { mapStateError(e); }
    svc.audit(u, 'CALCULATE', 'PayrollRun', params.id, { period: run.period, totalNet: run.totalNet });
    return runDetail(svc, u, params.id);
  }),
  route('POST', '/payroll/runs/:id/approve', [...FINANCE], ({ svc, user: u, params }) => {
    let run;
    try { run = svc.approveRun(u.companyId, params.id, u); } catch (e) { mapStateError(e); }
    svc.audit(u, 'APPROVE', 'PayrollRun', params.id, { period: run.period });
    return run;
  }),
  route('POST', '/payroll/runs/:id/mark-paid', [...FINANCE], ({ db, svc, user: u, params }) => {
    const run = getRun(svc, u, params.id);
    if (run.status !== 'APPROVED') throw badRequest('Run must be APPROVED first', 'يجب اعتماد المسير قبل تأكيد الصرف');
    Object.assign(run, { status: 'PAID', paidAt: nowIso(), updatedAt: nowIso() });
    const slips = db.payslips.filter((p) => p.companyId === u.companyId && p.payrollRunId === run.id);
    const users = db.users.filter((x) => x.companyId === u.companyId && x.isActive && x.employeeId && slips.some((s) => s.employeeId === x.employeeId));
    for (const x of users) svc.notifyUsers(u.companyId, [x.id], `تم صرف راتب شهر ${run.period}`, 'قسيمة الراتب متاحة الآن في الخدمة الذاتية', svc.payslipLink(slips.find((s) => s.employeeId === x.employeeId)!.id));
    svc.audit(u, 'MARK_PAID', 'PayrollRun', run.id, { period: run.period, notified: users.length });
    return run;
  }),
  route('DELETE', '/payroll/runs/:id', [...FINANCE], ({ db, svc, user: u, params }) => {
    const run = getRun(svc, u, params.id);
    if (run.status !== 'DRAFT' && run.status !== 'CALCULATED') throw badRequest('Only DRAFT/CALCULATED runs can be deleted', 'لا يمكن حذف مسير معتمد أو مصروف');
    db.runs = db.runs.filter((r) => r !== run);
    db.payslips = db.payslips.filter((p) => !(p.companyId === u.companyId && p.payrollRunId === run.id));
    svc.audit(u, 'DELETE', 'PayrollRun', run.id, { period: run.period });
    return ok;
  }),
  route('GET', '/payroll/runs/:id/wps', [...FINANCE], ({ svc, user, params, query }) => {
    const r = wps(svc, user, params.id);
    if (query.validate === '1' || query.validate === 'true') {
      if (r.errors.length) throw badRequest('WPS validation failed', 'يوجد أخطاء في ملف حماية الأجور', { errors: r.errors, count: r.count, totalNet: r.totalNet });
      return { errors: [], count: r.count, totalNet: r.totalNet };
    }
    getRun(svc, user, params.id).wpsExportedAt = nowIso();
    return r.csv;
  }),
  route('GET', '/payroll/runs/:id/wps-check', [...FINANCE], ({ svc, user, params }) => wpsCheck(svc, user, params.id)),
  route('GET', '/payroll/payslips/:id', [...FINANCE], ({ db, svc, user, params }) => {
    const p = db.payslips.find((x) => x.id === params.id && x.companyId === user.companyId);
    if (!p) throw notFound('Payslip', 'قسيمة الراتب غير موجودة');
    return payslipView(svc, p);
  }),
  route('GET', '/payroll/adjustments', [...FINANCE], ({ db, svc, user: u, query: q }) => db.adjustments
    .filter((a) => a.companyId === u.companyId && (!q.period || a.period === q.period) && (!q.employeeId || a.employeeId === q.employeeId)).sort(byCreatedDesc)
    .map((a) => { const e = svc.emp(a.employeeId)!; return { ...a, employee: { id: e.id, name: fullName(e), employeeNumber: e.employeeNumber } }; })),
  route('POST', '/payroll/adjustments', [...FINANCE], ({ db, svc, user: u, body }) => {
    const employeeId = v.str(body, 'employeeId')!; const period = v.match(body, 'period', PERIOD_RE)!;
    const type = v.oneOf(body, 'type', ['BONUS', 'COMMISSION', 'ALLOWANCE', 'DEDUCTION', 'PENALTY'] as const)!; const amount = v.num(body, 'amount', { min: 0.01 })!;
    svc.scopedEmployee(u, employeeId);
    assertPeriodOpen(svc, u.companyId, period);
    const a = { id: nextId(db, 'adj'), companyId: u.companyId, employeeId, period, type, amount, note: (body.note as string) ?? null, createdById: u.id, createdAt: nowIso() };
    db.adjustments.push(a);
    svc.audit(u, 'CREATE', 'PayrollAdjustment', a.id, pick(body, ['employeeId', 'period', 'type', 'amount', 'note']));
    return a;
  }),
  route('DELETE', '/payroll/adjustments/:id', [...FINANCE], ({ db, svc, user: u, params }) => {
    const a = db.adjustments.find((x) => x.id === params.id && x.companyId === u.companyId);
    if (!a) throw notFound('Adjustment', 'التسوية غير موجودة');
    assertPeriodOpen(svc, u.companyId, a.period);
    db.adjustments = db.adjustments.filter((x) => x.id !== a.id);
    svc.audit(u, 'DELETE', 'PayrollAdjustment', a.id);
    return ok;
  }),

  // ---------- saudization ----------
  route('GET', '/saudization', STAFF, ({ db, svc, user: u }) => {
    const { active } = counts(svc, u);
    const company = saudizationSummary(active);
    const nb = nextBand(company.band);
    return {
      scope: u.role === 'BRANCH_MANAGER' ? 'BRANCH' : 'COMPANY',
      company: { ...company, nonSaudis: company.total - company.saudis, nextBand: nb, hiresToNextBand: nb ? hiresNeededForBand(company.documentedSaudis, company.total, nb) : 0 },
      branches: db.branches.filter((b) => b.companyId === u.companyId && (u.role !== 'BRANCH_MANAGER' || b.id === u.branchId)).sort(byCreatedAsc).map((b) => {
        const s = saudizationSummary(active.filter((e) => e.branchId === b.id));
        const bn = nextBand(s.band);
        return { branchId: b.id, branchName: b.nameAr, ...s, hiresToNextBand: bn ? hiresNeededForBand(s.documentedSaudis, s.total, bn) : 0 };
      }),
      undocumented: active.filter((e) => e.isSaudi && !e.qiwaDocumented).sort(byNumber)
        .map((e) => ({ id: e.id, employeeNumber: e.employeeNumber, name: fullName(e), branchId: e.branchId, branchName: svc.branch(e.branchId)?.nameAr ?? null })),
      thresholds: DEFAULT_NITAQAT_THRESHOLDS,
    };
  }),
  route('GET', '/saudization/simulate', STAFF, ({ svc, user: u, query }) => {
    // official count: new hires are assumed to be documented in Qiwa
    const { total, documentedSaudis: saudis } = counts(svc, u);
    const as = Math.max(0, Number(query.addSaudis) || 0);
    const an = Math.max(0, Number(query.addNonSaudis) || 0);
    const before = saudizationRate(saudis, total);
    const after = saudizationRate(saudis + as, total + as + an);
    return { before: { total, saudis, rate: before, band: nitaqatBand(before) }, after: { total: total + as + an, saudis: saudis + as, rate: after, band: nitaqatBand(after) } };
  }),

  // ---------- performance ----------
  route('GET', '/performance/cycles', STAFF, ({ db, svc, user }) => db.cycles.filter((c) => c.companyId === user.companyId).sort((a, b) => b.startDate.localeCompare(a.startDate)).map((c) => cycleView(svc, c))),
  route('POST', '/performance/cycles', ADMIN, ({ db, svc, user: u, body }) => {
    const name = v.str(body, 'name')!; const startDate = v.match(body, 'startDate', DAY_RE)!; const endDate = v.match(body, 'endDate', DAY_RE)!;
    if (endDate < startDate) throw badRequest('endDate before startDate', 'تاريخ النهاية قبل البداية');
    const c = { id: nextId(db, 'cyc'), companyId: u.companyId, name, startDate, endDate, status: 'DRAFT' as const, createdAt: nowIso() };
    db.cycles.push(c);
    svc.audit(u, 'CREATE', 'ReviewCycle', c.id, { name, startDate, endDate });
    return cycleView(svc, c);
  }),
  route('PATCH', '/performance/cycles/:id', ADMIN, ({ db, svc, user: u, params, body }) => {
    const c = db.cycles.find((x) => x.id === params.id && x.companyId === u.companyId);
    if (!c) throw notFound('Cycle', 'دورة التقييم غير موجودة');
    const dto = pick(body, ['name', 'startDate', 'endDate', 'status']);
    if (dto.startDate !== undefined) v.match(dto, 'startDate', DAY_RE);
    if (dto.endDate !== undefined) v.match(dto, 'endDate', DAY_RE);
    if (dto.status !== undefined) v.oneOf(dto, 'status', ['DRAFT', 'ACTIVE', 'CLOSED'] as const);
    if (dto.name) c.name = String(dto.name);
    if (dto.startDate) c.startDate = String(dto.startDate);
    if (dto.endDate) c.endDate = String(dto.endDate);
    if (dto.status) c.status = dto.status as typeof c.status;
    if (dto.status === 'ACTIVE') {
      const now = nowIso();
      for (const e of db.employees.filter((x) => x.companyId === u.companyId && x.status !== 'TERMINATED')) {
        if (db.reviews.some((r) => r.cycleId === c.id && r.employeeId === e.id)) continue;
        db.reviews.push({ id: nextId(db, 'rev'), companyId: u.companyId, cycleId: c.id, employeeId: e.id, reviewerId: e.managerId, goals: DEFAULT_GOALS.map((g) => ({ ...g })), overallScore: null, comments: null, status: 'PENDING', submittedAt: null, createdAt: now, updatedAt: now });
      }
    }
    svc.audit(u, 'UPDATE', 'ReviewCycle', c.id, dto);
    return cycleView(svc, c);
  }),
  route('GET', '/performance/reviews', STAFF, ({ db, svc, user: u, query }) => {
    const where = svc.employeeWhere(u);
    return db.reviews.filter((r) => { const e = svc.emp(r.employeeId); return r.companyId === u.companyId && (!query.cycleId || r.cycleId === query.cycleId) && !!e && where(e); })
      .sort((a, b) => byNumber(svc.emp(a.employeeId)!, svc.emp(b.employeeId)!))
      .map((r) => {
        const e = svc.emp(r.employeeId)!;
        const rv = svc.emp(r.reviewerId);
        return { ...r, employee: { id: e.id, name: fullName(e), jobTitle: e.jobTitle, employeeNumber: e.employeeNumber, branchName: svc.branch(e.branchId)?.nameAr ?? null }, reviewerName: rv ? fullName(rv) : null };
      });
  }),
  route('PATCH', '/performance/reviews/:id', [...APPROVERS], ({ db, svc, user: u, params, body }) => {
    const r = db.reviews.find((x) => x.id === params.id && x.companyId === u.companyId);
    if (!r) throw notFound('Review', 'التقييم غير موجود');
    svc.scopedEmployee(u, r.employeeId);
    const cycle = db.cycles.find((c) => c.id === r.cycleId)!;
    if (cycle.status === 'CLOSED') throw badRequest('Cycle is closed', 'دورة التقييم مغلقة');
    let goals = r.goals;
    if (body.goals !== undefined) {
      if (!Array.isArray(body.goals)) throw badRequest('goals must be an array');
      goals = (body.goals as Goal[]).map((g) => {
        if (typeof g.title !== 'string' || !(Number(g.weight) >= 0 && Number(g.weight) <= 100)) throw badRequest('goals must be valid');
        const score = g.score === null || g.score === undefined ? null : Number(g.score);
        if (score !== null && !(score >= 1 && score <= 5)) throw badRequest('score must not be less than 1');
        return { title: g.title, weight: Number(g.weight), score };
      });
    }
    const status = v.oneOf(body, 'status', ['PENDING', 'SUBMITTED'] as const, true);
    r.goals = goals;
    r.overallScore = weightedScore(goals);
    if (body.comments !== undefined) r.comments = body.comments as string;
    if (status) { r.status = status; r.submittedAt = status === 'SUBMITTED' ? nowIso() : null; }
    r.updatedAt = nowIso();
    svc.audit(u, 'UPDATE', 'PerformanceReview', r.id, pick(body, ['goals', 'comments', 'status']));
    return r;
  }),

  // ---------- recruitment ----------
  route('GET', '/jobs', STAFF, ({ db, svc, user }) => db.jobs.filter((j) => j.companyId === user.companyId).sort(byCreatedDesc).map((j) => jobView(svc, j))),
  route('GET', '/jobs/:id', STAFF, ({ svc, user, params }) => jobView(svc, scopedJob(svc, user, params.id))),
  route('POST', '/jobs', ADMIN, ({ db, svc, user: u, body }) => {
    v.str(body, 'title', { min: 2 }); v.str(body, 'employmentType');
    const dto = pick(body, ['title', 'branchId', 'departmentId', 'employmentType', 'description', 'status']);
    if (dto.status !== undefined) v.oneOf(dto, 'status', ['OPEN', 'CLOSED'] as const);
    jobRefs(svc, u, dto);
    db.jobUsed += 1;
    const id = db.jobUsed <= JOB_POOL ? jobId(db.jobUsed) : nextId(db, 'job-x');
    const now = nowIso();
    const j = { id, companyId: u.companyId, title: String(dto.title), branchId: (dto.branchId as string) || null, departmentId: (dto.departmentId as string) || null, employmentType: String(dto.employmentType), description: (dto.description as string) ?? null, status: (dto.status as 'OPEN' | 'CLOSED') ?? 'OPEN', createdAt: now, updatedAt: now };
    db.jobs.push(j);
    svc.audit(u, 'CREATE', 'JobOpening', j.id, dto);
    return jobView(svc, j);
  }),
  route('PATCH', '/jobs/:id', ADMIN, ({ svc, user: u, params, body }) => {
    const j = scopedJob(svc, u, params.id);
    const dto = pick(body, ['title', 'branchId', 'departmentId', 'employmentType', 'description', 'status']);
    if (dto.status !== undefined) v.oneOf(dto, 'status', ['OPEN', 'CLOSED'] as const);
    jobRefs(svc, u, dto);
    for (const k of ['branchId', 'departmentId']) if (dto[k] === '') dto[k] = null;
    Object.assign(j, dto, { updatedAt: nowIso() });
    svc.audit(u, 'UPDATE', 'JobOpening', j.id, dto);
    return jobView(svc, j);
  }),
  route('DELETE', '/jobs/:id', ADMIN, ({ db, svc, user: u, params }) => {
    const j = scopedJob(svc, u, params.id);
    db.jobs = db.jobs.filter((x) => x.id !== j.id);
    db.candidates = db.candidates.filter((c) => c.jobId !== j.id);
    svc.audit(u, 'DELETE', 'JobOpening', j.id);
    return ok;
  }),
  route('GET', '/jobs/:id/candidates', STAFF, ({ db, svc, user: u, params }) => {
    scopedJob(svc, u, params.id);
    return db.candidates.filter((c) => c.jobId === params.id && c.companyId === u.companyId).sort(byCreatedAsc);
  }),
  route('POST', '/jobs/:id/candidates', ADMIN, ({ db, svc, user: u, params, body }) => {
    const j = scopedJob(svc, u, params.id);
    v.str(body, 'name', { min: 2 });
    const email = v.email(body, 'email', true);
    const now = nowIso();
    const c = { id: nextId(db, 'cand'), companyId: u.companyId, jobId: j.id, name: String(body.name), email: email ?? null, phone: (body.phone as string) ?? null, nationality: (body.nationality as string) ?? null, expectedSalary: body.expectedSalary === undefined || body.expectedSalary === null ? null : v.num(body, 'expectedSalary', { min: 0 })!, notes: (body.notes as string) ?? null, stage: 'APPLIED', createdAt: now, updatedAt: now };
    db.candidates.push(c);
    svc.audit(u, 'CREATE', 'Candidate', c.id, pick(body, ['name', 'email', 'phone', 'nationality', 'expectedSalary', 'notes']));
    return c;
  }),
  route('PATCH', '/candidates/:id', ADMIN, ({ db, svc, user: u, params, body }) => {
    const c = db.candidates.find((x) => x.id === params.id && x.companyId === u.companyId);
    if (!c) throw notFound('Candidate', 'المرشح غير موجود');
    const dto = pick(body, ['name', 'email', 'phone', 'nationality', 'expectedSalary', 'notes', 'stage']);
    if (dto.stage !== undefined) v.oneOf(dto, 'stage', ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'] as const);
    const moved = dto.stage && dto.stage !== c.stage;
    Object.assign(c, dto, { updatedAt: nowIso() });
    svc.audit(u, moved ? 'MOVE_STAGE' : 'UPDATE', 'Candidate', c.id, dto);
    return c;
  }),
  route('DELETE', '/candidates/:id', ADMIN, ({ db, svc, user: u, params }) => {
    const c = db.candidates.find((x) => x.id === params.id && x.companyId === u.companyId);
    if (!c) throw notFound('Candidate', 'المرشح غير موجود');
    db.candidates = db.candidates.filter((x) => x.id !== c.id);
    svc.audit(u, 'DELETE', 'Candidate', c.id);
    return ok;
  }),

  // ---------- announcements & notifications ----------
  route('GET', '/announcements', ALL_ROLES, ({ svc, user }) => announcementsFor(svc, user).slice(0, 100).map((a) => ({ ...a, branchName: svc.branch(a.branchId)?.nameAr ?? null }))),
  route('POST', '/announcements', ADMIN, ({ db, svc, user: u, body }) => {
    const title = v.str(body, 'title', { min: 2 })!; const text = v.str(body, 'body', { min: 2 })!;
    const branchId = (body.branchId as string) || null;
    if (branchId && !db.branches.some((b) => b.id === branchId && b.companyId === u.companyId)) throw badRequest('Invalid branchId', 'الفرع غير موجود');
    const a = { id: nextId(db, 'ann'), companyId: u.companyId, title, body: text, branchId, authorId: u.id, authorName: u.name, createdAt: nowIso() };
    db.announcements.push(a);
    const users = db.users.filter((x) => x.companyId === u.companyId && x.isActive && x.id !== u.id && (!branchId || svc.emp(x.employeeId)?.branchId === branchId));
    svc.notifyUsers(u.companyId, users.map((x) => x.id), `إعلان: ${title}`, text.slice(0, 140), '/announcements');
    svc.audit(u, 'CREATE', 'Announcement', a.id, { title, body: text, branchId });
    return a;
  }),
  route('DELETE', '/announcements/:id', ADMIN, ({ db, svc, user: u, params }) => {
    const a = db.announcements.find((x) => x.id === params.id && x.companyId === u.companyId);
    if (!a) throw notFound('Announcement', 'الإعلان غير موجود');
    db.announcements = db.announcements.filter((x) => x.id !== a.id);
    svc.audit(u, 'DELETE', 'Announcement', a.id);
    return ok;
  }),
  route('GET', '/notifications', ALL_ROLES, ({ db, user }) => db.notifications.filter((n) => n.userId === user.id && n.companyId === user.companyId).sort(byCreatedDesc).slice(0, 50)
    .map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, readAt: n.readAt, createdAt: n.createdAt }))),
  route('POST', '/notifications/read-all', ALL_ROLES, ({ db, user }) => {
    let count = 0;
    const now = nowIso();
    db.notifications.forEach((n) => { if (n.userId === user.id && !n.readAt) { n.readAt = now; count++; } });
    return { ok: true, count };
  }),
  route('POST', '/notifications/:id/read', ALL_ROLES, ({ db, user, params }) => {
    const n = db.notifications.find((x) => x.id === params.id && x.userId === user.id);
    if (!n) throw notFound('Notification', 'الإشعار غير موجود');
    n.readAt = n.readAt ?? nowIso();
    return n;
  }),

  // ---------- reports ----------
  route('GET', '/reports/headcount', [...FINANCE], ({ svc, user }) => headcount(svc, user)),
  route('GET', '/reports/payroll-cost', [...FINANCE], ({ svc, user, query }) => payrollCost(svc, user, query.from, query.to)),
  route('GET', '/reports/attendance', [...FINANCE], ({ svc, user, query }) => attendanceReport(svc, user, query.from, query.to)),
  route('GET', '/reports/:name/export', [...FINANCE], ({ db, svc, user: u, params, query: q }) => {
    let csv: string;
    switch (params.name) {
      case 'headcount': csv = toCsv(headcount(svc, u).byBranch.map((b) => ({ branch: b.branchName, employees: b.count, saudis: b.saudis, nonSaudis: b.count - b.saudis }))); break;
      case 'payroll-cost': csv = toCsv(payrollCost(svc, u, q.from, q.to)); break;
      case 'attendance': csv = toCsv(attendanceReport(svc, u, q.from, q.to)); break;
      case 'employees':
        csv = toCsv(db.employees.filter((e) => e.companyId === u.companyId).sort(byNumber).map((e) => ({
          employeeNumber: e.employeeNumber, name: fullName(e), nameEn: e.fullNameEn, nationality: e.nationality, gender: e.gender, nationalId: e.nationalId,
          branch: svc.branch(e.branchId)?.nameAr, department: svc.dept(e.departmentId)?.name, jobTitle: e.jobTitle, hireDate: e.hireDate, status: e.status,
          basicSalary: e.basicSalary, housingAllowance: e.housingAllowance, transportAllowance: e.transportAllowance, otherAllowances: e.otherAllowances, iban: e.iban,
        })));
        break;
      default: throw notFound('Report', 'التقرير غير موجود');
    }
    svc.audit(u, 'EXPORT', 'Report', params.name, q);
    return csv;
  }),

  // ---------- self-service ----------
  route('GET', '/me/profile', ALL_ROLES, ({ svc, user }) => employeeDetail(svc, { ...user, role: 'EMPLOYEE' }, me(svc, user).id)),
  route('GET', '/me/home', ALL_ROLES, ({ db, svc, user: u }) => {
    const e = me(svc, u);
    const today = todayStr();
    const shift = svc.shiftFor(e, today);
    const row = svc.board((x) => x.id === e.id && x.companyId === u.companyId, today)[0];
    const pendingLeaves = db.leaves.filter((l) => l.employeeId === e.id && l.status === 'PENDING').length;
    const pendingReqs = db.requests.filter((r) => r.employeeId === e.id && r.status === 'PENDING').length;
    const last = db.payslips.filter((p) => p.employeeId === e.id && releasedRun(svc, p.companyId, p.payrollRunId)).sort((a, b) => b.period.localeCompare(a.period))[0];
    const b = svc.branch(e.branchId);
    return {
      employee: { id: e.id, name: fullName(e), jobTitle: e.jobTitle, branchName: b?.nameAr ?? null, avatarColor: e.avatarColor, employeeNumber: e.employeeNumber },
      today: {
        date: today, shift: shift ? { id: shift.id, name: shift.name, startTime: shift.startTime, endTime: shift.endTime } : null,
        checkIn: row?.checkIn ?? null, checkOut: row?.checkOut ?? null, status: row?.status ?? 'OFF', lateMinutes: row?.lateMinutes ?? 0, workedMinutes: row?.workedMinutes ?? 0,
      },
      leaveBalance: svc.annualBalance(e),
      pendingRequests: pendingLeaves + pendingReqs,
      pendingLeaves,
      lastPayslip: last ? { id: last.id, period: last.period, net: last.net, gross: last.gross } : null,
      announcements: announcementsFor(svc, { ...u, branchId: e.branchId }).slice(0, 5),
      branch: b ? { id: b.id, name: b.nameAr, lat: b.lat, lng: b.lng, radiusMeters: b.radiusMeters } : null,
    };
  }),
  route('POST', '/me/attendance/check-in', ALL_ROLES, ({ db, svc, user: u, body }) => {
    const e = me(svc, u);
    const loc = geofence(svc, e, body);
    const today = todayStr();
    const existing = db.attendance.find((r) => r.employeeId === e.id && r.date === today);
    if (existing?.checkIn) throw conflict('Already checked in today', 'تم تسجيل الحضور مسبقاً اليوم');
    const shift = svc.shiftFor(e, today);
    const now = new Date();
    const m = svc.compute(shift, now, null);
    const data = { shiftId: shift?.id ?? null, checkIn: now.toISOString(), checkInLat: loc.lat, checkInLng: loc.lng, lateMinutes: m.lateMinutes, workedMinutes: 0, overtimeMinutes: 0, status: m.status, source: 'SELF', updatedAt: now.toISOString() };
    let rec = existing;
    if (rec) Object.assign(rec, data);
    else {
      rec = { id: nextId(db, 'att'), companyId: u.companyId, employeeId: e.id, date: today, checkOut: null, checkOutLat: null, checkOutLng: null, earlyLeaveMinutes: 0, note: null, createdAt: now.toISOString(), ...data };
      db.attendance.push(rec);
    }
    svc.audit(u, 'CHECK_IN', 'AttendanceRecord', rec.id, { ...loc, lateMinutes: m.lateMinutes });
    return { ...rec, status: m.lateMinutes > 0 ? 'LATE' : 'PRESENT', shift: shift ? { name: shift.name, startTime: shift.startTime, endTime: shift.endTime } : null };
  }),
  route('POST', '/me/attendance/check-out', ALL_ROLES, ({ db, svc, user: u, body }) => {
    const e = me(svc, u);
    const loc = geofence(svc, e, body);
    const today = todayStr();
    const now = new Date();
    let rec = db.attendance.find((r) => r.employeeId === e.id && r.date === today);
    if (!rec) {
      // Overnight shift: no record today → close the latest still-open record checked in within the last 16 hours.
      const since = now.getTime() - OVERNIGHT_WINDOW_MS;
      rec = db.attendance
        .filter((r) => r.employeeId === e.id && r.checkIn && !r.checkOut && Date.parse(r.checkIn) >= since && Date.parse(r.checkIn) <= now.getTime())
        .sort((a, b) => b.checkIn!.localeCompare(a.checkIn!))[0];
    }
    if (!rec?.checkIn) throw badRequest('You have not checked in today', 'لم يتم تسجيل الحضور اليوم');
    if (rec.checkOut) throw conflict('Already checked out today', 'تم تسجيل الانصراف مسبقاً اليوم');
    const shift = svc.shift(rec.shiftId) ?? svc.shiftFor(e, rec.date);
    const m = svc.compute(shift, new Date(rec.checkIn), now);
    Object.assign(rec, { checkOut: now.toISOString(), checkOutLat: loc.lat, checkOutLng: loc.lng, workedMinutes: m.workedMinutes, lateMinutes: m.lateMinutes, earlyLeaveMinutes: m.earlyLeaveMinutes, overtimeMinutes: m.overtimeMinutes, status: m.status, updatedAt: now.toISOString() });
    svc.audit(u, 'CHECK_OUT', 'AttendanceRecord', rec.id, { ...loc, workedMinutes: m.workedMinutes });
    return rec;
  }),
  route('GET', '/me/attendance', ALL_ROLES, ({ db, svc, user: u, query }) => {
    const e = me(svc, u);
    const period = query.month && /^\d{4}-\d{2}$/.test(query.month) ? query.month : todayStr().slice(0, 7);
    const { start, end } = periodRange(period);
    return db.attendance.filter((r) => r.employeeId === e.id && r.date >= start && r.date <= end).sort((a, b) => b.date.localeCompare(a.date))
      .map((r) => ({ id: r.id, date: r.date, checkIn: r.checkIn, checkOut: r.checkOut, workedMinutes: r.workedMinutes, lateMinutes: r.lateMinutes, overtimeMinutes: r.overtimeMinutes, status: r.status, shiftName: svc.shift(r.shiftId)?.name ?? null }));
  }),
  route('GET', '/me/leaves', ALL_ROLES, ({ db, svc, user: u }) => {
    const e = me(svc, u);
    return { data: db.leaves.filter((l) => l.employeeId === e.id).sort(byCreatedDesc).map((l) => leaveView(svc, l)), balances: svc.balances(e) };
  }),
  route('POST', '/me/leaves', ALL_ROLES, ({ svc, user, body }) => createLeaveFor(svc, user, me(svc, user), body)),
  route('POST', '/me/leaves/:id/cancel', ALL_ROLES, ({ db, svc, user: u, params }) => {
    const l = db.leaves.find((x) => x.id === params.id && x.companyId === u.companyId && x.employeeId === (u.employeeId ?? '__none__'));
    if (!l) throw notFound('Leave request', 'طلب الإجازة غير موجود');
    if (l.status !== 'PENDING') throw badRequest('Only pending requests can be cancelled', 'يمكن إلغاء الطلبات المعلقة فقط');
    Object.assign(l, { status: 'CANCELLED', decidedAt: nowIso() });
    svc.audit(u, 'CANCEL', 'LeaveRequest', l.id);
    return leaveView(svc, l);
  }),
  route('GET', '/me/payslips', ALL_ROLES, ({ db, svc, user: u }) => {
    const e = me(svc, u);
    return db.payslips.filter((p) => p.employeeId === e.id && releasedRun(svc, p.companyId, p.payrollRunId)).sort((a, b) => b.period.localeCompare(a.period)).map((s) => {
      const run = svc.run(s.companyId, s.payrollRunId)!;
      return { id: s.id, period: s.period, net: s.net, gross: s.gross, totalDeductions: s.totalDeductions, status: run.status, paidAt: run.paidAt };
    });
  }),
  route('GET', '/me/payslips/:id', ALL_ROLES, ({ db, svc, user: u, params }) => {
    const e = me(svc, u);
    const p = db.payslips.find((x) => x.id === params.id && x.employeeId === e.id && releasedRun(svc, x.companyId, x.payrollRunId));
    if (!p) throw notFound('Payslip', 'قسيمة الراتب غير موجودة');
    return payslipView(svc, p);
  }),
  route('GET', '/me/requests', ALL_ROLES, ({ db, svc, user: u }) => {
    me(svc, u);
    return db.requests.filter((r) => r.companyId === u.companyId && r.employeeId === (u.employeeId ?? '__none__')).sort(byCreatedDesc);
  }),
  route('POST', '/me/requests', ALL_ROLES, ({ db, svc, user: u, body }) => {
    const e = me(svc, u);
    const type = v.oneOf(body, 'type', REQUEST_TYPES)!; const title = v.str(body, 'title', { min: 2 })!;
    const amount = v.num(body, 'amount', { optional: true, min: 0 });
    const payload = body.payload && typeof body.payload === 'object' ? (body.payload as Record<string, unknown>) : null;
    if (type === 'LOAN' && !(amount && amount > 0)) throw badRequest('amount is required for LOAN', 'مبلغ السلفة مطلوب');
    if (type === 'ATTENDANCE_CORRECTION' && (!payload?.date || !payload?.checkIn)) throw badRequest('payload.date and payload.checkIn are required', 'التاريخ ووقت الحضور مطلوبان');
    const r = { id: nextId(db, 'req'), companyId: u.companyId, employeeId: e.id, type, title, details: (body.details as string) ?? null, amount: amount ?? null, payload, status: 'PENDING' as const, approverId: null, approverName: null, decidedAt: null, comment: null, createdAt: nowIso() };
    db.requests.push(r);
    svc.audit(u, 'CREATE', 'EmployeeRequest', r.id, pick(body, ['type', 'title', 'details', 'amount', 'payload']));
    svc.notifyApprovers(u.companyId, e.branchId, `طلب جديد: ${REQUEST_TYPE_AR[type]}`, `${fullName(e)} — ${title}`, '/requests');
    return r;
  }),
];
