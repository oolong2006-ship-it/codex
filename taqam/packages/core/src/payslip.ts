import { DateInput, round2, payableDaysInPeriod, prorate } from './dates';
import { WageComponents, overtimePay, absenceDeduction, rawDaily } from './wage';
import { GosiRates, GosiResult, calculateGosi } from './gosi';

export interface PayslipInput {
  /** YYYY-MM */
  period: string;
  wage: WageComponents;
  isSaudi: boolean;
  hireDate: DateInput;
  terminationDate?: DateInput | null;
  overtimeHours?: number;
  absentDays?: number;
  unpaidLeaveDays?: number;
  sickLeaveDeduction?: number;
  /** bonus, commission... */
  additions?: { type: string; labelAr: string; amount: number }[];
  /** penalties, other */
  deductions?: { type: string; labelAr: string; amount: number }[];
  loanDeduction?: number;
  gosiRates?: Partial<GosiRates>;
  hoursPerDay?: number;
}

export interface PayslipLine {
  code: string;
  labelAr: string;
  labelEn: string;
  amount: number;
}

export interface PayslipResult {
  payableDays: number;
  /** BASIC, HOUSING, TRANSPORT, OTHER (prorated), OVERTIME, + additions */
  earnings: PayslipLine[];
  /** GOSI, ABSENCE, UNPAID_LEAVE, SICK, LOAN, + deductions */
  deductions: PayslipLine[];
  gross: number;
  totalDeductions: number;
  /** never negative */
  net: number;
  gosi: GosiResult;
  /** gross + gosi.employer */
  employerCost: number;
  notesAr: string[];
}

/** Art. 92: total deductions (excluding GOSI) may not exceed this share of the wage due. */
export const MAX_DEDUCTION_RATIO = 0.5;

const pos = (v: number | undefined | null) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * Monthly payslip.
 * - Fixed components are prorated by payable days (30-day basis).
 * - GOSI is computed on the full contributory wage (basic + housing, clamped),
 *   not prorated, unless payableDays == 0 (then 0).
 * - Art. 92: loan/penalty/other deductions are capped at 50% of the earned wage (gross
 *   minus absence/unpaid/sick wage loss, which is not capped); later lines
 *   (loan, penalties) are trimmed first. Net is never negative.
 */
export function calculatePayslip(input: PayslipInput): PayslipResult {
  const w = input.wage;
  const notesAr: string[] = [];
  const payableDays = payableDaysInPeriod(input.period, input.hireDate, input.terminationDate ?? null);
  if (payableDays < 30) {
    notesAr.push(`تم احتساب الراتب بنسبة ${payableDays} يوماً من 30 يوماً (التحاق أو انتهاء خلال الشهر).`);
  }

  const earnings: PayslipLine[] = [];
  earnings.push({ code: 'BASIC', labelAr: 'الراتب الأساسي', labelEn: 'Basic salary', amount: prorate(pos(w.basic), payableDays) });
  const fixed: [keyof WageComponents, string, string, string][] = [
    ['housing', 'HOUSING', 'بدل السكن', 'Housing allowance'],
    ['transport', 'TRANSPORT', 'بدل النقل', 'Transport allowance'],
    ['other', 'OTHER', 'بدلات أخرى', 'Other allowances'],
  ];
  for (const [key, code, ar, en] of fixed) {
    const amt = prorate(pos(w[key]), payableDays);
    if (amt > 0) earnings.push({ code, labelAr: ar, labelEn: en, amount: amt });
  }
  const otHours = pos(input.overtimeHours);
  if (otHours > 0 && payableDays > 0) {
    earnings.push({
      code: 'OVERTIME',
      labelAr: `العمل الإضافي (${otHours} ساعة)`,
      labelEn: `Overtime (${otHours} h)`,
      amount: overtimePay(w, otHours, input.hoursPerDay ?? 8),
    });
    notesAr.push('أجر الساعة الإضافية = أجر الساعة الشامل + 50% من أجر الساعة الأساسي (المادة 107).');
  }
  for (const a of input.additions ?? []) {
    const amt = round2(pos(a.amount));
    if (amt > 0) earnings.push({ code: a.type || 'ADDITION', labelAr: a.labelAr, labelEn: a.type || 'Addition', amount: amt });
  }
  const gross = round2(earnings.reduce((s, e) => s + e.amount, 0));

  // GOSI
  const gosi: GosiResult =
    payableDays === 0
      ? { base: 0, employee: 0, employer: 0, total: 0 }
      : calculateGosi({ basic: pos(w.basic), housing: pos(w.housing), isSaudi: input.isSaudi }, input.gosiRates);

  // Wage-loss lines (no work / unpaid leave) reduce the wage actually earned and are not
  // "deductions" in the Art. 92 sense; only loans, penalties and other deductions are capped.
  const wageLoss: PayslipLine[] = [];
  const absent = pos(input.absentDays);
  if (absent > 0) {
    wageLoss.push({ code: 'ABSENCE', labelAr: `غياب (${absent} يوم)`, labelEn: `Absence (${absent} days)`, amount: absenceDeduction(w, absent) });
  }
  const unpaid = pos(input.unpaidLeaveDays);
  if (unpaid > 0) {
    wageLoss.push({ code: 'UNPAID_LEAVE', labelAr: `إجازة بدون أجر (${unpaid} يوم)`, labelEn: `Unpaid leave (${unpaid} days)`, amount: round2(rawDaily(w) * unpaid) });
  }
  const sick = round2(pos(input.sickLeaveDeduction));
  if (sick > 0) wageLoss.push({ code: 'SICK', labelAr: 'خصم إجازة مرضية', labelEn: 'Sick leave deduction', amount: sick });

  // Art. 92 deductions, in priority order (earlier lines kept first).
  const requested: PayslipLine[] = [];
  const loan = round2(pos(input.loanDeduction));
  if (loan > 0) requested.push({ code: 'LOAN', labelAr: 'قسط سلفة', labelEn: 'Loan installment', amount: loan });
  for (const d of input.deductions ?? []) {
    const amt = round2(pos(d.amount));
    if (amt > 0) requested.push({ code: d.type || 'DEDUCTION', labelAr: d.labelAr, labelEn: d.type || 'Deduction', amount: amt });
  }

  const deductions: PayslipLine[] = [];
  // GOSI employee share first, never more than gross.
  const gosiEmp = Math.min(gosi.employee, gross);
  if (gosi.employee > 0) {
    deductions.push({ code: 'GOSI', labelAr: 'التأمينات الاجتماعية (حصة الموظف)', labelEn: 'GOSI (employee share)', amount: round2(gosiEmp) });
    if (gosiEmp < gosi.employee) {
      notesAr.push('تم تخفيض خصم التأمينات الاجتماعية حتى لا يصبح صافي الراتب سالباً.');
    }
  }

  let available = round2(gross - gosiEmp);
  let wageLossApplied = 0;
  let wageLossTrimmed = false;
  for (const d of wageLoss) {
    const amt = round2(Math.max(0, Math.min(d.amount, available)));
    if (amt < d.amount) wageLossTrimmed = true;
    available = round2(available - amt);
    wageLossApplied = round2(wageLossApplied + amt);
    if (amt > 0) deductions.push({ ...d, amount: amt });
  }
  if (wageLossTrimmed) notesAr.push('تم تخفيض خصومات الغياب والإجازات حتى لا يصبح صافي الراتب سالباً.');

  const art92Cap = round2(Math.max(0, gross - wageLossApplied) * MAX_DEDUCTION_RATIO);
  const cap = Math.min(art92Cap, available);
  const requestedTotal = round2(requested.reduce((s, d) => s + d.amount, 0));
  let remaining = cap;
  for (const d of requested) {
    const amt = round2(Math.max(0, Math.min(d.amount, remaining)));
    remaining = round2(remaining - amt);
    if (amt > 0) deductions.push({ ...d, amount: amt });
  }
  if (requestedTotal > cap) {
    if (requestedTotal > art92Cap && art92Cap <= available) {
      notesAr.push(
        `تم تحديد الخصومات (عدا التأمينات والغياب) بنسبة 50% من الأجر المستحق وفق المادة 92؛ المطلوب ${requestedTotal.toFixed(2)} والمطبق ${cap.toFixed(2)}، ويرحّل الفرق.`,
      );
    } else {
      notesAr.push('تم تخفيض الخصومات حتى لا يصبح صافي الراتب سالباً.');
    }
  }

  const totalDeductions = round2(deductions.reduce((s, d) => s + d.amount, 0));
  const net = round2(Math.max(0, gross - totalDeductions));
  return {
    payableDays,
    earnings,
    deductions,
    gross,
    totalDeductions,
    net,
    gosi,
    employerCost: round2(gross + gosi.employer),
    notesAr,
  };
}
