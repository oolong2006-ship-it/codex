import { DateInput, addDays, daysInMonth, formatIsoDate, parsePeriod, prorate, round2, toUtcDate } from './dates';
import { validateSaudiIban } from './wps';

/**
 * Mudad / WPS pre-upload checker (spec §2). ERROR issues block the «جاهز للرفع» badge,
 * WARNING issues do not.
 */
export type WpsIssueCode =
  | 'INVALID_IBAN'
  | 'MISSING_NATIONAL_ID'
  | 'NON_POSITIVE_NET'
  | 'DUPLICATE_NATIONAL_ID'
  | 'EMPLOYEE_MISSING_FROM_RUN'
  | 'NET_MISMATCH'
  | 'DEDUCTION_OVER_HALF'
  | 'PAID_BELOW_CONTRACT'
  | 'LATE_PAYMENT';

export type WpsIssueSeverity = 'ERROR' | 'WARNING';

export interface WpsIssue {
  code: WpsIssueCode;
  severity: WpsIssueSeverity;
  /** null for run-level issues (LATE_PAYMENT). */
  employeeNumber: string | null;
  messageAr: string;
}

export const WPS_ISSUE_MESSAGES: Record<WpsIssueCode, { severity: WpsIssueSeverity; messageAr: string }> = {
  INVALID_IBAN: { severity: 'ERROR', messageAr: 'رقم الآيبان غير صالح' },
  MISSING_NATIONAL_ID: { severity: 'ERROR', messageAr: 'رقم الهوية/الإقامة مفقود' },
  NON_POSITIVE_NET: { severity: 'ERROR', messageAr: 'صافي الراتب يجب أن يكون أكبر من صفر' },
  DUPLICATE_NATIONAL_ID: { severity: 'ERROR', messageAr: 'رقم الهوية مكرر في الملف' },
  EMPLOYEE_MISSING_FROM_RUN: { severity: 'ERROR', messageAr: 'موظف نشط غير موجود في المسير' },
  NET_MISMATCH: { severity: 'ERROR', messageAr: 'الصافي لا يساوي الإجمالي ناقص الخصومات' },
  DEDUCTION_OVER_HALF: { severity: 'WARNING', messageAr: 'الخصومات تتجاوز نصف الأجر (م92)' },
  PAID_BELOW_CONTRACT: { severity: 'WARNING', messageAr: 'الأجر الأساسي المدفوع أقل من العقد دون غياب مسجل' },
  LATE_PAYMENT: { severity: 'WARNING', messageAr: 'تاريخ الصرف متأخر عن نهاية الشهر بأكثر من 7 أيام' },
};

/** Days after the period end a salary may be paid before LATE_PAYMENT fires. */
export const WPS_LATE_PAYMENT_GRACE_DAYS = 7;

export interface WpsCheckRow {
  employeeNumber: string;
  nationalId: string;
  iban: string;
  gross: number;
  deductions: number;
  net: number;
  /** BASIC earnings line actually paid this period. */
  basicPaid: number;
  /** Monthly contracted basic salary (full month). */
  contractBasic: number;
  /** Absence, unpaid leave or sick-leave wage loss is recorded for this employee in the period. */
  hasAbsenceOrUnpaidLeave: boolean;
  /**
   * Payable days in the period on the 30-day basis (default 30). A mid-month joiner or leaver
   * is owed only `contractBasic × payableDays / 30`, so a prorated basic is not an underpayment.
   */
  payableDays?: number;
}

export interface WpsCheckInput {
  /** YYYY-MM */
  period: string;
  paymentDate: DateInput;
  rows: WpsCheckRow[];
  /** Employee numbers that must appear in the run (employed during the period, not terminated before it). */
  activeEmployeeNumbers: string[];
}

export interface WpsCheckResult {
  issues: WpsIssue[];
  errors: number;
  warnings: number;
  /** true when there is no ERROR (warnings do not block). */
  ready: boolean;
}

const finite = (n: number) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
const normId = (id: string) => String(id ?? '').replace(/\s+/g, '');

export function checkWpsRun(input: WpsCheckInput): WpsCheckResult {
  const issues: WpsIssue[] = [];
  const add = (code: WpsIssueCode, employeeNumber: string | null) =>
    issues.push({ code, severity: WPS_ISSUE_MESSAGES[code].severity, employeeNumber, messageAr: WPS_ISSUE_MESSAGES[code].messageAr });

  const idCount = new Map<string, number>();
  for (const r of input.rows) {
    const id = normId(r.nationalId);
    if (id) idCount.set(id, (idCount.get(id) ?? 0) + 1);
  }

  for (const r of input.rows) {
    const gross = finite(r.gross);
    const deductions = finite(r.deductions);
    const net = finite(r.net);
    const id = normId(r.nationalId);
    if (!validateSaudiIban(r.iban)) add('INVALID_IBAN', r.employeeNumber);
    if (!id) add('MISSING_NATIONAL_ID', r.employeeNumber);
    if (!(net > 0)) add('NON_POSITIVE_NET', r.employeeNumber);
    if (id && (idCount.get(id) ?? 0) > 1) add('DUPLICATE_NATIONAL_ID', r.employeeNumber);
    if (Math.abs(round2(gross - deductions - net)) > 0.01) add('NET_MISMATCH', r.employeeNumber);
    if (deductions > gross * 0.5) add('DEDUCTION_OVER_HALF', r.employeeNumber);
    const days = r.payableDays === undefined || r.payableDays === null ? 30 : r.payableDays;
    const due = prorate(Math.max(0, finite(r.contractBasic)), days);
    if (!r.hasAbsenceOrUnpaidLeave && round2(due - finite(r.basicPaid)) > 0.01) add('PAID_BELOW_CONTRACT', r.employeeNumber);
  }

  const inRun = new Set(input.rows.map((r) => r.employeeNumber));
  for (const n of new Set(input.activeEmployeeNumbers)) {
    if (!inRun.has(n)) add('EMPLOYEE_MISSING_FROM_RUN', n);
  }

  const { year, month } = parsePeriod(input.period);
  const periodEnd = `${input.period}-${String(daysInMonth(year, month)).padStart(2, '0')}`;
  const latest = formatIsoDate(addDays(periodEnd, WPS_LATE_PAYMENT_GRACE_DAYS));
  if (formatIsoDate(toUtcDate(input.paymentDate)) > latest) add('LATE_PAYMENT', null);

  const errors = issues.filter((i) => i.severity === 'ERROR').length;
  return { issues, errors, warnings: issues.length - errors, ready: errors === 0 };
}
