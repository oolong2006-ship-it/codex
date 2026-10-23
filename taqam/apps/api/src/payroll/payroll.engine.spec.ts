import { Prisma } from '@prisma/client';
import { calculatePayslip } from '@taqam/core';
import { approvePayrollRun, calculatePayrollRun, PayrollStateError } from './payroll.engine';

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const dec = (n: number) => new Prisma.Decimal(n);

function fakeDb(overrides: Record<string, unknown> = {}) {
  const created: Prisma.PayslipCreateManyInput[] = [];
  const runUpdate = jest.fn(async ({ data }) => ({ id: 'run1', period: '2026-09', ...data }));
  const tx = {
    payslip: { deleteMany: jest.fn(), createMany: jest.fn(async ({ data }) => created.push(...data)) },
    payrollRun: { update: runUpdate },
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
  return { db, tx, created, runUpdate };
}

describe('payroll engine', () => {
  it('gathers attendance, leave, adjustments and loans and delegates to core.calculatePayslip', async () => {
    const { db, created, runUpdate } = fakeDb();
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
    const data = runUpdate.mock.calls[0][0].data;
    expect(data.status).toBe('CALCULATED');
    expect(data.employeesCount).toBe(1);
    expect(data.totalNet).toBe(expected.net);
    expect(data.totalEmployerCost).toBe(expected.employerCost);
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
    expect(tx.payrollRun.update.mock.calls[0][0].data.status).toBe('APPROVED');
  });
});
