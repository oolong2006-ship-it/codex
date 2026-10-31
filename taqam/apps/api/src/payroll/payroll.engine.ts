/**
 * Payroll engine — gathers inputs from the database and delegates every calculation to @taqam/core.
 * Kept framework-free (takes a PrismaClient) so the seed script runs the exact same logic.
 */
import { AdjustmentType, Prisma, PrismaClient } from '@prisma/client';
import { calculatePayslip, calendarDays, GosiRates, gosiRatesFor, PayslipResult, sickLeavePay, WageComponents } from '@taqam/core';
import { addDays, maxDate, minDate, periodRange } from '../common/dates';
import { num, r2 } from '../common/money';

export const ADJUSTMENT_LABEL_AR: Record<AdjustmentType, string> = {
  BONUS: 'مكافأة',
  COMMISSION: 'عمولة',
  ALLOWANCE: 'بدل إضافي',
  DEDUCTION: 'خصم',
  PENALTY: 'جزاء',
};
const ADDITION_TYPES: AdjustmentType[] = ['BONUS', 'COMMISSION', 'ALLOWANCE'];

const NO_GOSI: Partial<GosiRates> = { saudiEmployee: 0, saudiEmployer: 0, nonSaudiEmployee: 0, nonSaudiEmployer: 0 };

type Db = PrismaClient | Prisma.TransactionClient;

export interface PayslipInputsSnapshot {
  absentDays: number;
  overtimeMinutes: number;
  overtimeHours: number;
  unpaidLeaveDays: number;
  sickDays: number;
  sickAlreadyTaken: number;
  sickLeaveDeduction: number;
  loanRequested: number;
  adjustments: { id: string; type: AdjustmentType; amount: number }[];
}

export class PayrollStateError extends Error {}

export async function calculatePayrollRun(db: PrismaClient, companyId: string, runId: string) {
  const run = await db.payrollRun.findFirst({ where: { id: runId, companyId } });
  if (!run) throw new PayrollStateError('NOT_FOUND');
  if (run.status !== 'DRAFT' && run.status !== 'CALCULATED') throw new PayrollStateError('LOCKED');

  const { start, end } = periodRange(run.period);

  const employees = await db.employee.findMany({
    where: {
      companyId,
      hireDate: { lte: end },
      // active employees + anyone whose termination falls on/after the period start (covers historical runs)
      OR: [{ status: { not: 'TERMINATED' } }, { terminationDate: { gte: start } }],
    },
    orderBy: { employeeNumber: 'asc' },
  });
  const ids = employees.map((e) => e.id);
  const yearBack = addDays(start, -365);

  const [records, leaves, adjustments, loans] = await Promise.all([
    db.attendanceRecord.groupBy({
      by: ['employeeId', 'status'],
      where: { companyId, employeeId: { in: ids }, date: { gte: start, lte: end } },
      _count: { _all: true },
      _sum: { overtimeMinutes: true },
    }),
    db.leaveRequest.findMany({
      where: {
        companyId,
        employeeId: { in: ids },
        status: 'APPROVED',
        leaveType: { code: { in: ['UNPAID', 'SICK'] } },
        startDate: { lte: end },
        endDate: { gte: yearBack },
      },
      include: { leaveType: { select: { code: true } } },
    }),
    db.payrollAdjustment.findMany({ where: { companyId, period: run.period, employeeId: { in: ids } } }),
    db.loan.findMany({
      where: { companyId, employeeId: { in: ids }, status: 'ACTIVE', startPeriod: { lte: run.period }, remaining: { gt: 0 } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  // UNPAID wage deductions (30-day basis) and Art. 117 sick tiers count calendar days, clipped to the window.
  const daysIn = (s: Date, e: Date, from: Date, to: Date) => {
    const a = maxDate(s, from);
    const b = minDate(e, to);
    return b < a ? 0 : calendarDays(a, b);
  };

  const slips: Prisma.PayslipCreateManyInput[] = [];
  const totals = { gross: 0, deductions: 0, net: 0, gosiEmployer: 0, employerCost: 0 };

  for (const e of employees) {
    const wage: WageComponents = {
      basic: num(e.basicSalary),
      housing: num(e.housingAllowance),
      transport: num(e.transportAllowance),
      other: num(e.otherAllowances),
    };
    const rec = records.filter((r) => r.employeeId === e.id);
    const absentDays = rec.filter((r) => r.status === 'ABSENT').reduce((s, r) => s + r._count._all, 0);
    const overtimeMinutes = rec.reduce((s, r) => s + (r._sum.overtimeMinutes ?? 0), 0);
    const overtimeHours = r2(overtimeMinutes / 60);

    const myLeaves = leaves.filter((l) => l.employeeId === e.id);
    const unpaidLeaveDays = myLeaves
      .filter((l) => l.leaveType.code === 'UNPAID')
      .reduce((s, l) => s + daysIn(l.startDate, l.endDate, start, end), 0);
    const sick = myLeaves.filter((l) => l.leaveType.code === 'SICK');
    const sickDays = sick.reduce((s, l) => s + daysIn(l.startDate, l.endDate, start, end), 0);
    const sickAlreadyTaken = sick.reduce((s, l) => s + daysIn(l.startDate, l.endDate, yearBack, addDays(start, -1)), 0);
    const sickLeaveDeduction = sickDays > 0 ? sickLeavePay(wage, sickAlreadyTaken, sickDays).deduction : 0;

    const myAdj = adjustments.filter((a) => a.employeeId === e.id);
    const additions = myAdj
      .filter((a) => ADDITION_TYPES.includes(a.type))
      .map((a) => ({ type: a.type, labelAr: a.note ? `${ADJUSTMENT_LABEL_AR[a.type]} — ${a.note}` : ADJUSTMENT_LABEL_AR[a.type], amount: num(a.amount) }));
    const otherDeductions = myAdj
      .filter((a) => !ADDITION_TYPES.includes(a.type))
      .map((a) => ({ type: a.type, labelAr: a.note ? `${ADJUSTMENT_LABEL_AR[a.type]} — ${a.note}` : ADJUSTMENT_LABEL_AR[a.type], amount: num(a.amount) }));

    const myLoans = loans.filter((l) => l.employeeId === e.id);
    const loanParts = myLoans.map((l) => ({ loanId: l.id, amount: r2(Math.min(num(l.monthlyDeduction), num(l.remaining))) }));
    const loanRequested = r2(loanParts.reduce((s, p) => s + p.amount, 0));

    const result: PayslipResult = calculatePayslip({
      period: run.period,
      wage,
      isSaudi: e.isSaudi,
      hireDate: e.hireDate,
      terminationDate: e.terminationDate,
      overtimeHours,
      absentDays,
      unpaidLeaveDays,
      sickLeaveDeduction,
      additions,
      deductions: otherDeductions,
      loanDeduction: loanRequested,
      // New Social Insurance Law: the Saudi pension rate depends on the first-registration regime and the period.
      gosiRates: e.gosiRegistered ? gosiRatesFor({ isSaudi: e.isSaudi, firstRegisteredAt: e.gosiFirstRegisteredAt }, run.period) : NO_GOSI,
      hoursPerDay: e.hoursPerDay,
    });

    // Art. 92 cap may trim the loan line — allocate what was actually deducted across loans (oldest first).
    let loanApplied = result.deductions.find((d) => d.code === 'LOAN')?.amount ?? 0;
    const loanDeductions = loanParts
      .map((p) => {
        const amt = r2(Math.min(p.amount, loanApplied));
        loanApplied = r2(loanApplied - amt);
        return { loanId: p.loanId, amount: amt };
      })
      .filter((p) => p.amount > 0);

    const inputs: PayslipInputsSnapshot = {
      absentDays,
      overtimeMinutes,
      overtimeHours,
      unpaidLeaveDays,
      sickDays,
      sickAlreadyTaken,
      sickLeaveDeduction,
      loanRequested,
      adjustments: myAdj.map((a) => ({ id: a.id, type: a.type, amount: num(a.amount) })),
    };

    slips.push({
      companyId,
      payrollRunId: run.id,
      employeeId: e.id,
      period: run.period,
      payableDays: result.payableDays,
      earnings: result.earnings as unknown as Prisma.InputJsonValue,
      deductions: result.deductions as unknown as Prisma.InputJsonValue,
      gross: result.gross,
      totalDeductions: result.totalDeductions,
      net: result.net,
      gosiEmployee: result.gosi.employee,
      gosiEmployer: result.gosi.employer,
      employerCost: result.employerCost,
      loanDeductions: loanDeductions as unknown as Prisma.InputJsonValue,
      inputs: { ...inputs, wage } as unknown as Prisma.InputJsonValue,
      notes: result.notesAr,
    });
    totals.gross += result.gross;
    totals.deductions += result.totalDeductions;
    totals.net += result.net;
    totals.gosiEmployer += result.gosi.employer;
    totals.employerCost += result.employerCost;
  }

  return db.$transaction(async (tx) => {
    // Conditional write first: it takes the run's row lock, so a concurrent approve either waits for us
    // or has already moved the run out of DRAFT/CALCULATED (→ count 0 → nothing is written).
    const claimed = await tx.payrollRun.updateMany({
      where: { id: run.id, status: { in: ['DRAFT', 'CALCULATED'] } },
      data: {
        status: 'CALCULATED',
        calculatedAt: new Date(),
        // a WPS file exported before this calculation no longer matches the run
        wpsExportedAt: null,
        employeesCount: slips.length,
        totalGross: r2(totals.gross),
        totalDeductions: r2(totals.deductions),
        totalNet: r2(totals.net),
        totalGosiEmployer: r2(totals.gosiEmployer),
        totalEmployerCost: r2(totals.employerCost),
      },
    });
    if (claimed.count === 0) throw new PayrollStateError('ALREADY_PROCESSED');
    await tx.payslip.deleteMany({ where: { payrollRunId: run.id } });
    if (slips.length) await tx.payslip.createMany({ data: slips });
    return tx.payrollRun.findUniqueOrThrow({ where: { id: run.id } });
  });
}

/**
 * CALCULATED → APPROVED, deducting the applied loan installments.
 * The status flip is a conditional update inside the transaction, so of two concurrent approvals
 * exactly one deducts loans; the other gets ALREADY_PROCESSED (409).
 */
export async function approvePayrollRun(db: PrismaClient, companyId: string, runId: string, approver: { id: string; name: string }) {
  const run = await db.payrollRun.findFirst({ where: { id: runId, companyId } });
  if (!run) throw new PayrollStateError('NOT_FOUND');
  if (run.status === 'APPROVED' || run.status === 'PAID') throw new PayrollStateError('ALREADY_PROCESSED');
  if (run.status !== 'CALCULATED') throw new PayrollStateError('NOT_CALCULATED');
  return db.$transaction(async (tx: Db) => {
    const claimed = await tx.payrollRun.updateMany({
      where: { id: run.id, status: 'CALCULATED' },
      data: { status: 'APPROVED', approvedAt: new Date(), approvedById: approver.id, approvedByName: approver.name },
    });
    if (claimed.count === 0) throw new PayrollStateError('ALREADY_PROCESSED');
    const slips = await tx.payslip.findMany({ where: { payrollRunId: run.id }, select: { loanDeductions: true } });
    for (const s of slips) {
      for (const ld of ((s.loanDeductions ?? []) as { loanId: string; amount: number }[])) {
        const loan = await tx.loan.findUnique({ where: { id: ld.loanId } });
        if (!loan) continue;
        const remaining = r2(Math.max(0, num(loan.remaining) - ld.amount));
        await tx.loan.update({ where: { id: loan.id }, data: { remaining, status: remaining <= 0 ? 'PAID' : loan.status } });
      }
    }
    return tx.payrollRun.findUniqueOrThrow({ where: { id: run.id } });
  });
}
