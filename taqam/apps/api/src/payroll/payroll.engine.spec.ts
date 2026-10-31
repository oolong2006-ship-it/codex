import { Prisma } from '@prisma/client';
import { calculatePayslip, sickLeavePay } from '@taqam/core';
import { approvePayrollRun, calculatePayrollRun, PayrollStateError } from './payroll.engine';

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const dec = (n: number) => new Prisma.Decimal(n);

function fakeDb(overrides: Record<string, unknown> = {}, opts: { conditionalCount?: number } = {}) {
  const created: Prisma.PayslipCreateManyInput[] = [];
  const tx = {
    payslip: {
      deleteMany: jest.fn(),
      createMany: jest.fn(async ({ data }) => created.push(...data)),
      findMany: jest.fn(async () => [{ loanDeductions: [{ loanId: 'loan1', amount: 600 }] }]),
    },
    payrollRun: {
      updateMany: jest.fn(async (_args: { where: unknown; data: Record<string, unknown> }) => ({ count: opts.conditionalCount ?? 1 })),
      findUniqueOrThrow: jest.fn(async () => ({ id: 'run1', period: '2026-09' })),
    },
    loan: { findUnique: jest.fn(async () => ({ id: 'loan1', remaining: dec(600), status: 'ACTIVE' })), update: jest.fn() },
  };
  const db = {
    payrollRun: { findFirst: jest.fn(async () => ({ id: 'run1', companyId: 'c1', period: '2026-09', status: 'DRAFT' })) },
    company: { findUniqueOrThrow: jest.fn(async () => ({ id: 'c1', weekendDays: [5, 6] })) },
    publicHoliday: { findMany: jest.fn(async () => [{ date: D('2026-09-23') }]) },
    employee: {
      findMany: jest.fn(async () => [
        {
          id: 'e1',
          isSaudi: true,
          hireDate: D('2020-01-01'),
          terminationDate: null,
          basicSalary: dec(6000),
          housingAllowance: dec(1500),
          transportAllowance: dec(600),
          otherAllowances: dec(0),
          gosiRegistered: true,
          hoursPerDay: 8,
        },
      ]),
    },
    attendanceRecord: {
      groupBy: jest.fn(async () => [
        { employeeId: 'e1', status: 'ABSENT', _count: { _all: 2 }, _sum: { overtimeMinutes: 0 } },
        { employeeId: 'e1', status: 'PRESENT', _count: { _all: 18 }, _sum: { overtimeMinutes: 120 } },
      ]),
    },
    leaveRequest: {
      findMany: jest.fn(async () => [
        // Sun 13 – Mon 14 Sep 2026 → 2 working days
        { employeeId: 'e1', startDate: D('2026-09-13'), endDate: D('2026-09-14'), leaveType: { code: 'UNPAID' } },
      ]),
    },
    payrollAdjustment: {
      findMany: jest.fn(async () => [
        { id: 'a1', employeeId: 'e1', type: 'BONUS', amount: dec(500), note: null },
        { id: 'a2', employeeId: 'e1', type: 'PENALTY', amount: dec(100), note: 'late' },
      ]),
    },
    loan: { findMany: jest.fn(async () => [{ id: 'loan1', employeeId: 'e1', monthlyDeduction: dec(1000), remaining: dec(600) }]) },
    payslip: { findMany: jest.fn(async () => [{ loanDeductions: [{ loanId: 'loan1', amount: 600 }] }]) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    ...overrides,
  };
  return { db, tx, created };
}

describe('payroll engine', () => {
  it('gathers attendance, leave, adjustments and loans and delegates to core.calculatePayslip', async () => {
    const { db, created, tx } = fakeDb();
    await calculatePayrollRun(db as never, 'c1', 'run1');
    expect(created).toHaveLength(1);
    const slip = created[0];
    const expected = calculatePayslip({
      period: '2026-09',
      wage: { basic: 6000, housing: 1500, transport: 600, other: 0 },
      isSaudi: true,
      hireDate: D('2020-01-01'),
      terminationDate: null,
      overtimeHours: 2,
      absentDays: 2,
      unpaidLeaveDays: 2,
      sickLeaveDeduction: 0,
      additions: [{ type: 'BONUS', labelAr: 'مكافأة', amount: 500 }],
      deductions: [{ type: 'PENALTY', labelAr: 'جزاء — late', amount: 100 }],
      loanDeduction: 600,
      hoursPerDay: 8,
    });
    expect(slip.net).toBe(expected.net);
    expect(slip.gross).toBe(expected.gross);
    expect(slip.earnings).toEqual(expected.earnings);
    expect(slip.deductions).toEqual(expected.deductions);
    expect(slip.loanDeductions).toEqual([{ loanId: 'loan1', amount: 600 }]);
    expect((slip.inputs as Record<string, unknown>).unpaidLeaveDays).toBe(2);
    const data = tx.payrollRun.updateMany.mock.calls[0][0].data;
    expect(data.status).toBe('CALCULATED');
    expect(data.employeesCount).toBe(1);
    expect(data.totalNet).toBe(expected.net);
    expect(data.totalEmployerCost).toBe(expected.employerCost);
  });

  it('a (re)calculation clears wpsExportedAt — a file exported before it no longer matches the run (WPS checker)', async () => {
    const { db, tx } = fakeDb();
    await calculatePayrollRun(db as never, 'c1', 'run1');
    expect(tx.payrollRun.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'CALCULATED', wpsExportedAt: null });
  });

  describe('GOSI two regimes (new Social Insurance Law)', () => {
    const july2026 = (emp: Record<string, unknown>) =>
      fakeDb({
        payrollRun: { findFirst: jest.fn(async () => ({ id: 'run1', companyId: 'c1', period: '2026-07', status: 'DRAFT' })) },
        attendanceRecord: { groupBy: jest.fn(async () => []) },
        leaveRequest: { findMany: jest.fn(async () => []) },
        payrollAdjustment: { findMany: jest.fn(async () => []) },
        loan: { findMany: jest.fn(async () => []) },
        employee: {
          findMany: jest.fn(async () => [
            {
              id: 'e1',
              isSaudi: true,
              hireDate: D('2020-01-01'),
              terminationDate: null,
              basicSalary: dec(10000),
              housingAllowance: dec(2500),
              transportAllowance: dec(0),
              otherAllowances: dec(0),
              gosiRegistered: true,
              gosiFirstRegisteredAt: null,
              hoursPerDay: 8,
              ...emp,
            },
          ]),
        },
      });

    it('a NEW-regime Saudi (first registered 2025-01-10) pays 10.75% in 2026-07; employer 12.75%', async () => {
      const { db, created } = july2026({ gosiFirstRegisteredAt: D('2025-01-10') });
      await calculatePayrollRun(db as never, 'c1', 'run1');
      expect(created[0].gosiEmployee).toBe(1343.75); // 12,500 × 10.75%
      expect(created[0].gosiEmployer).toBe(1593.75); // 12,500 × 12.75%
    });

    it('a LEGACY Saudi (no first-registration date) still pays 9.75% / 11.75%', async () => {
      const { db, created } = july2026({ gosiFirstRegisteredAt: null });
      await calculatePayrollRun(db as never, 'c1', 'run1');
      expect(created[0].gosiEmployee).toBe(1218.75); // 12,500 × 9.75%
      expect(created[0].gosiEmployer).toBe(1468.75);
    });

    it('an employee not registered in GOSI pays nothing regardless of regime', async () => {
      const { db, created } = july2026({ gosiRegistered: false, gosiFirstRegisteredAt: D('2025-01-10') });
      await calculatePayrollRun(db as never, 'c1', 'run1');
      expect(created[0].gosiEmployee).toBe(0);
      expect(created[0].gosiEmployer).toBe(0);
    });
  });

  it('refuses to recalculate an approved run', async () => {
    const { db } = fakeDb({
      payrollRun: { findFirst: jest.fn(async () => ({ id: 'run1', period: '2026-09', status: 'APPROVED' })) },
    });
    await expect(calculatePayrollRun(db as never, 'c1', 'run1')).rejects.toBeInstanceOf(PayrollStateError);
  });

  it('approval deducts applied loan installments and closes paid loans', async () => {
    const { db, tx } = fakeDb({
      payrollRun: { findFirst: jest.fn(async () => ({ id: 'run1', period: '2026-09', status: 'CALCULATED' })) },
    });
    await approvePayrollRun(db as never, 'c1', 'run1', { id: 'u1', name: 'ماجد' });
    expect(tx.loan.update).toHaveBeenCalledWith({ where: { id: 'loan1' }, data: { remaining: 0, status: 'PAID' } });
    expect(tx.payrollRun.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'run1', status: 'CALCULATED' }, data: { status: 'APPROVED' } });
  });

  it('UNPAID leave is deducted on calendar days: a whole-November unpaid leave deducts 30/30 of the wage (review #3)', async () => {
    const { db, created } = fakeDb({
      payrollRun: { findFirst: jest.fn(async () => ({ id: 'run1', companyId: 'c1', period: '2026-11', status: 'DRAFT' })) },
      publicHoliday: { findMany: jest.fn(async () => []) },
      attendanceRecord: { groupBy: jest.fn(async () => []) },
      payrollAdjustment: { findMany: jest.fn(async () => []) },
      loan: { findMany: jest.fn(async () => []) },
      leaveRequest: {
        findMany: jest.fn(async () => [
          { employeeId: 'e1', startDate: D('2026-11-01'), endDate: D('2026-11-30'), leaveType: { code: 'UNPAID' } },
        ]),
      },
    });
    await calculatePayrollRun(db as never, 'c1', 'run1');
    const slip = created[0];
    expect((slip.inputs as Record<string, unknown>).unpaidLeaveDays).toBe(30);
    const lines = slip.deductions as { code: string; labelAr: string; amount: number }[];
    const unpaid = lines.find((d) => d.code === 'UNPAID_LEAVE')!;
    expect(unpaid.labelAr).toContain('(30 يوم)');
    // 30/30 of the 8100 wage is lost; core trims the line only by the GOSI share so net never goes negative
    const gosi = lines.find((d) => d.code === 'GOSI')?.amount ?? 0;
    expect(unpaid.amount + gosi).toBeCloseTo(8100, 2);
    expect(slip.net).toBe(0);
  });

  it('SICK leave tiers (Art. 117) use calendar days, including the rolling-year history (review #3)', async () => {
    const { db, created } = fakeDb({
      payrollRun: { findFirst: jest.fn(async () => ({ id: 'run1', companyId: 'c1', period: '2026-11', status: 'DRAFT' })) },
      publicHoliday: { findMany: jest.fn(async () => []) },
      attendanceRecord: { groupBy: jest.fn(async () => []) },
      payrollAdjustment: { findMany: jest.fn(async () => []) },
      loan: { findMany: jest.fn(async () => []) },
      leaveRequest: {
        findMany: jest.fn(async () => [
          // 28 calendar days earlier in the rolling year (only 20 working days)
          { employeeId: 'e1', startDate: D('2026-08-01'), endDate: D('2026-08-28'), leaveType: { code: 'SICK' } },
          // Sun 8 – Sat 14 Nov 2026: 7 calendar days (5 working days)
          { employeeId: 'e1', startDate: D('2026-11-08'), endDate: D('2026-11-14'), leaveType: { code: 'SICK' } },
        ]),
      },
    });
    await calculatePayrollRun(db as never, 'c1', 'run1');
    const inputs = created[0].inputs as Record<string, number>;
    expect(inputs.sickDays).toBe(7);
    expect(inputs.sickAlreadyTaken).toBe(28);
    const wage = { basic: 6000, housing: 1500, transport: 600, other: 0 };
    expect(inputs.sickLeaveDeduction).toBe(sickLeavePay(wage, 28, 7).deduction);
    expect(inputs.sickLeaveDeduction).toBeGreaterThan(0);
  });

  it('approval is atomic: a concurrent approve that loses the CALCULATED→APPROVED race deducts nothing (review #1)', async () => {
    const { db, tx } = fakeDb(
      { payrollRun: { findFirst: jest.fn(async () => ({ id: 'run1', period: '2026-09', status: 'CALCULATED' })) } },
      { conditionalCount: 0 },
    );
    const err = await approvePayrollRun(db as never, 'c1', 'run1', { id: 'u1', name: 'ماجد' }).catch((e) => e);
    expect(err).toBeInstanceOf(PayrollStateError);
    expect(err.message).toBe('ALREADY_PROCESSED');
    expect(tx.payrollRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'run1', status: 'CALCULATED' } }),
    );
    expect(tx.loan.update).not.toHaveBeenCalled();
  });

  it('calculation only writes payslips while the run is still DRAFT or CALCULATED (review #1)', async () => {
    const { db, tx } = fakeDb({}, { conditionalCount: 0 });
    const err = await calculatePayrollRun(db as never, 'c1', 'run1').catch((e) => e);
    expect(err).toBeInstanceOf(PayrollStateError);
    expect(err.message).toBe('ALREADY_PROCESSED');
    expect(tx.payrollRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'run1', status: { in: ['DRAFT', 'CALCULATED'] } } }),
    );
    expect(tx.payslip.createMany).not.toHaveBeenCalled();
  });
});
