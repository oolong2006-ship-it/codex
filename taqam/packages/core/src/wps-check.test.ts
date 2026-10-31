import { describe, it, expect } from 'vitest';
import { checkWpsRun, makeSaudiIban, WPS_ISSUE_MESSAGES, WpsCheckRow, WpsCheckInput, WpsIssueCode } from './index';

const IBAN1 = 'SA0380000000608010167519';
const IBAN2 = makeSaudiIban('10000001234567890123');

/** A clean row: 10,000 basic + 2,500 housing, 1,218.75 GOSI → net 11,281.25. */
const row = (over: Partial<WpsCheckRow> = {}): WpsCheckRow => ({
  employeeNumber: 'E-1',
  nationalId: '1012345678',
  iban: IBAN1,
  gross: 12500,
  deductions: 1218.75,
  net: 11281.25,
  basicPaid: 10000,
  contractBasic: 10000,
  hasAbsenceOrUnpaidLeave: false,
  ...over,
});

const input = (over: Partial<WpsCheckInput> = {}): WpsCheckInput => ({
  period: '2026-10',
  paymentDate: '2026-10-27',
  rows: [row(), row({ employeeNumber: 'E-2', nationalId: '2098765432', iban: IBAN2 })],
  activeEmployeeNumbers: ['E-1', 'E-2'],
  ...over,
});

const only = (code: WpsIssueCode, inp: WpsCheckInput) => checkWpsRun(inp).issues.filter((i) => i.code === code);

describe('checkWpsRun — Mudad pre-upload checker (spec §2)', () => {
  it('a clean run is ready with no issues', () => {
    expect(checkWpsRun(input())).toEqual({ issues: [], errors: 0, warnings: 0, ready: true });
  });

  it('INVALID_IBAN — ERROR when the IBAN fails mod-97 or is not SA', () => {
    for (const iban of ['SA0380000000608010167518', 'GB82WEST12345698765432', '']) {
      const issues = only('INVALID_IBAN', input({ rows: [row({ iban })], activeEmployeeNumbers: ['E-1'] }));
      expect(issues).toEqual([{ code: 'INVALID_IBAN', severity: 'ERROR', employeeNumber: 'E-1', messageAr: 'رقم الآيبان غير صالح' }]);
    }
    expect(only('INVALID_IBAN', input({ rows: [row({ iban: 'sa03 8000 0000 6080 1016 7519' })] }))).toEqual([]);
  });

  it('MISSING_NATIONAL_ID — ERROR when the id is empty', () => {
    const issues = only('MISSING_NATIONAL_ID', input({ rows: [row({ nationalId: '  ' })], activeEmployeeNumbers: ['E-1'] }));
    expect(issues).toEqual([{ code: 'MISSING_NATIONAL_ID', severity: 'ERROR', employeeNumber: 'E-1', messageAr: 'رقم الهوية/الإقامة مفقود' }]);
  });

  it('NON_POSITIVE_NET — ERROR when net <= 0', () => {
    const issues = only('NON_POSITIVE_NET', input({ rows: [row({ gross: 0, deductions: 0, net: 0, basicPaid: 0, contractBasic: 0 })], activeEmployeeNumbers: ['E-1'] }));
    expect(issues).toEqual([{ code: 'NON_POSITIVE_NET', severity: 'ERROR', employeeNumber: 'E-1', messageAr: 'صافي الراتب يجب أن يكون أكبر من صفر' }]);
  });

  it('DUPLICATE_NATIONAL_ID — ERROR on every row sharing an id (ignoring spaces)', () => {
    const rows = [row(), row({ employeeNumber: 'E-2', nationalId: ' 1012345678 ', iban: IBAN2 })];
    const issues = only('DUPLICATE_NATIONAL_ID', input({ rows }));
    expect(issues).toEqual([
      { code: 'DUPLICATE_NATIONAL_ID', severity: 'ERROR', employeeNumber: 'E-1', messageAr: 'رقم الهوية مكرر في الملف' },
      { code: 'DUPLICATE_NATIONAL_ID', severity: 'ERROR', employeeNumber: 'E-2', messageAr: 'رقم الهوية مكرر في الملف' },
    ]);
    // two missing ids are MISSING_NATIONAL_ID, not duplicates
    expect(only('DUPLICATE_NATIONAL_ID', input({ rows: [row({ nationalId: '' }), row({ employeeNumber: 'E-2', nationalId: '', iban: IBAN2 })] }))).toEqual([]);
  });

  it('EMPLOYEE_MISSING_FROM_RUN — ERROR for an active employee without a payslip', () => {
    const issues = only('EMPLOYEE_MISSING_FROM_RUN', input({ activeEmployeeNumbers: ['E-1', 'E-2', 'E-3'] }));
    expect(issues).toEqual([{ code: 'EMPLOYEE_MISSING_FROM_RUN', severity: 'ERROR', employeeNumber: 'E-3', messageAr: 'موظف نشط غير موجود في المسير' }]);
    // a payslip for someone no longer in the active list (left mid-period) is not an issue
    expect(only('EMPLOYEE_MISSING_FROM_RUN', input({ activeEmployeeNumbers: ['E-1'] }))).toEqual([]);
  });

  it('NET_MISMATCH — ERROR when |gross − deductions − net| > 0.01', () => {
    const issues = only('NET_MISMATCH', input({ rows: [row({ net: 11281.27 })], activeEmployeeNumbers: ['E-1'] }));
    expect(issues).toEqual([{ code: 'NET_MISMATCH', severity: 'ERROR', employeeNumber: 'E-1', messageAr: 'الصافي لا يساوي الإجمالي ناقص الخصومات' }]);
    expect(only('NET_MISMATCH', input({ rows: [row({ net: 11281.26 })] }))).toEqual([]);
  });

  it('DEDUCTION_OVER_HALF — WARNING when deductions > 50% of gross (Art. 92)', () => {
    const over = row({ deductions: 6250.01, net: 6249.99 });
    const issues = only('DEDUCTION_OVER_HALF', input({ rows: [over], activeEmployeeNumbers: ['E-1'] }));
    expect(issues).toEqual([{ code: 'DEDUCTION_OVER_HALF', severity: 'WARNING', employeeNumber: 'E-1', messageAr: 'الخصومات تتجاوز نصف الأجر (م92)' }]);
    expect(only('DEDUCTION_OVER_HALF', input({ rows: [row({ deductions: 6250, net: 6250 })] }))).toEqual([]);
  });

  it('PAID_BELOW_CONTRACT — WARNING when basic paid < contract with no absence/unpaid leave recorded', () => {
    const under = row({ basicPaid: 9000, gross: 11500, deductions: 1218.75, net: 10281.25 });
    const issues = only('PAID_BELOW_CONTRACT', input({ rows: [under], activeEmployeeNumbers: ['E-1'] }));
    expect(issues).toEqual([{ code: 'PAID_BELOW_CONTRACT', severity: 'WARNING', employeeNumber: 'E-1', messageAr: 'الأجر الأساسي المدفوع أقل من العقد دون غياب مسجل' }]);
    // legitimate: absence / unpaid leave recorded for the period
    expect(only('PAID_BELOW_CONTRACT', input({ rows: [{ ...under, hasAbsenceOrUnpaidLeave: true }] }))).toEqual([]);
  });

  it('PAID_BELOW_CONTRACT — a prorated joiner/leaver is compared with the contract for the payable days', () => {
    // joined on the 16th → 15 of 30 days → basic 5,000 is the full contractual amount due
    const joiner = row({ basicPaid: 5000, gross: 6250, deductions: 1218.75, net: 5031.25, payableDays: 15 });
    expect(only('PAID_BELOW_CONTRACT', input({ rows: [joiner], activeEmployeeNumbers: ['E-1'] }))).toEqual([]);
    // ...but paying 4,000 for those 15 days is still an underpayment
    const short = { ...joiner, basicPaid: 4000, gross: 5250, net: 4031.25 };
    expect(only('PAID_BELOW_CONTRACT', input({ rows: [short], activeEmployeeNumbers: ['E-1'] }))).toHaveLength(1);
    // rounding (2,333.33 for 7 days of 10,000) is not an underpayment
    const sevenDays = row({ basicPaid: 2333.33, gross: 2916.66, deductions: 0, net: 2916.66, payableDays: 7 });
    expect(only('PAID_BELOW_CONTRACT', input({ rows: [sevenDays], activeEmployeeNumbers: ['E-1'] }))).toEqual([]);
  });

  it('LATE_PAYMENT — WARNING when paymentDate > period end + 7 days (run-level)', () => {
    expect(only('LATE_PAYMENT', input({ paymentDate: '2026-11-07' }))).toEqual([]);
    const issues = only('LATE_PAYMENT', input({ paymentDate: '2026-11-08' }));
    expect(issues).toEqual([{ code: 'LATE_PAYMENT', severity: 'WARNING', employeeNumber: null, messageAr: 'تاريخ الصرف متأخر عن نهاية الشهر بأكثر من 7 أيام' }]);
    // February: period end is the 28th
    expect(only('LATE_PAYMENT', input({ period: '2026-02', paymentDate: '2026-03-07' }))).toEqual([]);
    expect(only('LATE_PAYMENT', input({ period: '2026-02', paymentDate: '2026-03-08' }))).toHaveLength(1);
  });

  it('warnings alone keep the run ready; any ERROR blocks it; counts are per issue', () => {
    const warnOnly = checkWpsRun(input({ paymentDate: '2026-11-20', rows: [row({ deductions: 7000, net: 5500 })], activeEmployeeNumbers: ['E-1'] }));
    expect(warnOnly).toMatchObject({ errors: 0, warnings: 2, ready: true });

    const blocked = checkWpsRun(input({ rows: [row({ iban: 'X' }), row({ employeeNumber: 'E-2', nationalId: '', iban: IBAN2 })], activeEmployeeNumbers: ['E-1', 'E-2', 'E-3'] }));
    expect(blocked.errors).toBe(3);
    expect(blocked.warnings).toBe(0);
    expect(blocked.ready).toBe(false);
    expect(blocked.issues.map((i) => i.code).sort()).toEqual(['EMPLOYEE_MISSING_FROM_RUN', 'INVALID_IBAN', 'MISSING_NATIONAL_ID']);
  });

  it('an empty run with no active employees is ready (nothing to upload, nothing missing)', () => {
    expect(checkWpsRun(input({ rows: [], activeEmployeeNumbers: [] }))).toEqual({ issues: [], errors: 0, warnings: 0, ready: true });
  });

  it('exposes every message verbatim from the spec', () => {
    expect(WPS_ISSUE_MESSAGES).toEqual({
      INVALID_IBAN: { severity: 'ERROR', messageAr: 'رقم الآيبان غير صالح' },
      MISSING_NATIONAL_ID: { severity: 'ERROR', messageAr: 'رقم الهوية/الإقامة مفقود' },
      NON_POSITIVE_NET: { severity: 'ERROR', messageAr: 'صافي الراتب يجب أن يكون أكبر من صفر' },
      DUPLICATE_NATIONAL_ID: { severity: 'ERROR', messageAr: 'رقم الهوية مكرر في الملف' },
      EMPLOYEE_MISSING_FROM_RUN: { severity: 'ERROR', messageAr: 'موظف نشط غير موجود في المسير' },
      NET_MISMATCH: { severity: 'ERROR', messageAr: 'الصافي لا يساوي الإجمالي ناقص الخصومات' },
      DEDUCTION_OVER_HALF: { severity: 'WARNING', messageAr: 'الخصومات تتجاوز نصف الأجر (م92)' },
      PAID_BELOW_CONTRACT: { severity: 'WARNING', messageAr: 'الأجر الأساسي المدفوع أقل من العقد دون غياب مسجل' },
      LATE_PAYMENT: { severity: 'WARNING', messageAr: 'تاريخ الصرف متأخر عن نهاية الشهر بأكثر من 7 أيام' },
    });
  });
});
