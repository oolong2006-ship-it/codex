/** Pure helpers feeding @taqam/core checkWpsRun from stored payslips (Mudad pre-upload checker, spec §2). */
import { Prisma } from '@prisma/client';
import { WpsCheckRow } from '@taqam/core';
import { num } from '../common/money';

const lineAmount = (lines: unknown, code: string) =>
  ((lines ?? []) as { code: string; amount: number }[]).filter((l) => l.code === code).reduce((s, l) => s + l.amount, 0);

/** Wage-loss lines that legitimately reduce what is paid against the contract (absence, unpaid/sick leave). */
const WAGE_LOSS_CODES = ['ABSENCE', 'UNPAID_LEAVE', 'SICK'];

type Money = Prisma.Decimal | number;
export interface WpsSlip {
  gross: Money;
  totalDeductions: Money;
  net: Money;
  payableDays: number;
  earnings: unknown;
  deductions: unknown;
  inputs: unknown;
  employee: { employeeNumber: string; nationalId: string; iban: string | null; basicSalary: Money };
}

/**
 * One checker row. The contract basic is the employee's current salary while the run can still be
 * recalculated (CALCULATED); once APPROVED/PAID it is the wage snapshotted at calculation, so a later
 * raise does not make an old run look underpaid.
 */
export function wpsCheckRow(s: WpsSlip, runStatus: string): WpsCheckRow {
  const inputs = (s.inputs ?? {}) as { absentDays?: number; unpaidLeaveDays?: number; sickLeaveDeduction?: number; wage?: { basic?: number } };
  const snapshot = inputs.wage?.basic;
  const contractBasic = runStatus !== 'CALCULATED' && typeof snapshot === 'number' ? snapshot : num(s.employee.basicSalary);
  const wageLoss = WAGE_LOSS_CODES.some((code) => lineAmount(s.deductions, code) > 0);
  return {
    employeeNumber: s.employee.employeeNumber,
    nationalId: s.employee.nationalId,
    iban: s.employee.iban || '',
    gross: num(s.gross),
    deductions: num(s.totalDeductions),
    net: num(s.net),
    basicPaid: lineAmount(s.earnings, 'BASIC'),
    contractBasic,
    hasAbsenceOrUnpaidLeave: wageLoss || (inputs.absentDays ?? 0) > 0 || (inputs.unpaidLeaveDays ?? 0) > 0 || (inputs.sickLeaveDeduction ?? 0) > 0,
    payableDays: s.payableDays,
  };
}

/** Salary payment date used in the WPS file: the paid date, else the company's payroll day in the period. */
export function wpsScheduledPaymentDate(run: { period: string; paidAt: Date | null }, payrollDay: number | null): string {
  const payDay = String(Math.min(28, payrollDay || 27)).padStart(2, '0');
  return run.paidAt ? run.paidAt.toISOString().slice(0, 10) : `${run.period}-${payDay}`;
}

/**
 * Date the checker tests LATE_PAYMENT against: the paid date once paid; before that the scheduled day,
 * or today (Riyadh) once the scheduled day has passed — an unpaid run checked after the deadline warns.
 */
export function wpsCheckPaymentDate(run: { period: string; paidAt: Date | null }, payrollDay: number | null, today: string) {
  const scheduledPaymentDate = wpsScheduledPaymentDate(run, payrollDay);
  const paymentDate = run.paidAt || today <= scheduledPaymentDate ? scheduledPaymentDate : today;
  return { paymentDate, scheduledPaymentDate };
}
