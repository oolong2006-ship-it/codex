import { Prisma } from '@prisma/client';
import { wpsCheckPaymentDate, wpsCheckRow } from './wps-check';

const D = (n: number) => new Prisma.Decimal(n);
const slip = (over: { earnings?: unknown; deductions?: unknown; inputs?: unknown; payableDays?: number } = {}) => ({
  gross: D(7500),
  totalDeductions: D(731.25),
  net: D(6768.75),
  payableDays: over.payableDays ?? 30,
  earnings: over.earnings ?? [{ code: 'BASIC', amount: 6000 }, { code: 'HOUSING', amount: 1500 }],
  deductions: over.deductions ?? [{ code: 'GOSI', amount: 731.25 }],
  inputs: 'inputs' in over ? over.inputs : { absentDays: 0, unpaidLeaveDays: 0, sickDays: 0, sickLeaveDeduction: 0, wage: { basic: 6000, housing: 1500, transport: 0, other: 0 } },
  employee: { employeeNumber: 'EMP-1', nationalId: '1012345678', iban: 'SA0380000000608010167519', basicSalary: D(7000) },
});

describe('wpsCheckRow — payslip → checker row', () => {
  it('maps the payslip amounts, BASIC line and payable days', () => {
    expect(wpsCheckRow(slip({ payableDays: 15 }), 'CALCULATED')).toEqual({
      employeeNumber: 'EMP-1', nationalId: '1012345678', iban: 'SA0380000000608010167519',
      gross: 7500, deductions: 731.25, net: 6768.75, basicPaid: 6000, contractBasic: 7000, hasAbsenceOrUnpaidLeave: false, payableDays: 15,
    });
  });

  it('contract basic: current salary while CALCULATED; the calculation snapshot once APPROVED/PAID (a later raise is not an underpayment)', () => {
    expect(wpsCheckRow(slip(), 'CALCULATED').contractBasic).toBe(7000);
    expect(wpsCheckRow(slip(), 'APPROVED').contractBasic).toBe(6000);
    expect(wpsCheckRow(slip(), 'PAID').contractBasic).toBe(6000);
    // older payslips without a wage snapshot fall back to the current salary
    expect(wpsCheckRow(slip({ inputs: { absentDays: 0 } }), 'PAID').contractBasic).toBe(7000);
    expect(wpsCheckRow(slip({ inputs: null }), 'PAID').contractBasic).toBe(7000);
  });

  it('hasAbsenceOrUnpaidLeave: ABSENCE, UNPAID_LEAVE and SICK wage-loss lines', () => {
    for (const code of ['ABSENCE', 'UNPAID_LEAVE', 'SICK']) {
      const s = slip({ deductions: [{ code: 'GOSI', amount: 731.25 }, { code, amount: 250 }] });
      expect(wpsCheckRow(s, 'CALCULATED').hasAbsenceOrUnpaidLeave).toBe(true);
    }
    // loans / penalties are not absence
    expect(wpsCheckRow(slip({ deductions: [{ code: 'LOAN', amount: 500 }, { code: 'PENALTY', amount: 100 }] }), 'CALCULATED').hasAbsenceOrUnpaidLeave).toBe(false);
  });

  it('hasAbsenceOrUnpaidLeave: recorded days count even when the wage-loss line was trimmed to zero', () => {
    const noLines = { deductions: [] };
    expect(wpsCheckRow(slip({ ...noLines, inputs: { absentDays: 2 } }), 'CALCULATED').hasAbsenceOrUnpaidLeave).toBe(true);
    expect(wpsCheckRow(slip({ ...noLines, inputs: { unpaidLeaveDays: 3 } }), 'CALCULATED').hasAbsenceOrUnpaidLeave).toBe(true);
    expect(wpsCheckRow(slip({ ...noLines, inputs: { sickLeaveDeduction: 120 } }), 'CALCULATED').hasAbsenceOrUnpaidLeave).toBe(true);
    // fully paid sick days explain no shortfall
    expect(wpsCheckRow(slip({ ...noLines, inputs: { sickDays: 4, sickLeaveDeduction: 0 } }), 'CALCULATED').hasAbsenceOrUnpaidLeave).toBe(false);
  });
});

describe('wpsCheckPaymentDate', () => {
  const run = (paidAt: Date | null) => ({ period: '2026-10', paidAt });

  it('a paid run uses the paid date', () => {
    expect(wpsCheckPaymentDate(run(new Date('2026-11-20T09:00:00Z')), 27, '2026-12-01')).toEqual({ paymentDate: '2026-11-20', scheduledPaymentDate: '2026-11-20' });
  });

  it('an unpaid run uses the scheduled day until it has passed, then today (Riyadh) — so an overdue run warns before payment', () => {
    expect(wpsCheckPaymentDate(run(null), 27, '2026-10-15')).toEqual({ paymentDate: '2026-10-27', scheduledPaymentDate: '2026-10-27' });
    expect(wpsCheckPaymentDate(run(null), 27, '2026-11-07')).toEqual({ paymentDate: '2026-11-07', scheduledPaymentDate: '2026-10-27' });
    expect(wpsCheckPaymentDate(run(null), 27, '2026-11-08')).toEqual({ paymentDate: '2026-11-08', scheduledPaymentDate: '2026-10-27' });
    expect(wpsCheckPaymentDate(run(null), null, '2026-10-01').scheduledPaymentDate).toBe('2026-10-27');
    expect(wpsCheckPaymentDate(run(null), 31, '2026-10-01').scheduledPaymentDate).toBe('2026-10-28');
  });
});
