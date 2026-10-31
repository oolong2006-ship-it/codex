/**
 * Business logic shared by the demo seed and handlers — ports of apps/api/src/shared/* and payroll.engine.ts.
 * Every calculation is delegated to @taqam/core exactly like the real backend.
 */
import {
  annualLeaveBalance, calculateAttendance, calculatePayslip, calendarDays, countLeaveDays, gosiRatesFor, serviceDuration, sickLeavePay,
  type AttendanceCalc, type GosiRates, type PayslipResult, type WageComponents,
} from '@taqam/core';
import { payslipHref } from '@/lib/paths';
import { payslipId } from './ids';
import { addDays, day, maxDay, minDay, periodRange, r2, riyadhDateTime, todayStr, weekday } from './dates';
import { nextId, type DB, type Employee, type LeaveType, type PayrollAdjustment, type Role, type Shift } from './db';
import { badRequest, forbidden, notFound } from './errors';

/** Request user. Platform SUPER_ADMINs carry companyId '' (they only reach /auth/* and /admin/*). */
export interface AuthUser {
  id: string; email: string; name: string; role: Role; companyId: string; employeeId: string | null; branchId: string | null;
  /** Set when a platform admin is browsing as this company's owner. */
  impersonatedBy?: string | null;
}

export const ADMIN: Role[] = ['OWNER', 'HR_ADMIN'];
export const STAFF: Role[] = ['OWNER', 'HR_ADMIN', 'PAYROLL', 'BRANCH_MANAGER'];
export const ALL_ROLES: Role[] = ['OWNER', 'HR_ADMIN', 'PAYROLL', 'BRANCH_MANAGER', 'EMPLOYEE'];

export const fullName = (e: { firstNameAr: string; lastNameAr: string }) => `${e.firstNameAr} ${e.lastNameAr}`;
export const nowIso = () => new Date().toISOString();
export const byNumber = (a: Employee, b: Employee) => a.employeeNumber.localeCompare(b.employeeNumber);

export class Services {
  /** Set by handlers/lifecycle code that changed state during a GET (lazy expiry, lastActivityAt) so it gets persisted. */
  dirty = false;
  constructor(public db: DB) {}

  // ---------- lookups ----------
  company(id: string) { return this.db.companies.find((c) => c.id === id)!; }
  emp(id: string | null | undefined) { return id ? this.db.employees.find((e) => e.id === id) ?? null : null; }
  branch(id: string | null | undefined) { return id ? this.db.branches.find((b) => b.id === id) ?? null : null; }
  dept(id: string | null | undefined) { return id ? this.db.departments.find((d) => d.id === id) ?? null : null; }
  shift(id: string | null | undefined) { return id ? this.db.shifts.find((s) => s.id === id) ?? null : null; }
  leaveType(id: string) { return this.db.leaveTypes.find((t) => t.id === id) ?? null; }
  run(companyId: string, id: string) { return this.db.runs.find((r) => r.id === id && r.companyId === companyId) ?? null; }
  runStatus(companyId: string, runId: string) { return this.run(companyId, runId)?.status ?? 'DRAFT'; }

  // ---------- scope (ScopeService) ----------
  /** Predicate for employees visible to this user (tenant + branch-manager + self scoping). */
  employeeWhere(u: AuthUser): (e: Employee) => boolean {
    return (e) => {
      if (e.companyId !== u.companyId) return false;
      if (u.role === 'BRANCH_MANAGER' && e.branchId !== (u.branchId ?? '__none__')) return false;
      if (u.role === 'EMPLOYEE' && e.id !== (u.employeeId ?? '__none__')) return false;
      return true;
    };
  }
  branchFilter(u: AuthUser, requested?: string | null): string | undefined {
    if (u.role === 'BRANCH_MANAGER') return u.branchId ?? '__none__';
    return requested || undefined;
  }
  scopedEmployee(u: AuthUser, id: string): Employee {
    const e = this.db.employees.find((x) => x.id === id);
    if (!e || !this.employeeWhere(u)(e)) throw notFound('Employee', 'الموظف غير موجود');
    return e;
  }
  assertBranch(u: AuthUser, branchId: string | null | undefined) {
    if (u.role === 'BRANCH_MANAGER' && branchId !== u.branchId) throw forbidden('Branch managers can only manage their own branch', 'مدير الفرع يدير فرعه فقط');
  }
  scopedBranch(u: AuthUser, id: string) {
    const b = this.db.branches.find((x) => x.id === id && x.companyId === u.companyId);
    if (!b) throw notFound('Branch', 'الفرع غير موجود');
    return b;
  }

  // ---------- audit & notifications ----------
  audit(u: { id: string | null; name: string | null; companyId: string }, action: string, entity: string, entityId?: string | null, data?: unknown, createdAt = nowIso()) {
    this.db.audit.push({
      id: nextId(this.db, 'log'), companyId: u.companyId, userId: u.id, userName: u.name, action, entity, entityId: entityId ?? null,
      data: data === undefined ? null : JSON.parse(JSON.stringify(data)), createdAt,
    });
  }
  notifyUsers(companyId: string, userIds: string[], title: string, body?: string | null, link?: string | null, extra: { readAt?: string | null; createdAt?: string } = {}) {
    for (const userId of userIds) {
      this.db.notifications.push({ id: nextId(this.db, 'ntf'), companyId, userId, title, body: body ?? null, link: link ?? null, readAt: extra.readAt ?? null, createdAt: extra.createdAt ?? nowIso() });
    }
  }
  notifyEmployees(companyId: string, employeeIds: string[], title: string, body?: string, link?: string) {
    const ids = this.db.users.filter((u) => u.companyId === companyId && u.isActive && u.employeeId && employeeIds.includes(u.employeeId)).map((u) => u.id);
    this.notifyUsers(companyId, ids, title, body, link);
  }
  notifyApprovers(companyId: string, branchId: string | null, title: string, body?: string, link?: string) {
    const ids = this.db.users
      .filter((u) => u.companyId === companyId && u.isActive && (u.role === 'OWNER' || u.role === 'HR_ADMIN' || (!!branchId && u.role === 'BRANCH_MANAGER' && this.emp(u.employeeId)?.branchId === branchId)))
      .map((u) => u.id);
    this.notifyUsers(companyId, ids, title, body, link);
  }

  // ---------- leave calc (LeaveCalcService) ----------
  leaveOpts(companyId: string) {
    const c = this.company(companyId);
    return { weekendDays: c.weekendDays?.length ? c.weekendDays : [5, 6], holidays: this.db.holidays.filter((h) => h.companyId === companyId).map((h) => h.date) };
  }
  serviceYearStart(hireDate: string, asOf: string = todayStr()): string {
    const years = serviceDuration(hireDate, asOf).years;
    const d = day(hireDate);
    d.setUTCFullYear(d.getUTCFullYear() + Math.max(0, years));
    return d.toISOString().slice(0, 10);
  }
  private typeCode(id: string) { return this.leaveType(id)?.code; }
  annualBalance(emp: Employee, asOf: string = todayStr()) {
    const yearStart = this.serviceYearStart(emp.hireDate, asOf);
    const taken = this.db.leaves
      .filter((l) => l.employeeId === emp.id && l.status === 'APPROVED' && this.typeCode(l.leaveTypeId) === 'ANNUAL' && l.startDate >= yearStart)
      .reduce((s, l) => s + l.days, 0);
    return annualLeaveBalance({ hireDate: emp.hireDate, asOf, takenDays: taken, carriedOver: emp.annualLeaveCarryOver });
  }
  balances(emp: Employee) {
    const types = this.db.leaveTypes.filter((t) => t.companyId === emp.companyId);
    const yearStart = `${todayStr().slice(0, 4)}-01-01`;
    const takenMap = new Map<string, number>();
    for (const l of this.db.leaves) {
      if (l.employeeId === emp.id && l.status === 'APPROVED' && l.startDate >= yearStart) takenMap.set(l.leaveTypeId, (takenMap.get(l.leaveTypeId) ?? 0) + l.days);
    }
    const annual = this.annualBalance(emp);
    return types.map((t) => {
      if (t.code === 'ANNUAL') {
        return { leaveTypeId: t.id, code: t.code, nameAr: t.nameAr, nameEn: t.nameEn, entitlement: annual.entitlementPerYear, accrued: annual.accrued, taken: annual.taken, balance: annual.balance };
      }
      const tk = takenMap.get(t.id) ?? 0;
      return { leaveTypeId: t.id, code: t.code, nameAr: t.nameAr, nameEn: t.nameEn, entitlement: t.maxDaysPerYear, taken: tk, balance: t.maxDaysPerYear === null ? null : Math.max(0, t.maxDaysPerYear - tk) };
    });
  }
  /** Validates a leave request and returns its working days (400 + messageAr on failure). */
  validateLeave(emp: Employee, type: LeaveType, startDate: string, endDate: string, excludeId?: string): number {
    const start = startDate.slice(0, 10);
    const end = endDate.slice(0, 10);
    if (end < start) throw badRequest('endDate must be on or after startDate', 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
    const days = countLeaveDays(start, end, this.leaveOpts(emp.companyId));
    if (days <= 0) throw badRequest('Leave contains no working days', 'الفترة المختارة لا تحتوي على أيام عمل');
    const others = this.db.leaves.filter((l) => l.employeeId === emp.id && l.id !== excludeId);
    if (others.some((l) => (l.status === 'PENDING' || l.status === 'APPROVED') && l.startDate <= end && l.endDate >= start)) {
      throw badRequest('Overlapping leave request exists', 'يوجد طلب إجازة متداخل مع هذه الفترة');
    }
    if (type.code === 'ANNUAL') {
      const bal = this.annualBalance(emp);
      const pending = others.filter((l) => l.leaveTypeId === type.id && l.status === 'PENDING').reduce((s, l) => s + l.days, 0);
      const available = Math.floor((bal.balance - pending) * 100) / 100;
      if (days > available) {
        throw badRequest(`Insufficient annual leave balance (available ${available}, requested ${days})`, `رصيد الإجازة السنوية غير كافٍ (المتاح ${available} يوم، المطلوب ${days} يوم)`, { available, requested: days });
      }
    } else if (type.maxDaysPerYear !== null && type.code !== 'SICK') {
      const yearStart = `${start.slice(0, 4)}-01-01`;
      const used = others.filter((l) => l.leaveTypeId === type.id && (l.status === 'PENDING' || l.status === 'APPROVED') && l.startDate >= yearStart).reduce((s, l) => s + l.days, 0);
      if (used + days > type.maxDaysPerYear) {
        const available = Math.max(0, type.maxDaysPerYear - used);
        throw badRequest(`Exceeds yearly maximum for ${type.code} (available ${available})`, `تتجاوز الحد السنوي لـ${type.nameAr} (المتاح ${available} يوم)`, { available, requested: days });
      }
    }
    return days;
  }

  // ---------- attendance calc (AttendanceCalcService) ----------
  rosterBranches(date: string): Set<string | null> {
    const set = new Set<string | null>();
    for (const a of this.db.assignments) if (a.date === date) set.add(this.emp(a.employeeId)?.branchId ?? null);
    return set;
  }
  branchShiftFor(branchId: string, date: string): Shift | null {
    const wd = weekday(date);
    return this.db.shifts.filter((s) => s.branchId === branchId && s.days.includes(wd)).sort((a, b) => a.startTime.localeCompare(b.startTime))[0] ?? null;
  }
  shiftFor(emp: { id: string; branchId: string | null }, date: string): Shift | null {
    const a = this.db.assignments.find((x) => x.employeeId === emp.id && x.date === date);
    if (a) return this.shift(a.shiftId);
    if (!emp.branchId) return null;
    if (this.rosterBranches(date).has(emp.branchId)) return null;
    return this.branchShiftFor(emp.branchId, date);
  }
  compute(shift: Shift | null, checkIn: Date | null, checkOut: Date | null): AttendanceCalc {
    if (shift) {
      return calculateAttendance({ startTime: shift.startTime, endTime: shift.endTime, breakMinutes: shift.breakMinutes, graceMinutes: shift.graceMinutes }, checkIn, checkOut, 180);
    }
    if (!checkIn) return { workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0, status: 'ABSENT' };
    if (!checkOut || checkOut <= checkIn) return { workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0, status: 'INCOMPLETE' };
    return { workedMinutes: Math.round((checkOut.getTime() - checkIn.getTime()) / 60000), lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0, status: 'PRESENT' };
  }
  /** Daily board for visible employees. */
  board(where: (e: Employee) => boolean, date: string) {
    const today = todayStr();
    const now = new Date();
    const wd = weekday(date);
    const employees = this.db.employees
      .filter((e) => where(e) && e.hireDate <= date && (e.status !== 'TERMINATED' || (!!e.terminationDate && e.terminationDate >= date)))
      .sort((a, b) => (a.branchId ?? '~').localeCompare(b.branchId ?? '~') || byNumber(a, b));
    const ids = new Set(employees.map((e) => e.id));
    const recMap = new Map(this.db.attendance.filter((r) => r.date === date && ids.has(r.employeeId)).map((r) => [r.employeeId, r]));
    const asgMap = new Map(this.db.assignments.filter((a) => a.date === date && ids.has(a.employeeId)).map((a) => [a.employeeId, this.shift(a.shiftId)]));
    const onLeave = new Set(this.db.leaves.filter((l) => ids.has(l.employeeId) && l.status === 'APPROVED' && l.startDate <= date && l.endDate >= date).map((l) => l.employeeId));
    const rosterBranches = this.rosterBranches(date);
    return employees.map((e) => {
      const rec = recMap.get(e.id);
      let shift: Shift | null = asgMap.get(e.id) ?? (rec ? this.shift(rec.shiftId) : null) ?? null;
      if (!shift && !rosterBranches.has(e.branchId)) {
        shift = this.db.shifts.filter((s) => s.branchId === e.branchId && s.days.includes(wd)).sort((a, b) => a.startTime.localeCompare(b.startTime))[0] ?? null;
      }
      let status: string;
      if (rec) {
        status = rec.status;
        if (rec.checkIn && !rec.checkOut && date === today) status = rec.lateMinutes > 0 ? 'LATE' : 'PRESENT';
      } else if (onLeave.has(e.id)) status = 'ON_LEAVE';
      else if (!shift) status = 'OFF';
      else if (date < today) status = 'ABSENT';
      else if (date === today && now.getTime() > riyadhDateTime(date, shift.startTime).getTime() + shift.graceMinutes * 60000) status = 'ABSENT';
      else status = 'OFF';
      return {
        employeeId: e.id, employeeName: fullName(e), branchId: e.branchId, branchName: this.branch(e.branchId)?.nameAr ?? null,
        shiftId: shift?.id ?? null, shiftName: shift?.name ?? null, checkIn: rec?.checkIn ?? null, checkOut: rec?.checkOut ?? null,
        workedMinutes: rec?.workedMinutes ?? 0, lateMinutes: rec?.lateMinutes ?? 0, overtimeMinutes: rec?.overtimeMinutes ?? 0,
        status, recordId: rec?.id ?? null,
      };
    });
  }

  // ---------- payroll engine ----------
  calculateRun(companyId: string, runId: string) {
    const run = this.run(companyId, runId);
    if (!run) throw new PayrollStateError('NOT_FOUND');
    if (run.status !== 'DRAFT' && run.status !== 'CALCULATED') throw new PayrollStateError('LOCKED');
    const { start, end } = periodRange(run.period);
    const employees = this.db.employees
      .filter((e) => e.companyId === companyId && e.hireDate <= end && (e.status !== 'TERMINATED' || (!!e.terminationDate && e.terminationDate >= start)))
      .sort(byNumber);
    const ids = new Set(employees.map((e) => e.id));
    const yearBack = addDays(start, -365);
    const records = this.db.attendance.filter((r) => r.companyId === companyId && ids.has(r.employeeId) && r.date >= start && r.date <= end);
    const leaves = this.db.leaves.filter((l) => {
      if (l.companyId !== companyId || !ids.has(l.employeeId) || l.status !== 'APPROVED') return false;
      const code = this.typeCode(l.leaveTypeId);
      return (code === 'UNPAID' || code === 'SICK') && l.startDate <= end && l.endDate >= yearBack;
    });
    const adjustments = this.db.adjustments.filter((a) => a.companyId === companyId && a.period === run.period && ids.has(a.employeeId));
    const loans = this.db.loans
      .filter((l) => l.companyId === companyId && ids.has(l.employeeId) && l.status === 'ACTIVE' && l.startPeriod <= run.period && l.remaining > 0)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const daysIn = (s: string, e: string, from: string, to: string) => {
      const a = maxDay(s, from);
      const b = minDay(e, to);
      // UNPAID wage deductions (30-day basis) and Art. 117 sick tiers count calendar days, like the API engine.
      return b < a ? 0 : calendarDays(a, b);
    };
    const totals = { gross: 0, deductions: 0, net: 0, gosiEmployer: 0, employerCost: 0 };
    const slips = employees.map((e) => {
      const wage: WageComponents = { basic: e.basicSalary, housing: e.housingAllowance, transport: e.transportAllowance, other: e.otherAllowances };
      const rec = records.filter((r) => r.employeeId === e.id);
      const absentDays = rec.filter((r) => r.status === 'ABSENT').length;
      const overtimeMinutes = rec.reduce((s, r) => s + (r.overtimeMinutes ?? 0), 0);
      const overtimeHours = r2(overtimeMinutes / 60);
      const myLeaves = leaves.filter((l) => l.employeeId === e.id);
      const unpaidLeaveDays = myLeaves.filter((l) => this.typeCode(l.leaveTypeId) === 'UNPAID').reduce((s, l) => s + daysIn(l.startDate, l.endDate, start, end), 0);
      const sick = myLeaves.filter((l) => this.typeCode(l.leaveTypeId) === 'SICK');
      const sickDays = sick.reduce((s, l) => s + daysIn(l.startDate, l.endDate, start, end), 0);
      const sickAlreadyTaken = sick.reduce((s, l) => s + daysIn(l.startDate, l.endDate, yearBack, addDays(start, -1)), 0);
      const sickLeaveDeduction = sickDays > 0 ? sickLeavePay(wage, sickAlreadyTaken, sickDays).deduction : 0;
      const myAdj = adjustments.filter((a) => a.employeeId === e.id);
      const line = (a: PayrollAdjustment) => ({ type: a.type, labelAr: a.note ? `${ADJUSTMENT_LABEL_AR[a.type]} — ${a.note}` : ADJUSTMENT_LABEL_AR[a.type], amount: a.amount });
      const additions = myAdj.filter((a) => ADDITION_TYPES.includes(a.type)).map(line);
      const otherDeductions = myAdj.filter((a) => !ADDITION_TYPES.includes(a.type)).map(line);
      const loanParts = loans.filter((l) => l.employeeId === e.id).map((l) => ({ loanId: l.id, amount: r2(Math.min(l.monthlyDeduction, l.remaining)) }));
      const loanRequested = r2(loanParts.reduce((s, p) => s + p.amount, 0));
      const result: PayslipResult = calculatePayslip({
        period: run.period, wage, isSaudi: e.isSaudi, hireDate: e.hireDate, terminationDate: e.terminationDate, overtimeHours, absentDays,
        unpaidLeaveDays, sickLeaveDeduction, additions, deductions: otherDeductions, loanDeduction: loanRequested,
        // New Social Insurance Law: the Saudi pension rate depends on the first-registration regime and the period.
        gosiRates: e.gosiRegistered ? gosiRatesFor({ isSaudi: e.isSaudi, firstRegisteredAt: e.gosiFirstRegisteredAt }, run.period) : NO_GOSI, hoursPerDay: e.hoursPerDay,
      });
      let loanApplied = result.deductions.find((d) => d.code === 'LOAN')?.amount ?? 0;
      const loanDeductions = loanParts
        .map((p) => { const amt = r2(Math.min(p.amount, loanApplied)); loanApplied = r2(loanApplied - amt); return { loanId: p.loanId, amount: amt }; })
        .filter((p) => p.amount > 0);
      totals.gross += result.gross; totals.deductions += result.totalDeductions; totals.net += result.net;
      totals.gosiEmployer += result.gosi.employer; totals.employerCost += result.employerCost;
      return {
        id: payslipId(run.period, e.id), companyId, payrollRunId: run.id, employeeId: e.id, period: run.period, payableDays: result.payableDays,
        earnings: result.earnings, deductions: result.deductions, gross: result.gross, totalDeductions: result.totalDeductions, net: result.net,
        gosiEmployee: result.gosi.employee, gosiEmployer: result.gosi.employer, employerCost: result.employerCost, loanDeductions,
        inputs: { absentDays, overtimeMinutes, overtimeHours, unpaidLeaveDays, sickDays, sickAlreadyTaken, sickLeaveDeduction, loanRequested, wage },
        notes: result.notesAr, createdAt: nowIso(),
      };
    });
    this.db.payslips = this.db.payslips.filter((p) => !(p.companyId === companyId && p.payrollRunId === run.id)).concat(slips);
    Object.assign(run, {
      status: 'CALCULATED', calculatedAt: nowIso(), updatedAt: nowIso(), wpsExportedAt: null, employeesCount: slips.length, totalGross: r2(totals.gross),
      totalDeductions: r2(totals.deductions), totalNet: r2(totals.net), totalGosiEmployer: r2(totals.gosiEmployer), totalEmployerCost: r2(totals.employerCost),
    });
    return run;
  }

  approveRun(companyId: string, runId: string, approver: { id: string; name: string }) {
    const run = this.run(companyId, runId);
    if (!run) throw new PayrollStateError('NOT_FOUND');
    if (run.status === 'APPROVED' || run.status === 'PAID') throw new PayrollStateError('ALREADY_APPROVED');
    if (run.status !== 'CALCULATED') throw new PayrollStateError('NOT_CALCULATED');
    for (const s of this.db.payslips.filter((p) => p.companyId === companyId && p.payrollRunId === run.id)) {
      for (const ld of s.loanDeductions ?? []) {
        const loan = this.db.loans.find((l) => l.id === ld.loanId);
        if (!loan) continue;
        loan.remaining = r2(Math.max(0, loan.remaining - ld.amount));
        if (loan.remaining <= 0) loan.status = 'PAID';
        loan.updatedAt = nowIso();
      }
    }
    Object.assign(run, { status: 'APPROVED', approvedAt: nowIso(), approvedById: approver.id, approvedByName: approver.name, updatedAt: nowIso() });
    return run;
  }

  /** Link used in "salary paid" notifications. */
  payslipLink(id: string) { return payslipHref(id); }
}

export class PayrollStateError extends Error {}

export const ADJUSTMENT_LABEL_AR: Record<PayrollAdjustment['type'], string> = { BONUS: 'مكافأة', COMMISSION: 'عمولة', ALLOWANCE: 'بدل إضافي', DEDUCTION: 'خصم', PENALTY: 'جزاء' };
const ADDITION_TYPES: PayrollAdjustment['type'][] = ['BONUS', 'COMMISSION', 'ALLOWANCE'];
const NO_GOSI: Partial<GosiRates> = { saudiEmployee: 0, saudiEmployer: 0, nonSaudiEmployee: 0, nonSaudiEmployer: 0 };
