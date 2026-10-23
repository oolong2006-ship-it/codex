import { DateInput, round2, toUtcDate, serviceDuration, addYears, diffDays } from './dates';
import { WageComponents, rawDaily } from './wage';

export type LeaveCode =
  | 'ANNUAL'
  | 'SICK'
  | 'UNPAID'
  | 'MATERNITY'
  | 'PATERNITY'
  | 'MARRIAGE'
  | 'BEREAVEMENT'
  | 'HAJJ'
  | 'EXAM';

export interface LeavePolicy {
  code: LeaveCode;
  nameAr: string;
  nameEn: string;
  paid: boolean;
  maxDaysPerYear: number | null;
  notesAr: string;
}

export const SAUDI_LEAVE_POLICIES: LeavePolicy[] = [
  { code: 'ANNUAL', nameAr: 'إجازة سنوية', nameEn: 'Annual leave', paid: true, maxDaysPerYear: 21,
    notesAr: '21 يوماً سنوياً، تزاد إلى 30 يوماً بعد إكمال خمس سنوات في الخدمة (المادة 109).' },
  { code: 'SICK', nameAr: 'إجازة مرضية', nameEn: 'Sick leave', paid: true, maxDaysPerYear: 120,
    notesAr: 'حتى 120 يوماً في السنة: 30 يوماً بأجر كامل، و60 يوماً بثلاثة أرباع الأجر، و30 يوماً بدون أجر (المادة 117).' },
  { code: 'UNPAID', nameAr: 'إجازة بدون أجر', nameEn: 'Unpaid leave', paid: false, maxDaysPerYear: null,
    notesAr: 'باتفاق الطرفين، ولا يستحق عنها أجر.' },
  { code: 'MATERNITY', nameAr: 'إجازة وضع', nameEn: 'Maternity leave', paid: true, maxDaysPerYear: 84,
    notesAr: '12 أسبوعاً (84 يوماً) بأجر كامل وفق تعديلات نظام العمل 2025 (المادة 151).' },
  { code: 'PATERNITY', nameAr: 'إجازة مولود', nameEn: 'Paternity leave', paid: true, maxDaysPerYear: 3,
    notesAr: '3 أيام بأجر كامل عند ولادة مولود للعامل (المادة 113).' },
  { code: 'MARRIAGE', nameAr: 'إجازة زواج', nameEn: 'Marriage leave', paid: true, maxDaysPerYear: 5,
    notesAr: '5 أيام بأجر كامل عند زواج العامل (المادة 113).' },
  { code: 'BEREAVEMENT', nameAr: 'إجازة وفاة', nameEn: 'Bereavement leave', paid: true, maxDaysPerYear: 5,
    notesAr: '5 أيام بأجر كامل عند وفاة الزوج أو أحد الأصول أو الفروع (المادة 113).' },
  { code: 'HAJJ', nameAr: 'إجازة حج', nameEn: 'Hajj leave', paid: true, maxDaysPerYear: 15,
    notesAr: 'مرة واحدة طوال الخدمة، من 10 إلى 15 يوماً بأجر، بعد سنتين متصلتين من الخدمة (المادة 114).' },
  { code: 'EXAM', nameAr: 'إجازة امتحان', nameEn: 'Exam leave', paid: true, maxDaysPerYear: null,
    notesAr: 'بأجر كامل لأداء الامتحان عن سنة غير معادة، بقدر المدة الفعلية للامتحان (المادة 115).' },
];

/** 21 days/yr, or 30 once 5 full years of service are completed at `asOf` (Art. 109). */
export function annualLeaveEntitlement(hireDate: DateInput, asOf: DateInput): number {
  return serviceDuration(hireDate, asOf).years >= 5 ? 30 : 21;
}

/**
 * Accrued annual leave in the current service year (since the latest hire
 * anniversary, pro-rata by days / 365), plus carried-over, minus taken.
 */
export function annualLeaveBalance(input: {
  hireDate: DateInput;
  asOf: DateInput;
  takenDays: number;
  carriedOver?: number;
}): { entitlementPerYear: number; accrued: number; taken: number; balance: number } {
  const entitlementPerYear = annualLeaveEntitlement(input.hireDate, input.asOf);
  const hire = toUtcDate(input.hireDate);
  const asOf = toUtcDate(input.asOf);
  let accrued = 0;
  if (asOf.getTime() > hire.getTime()) {
    const years = serviceDuration(hire, asOf).years;
    const yearStart = addYears(hire, years);
    const daysIn = Math.min(365, diffDays(yearStart, asOf));
    accrued = round2((entitlementPerYear * daysIn) / 365);
  }
  const taken = Math.max(0, input.takenDays || 0);
  const carried = input.carriedOver || 0;
  return { entitlementPerYear, accrued, taken, balance: round2(carried + accrued - taken) };
}

/**
 * Sick leave pay split (Art. 117) in a rolling year: first 30 days full pay,
 * next 60 at 75%, next 30 (and anything beyond 120) unpaid.
 * deduction = partialDays × 25% × daily + unpaidDays × daily (daily = totalWage/30).
 */
export function sickLeavePay(
  w: WageComponents,
  alreadyTakenDays: number,
  requestedDays: number,
): { fullPayDays: number; partialPayDays: number; unpaidDays: number; deduction: number } {
  const taken = Math.max(0, alreadyTakenDays || 0);
  const req = Math.max(0, requestedDays || 0);
  const overlap = (lo: number, hi: number) => Math.max(0, Math.min(taken + req, hi) - Math.max(taken, lo));
  const fullPayDays = overlap(0, 30);
  const partialPayDays = overlap(30, 90);
  const unpaidDays = req - fullPayDays - partialPayDays;
  const daily = rawDaily(w);
  const deduction = round2(partialPayDays * daily * 0.25 + unpaidDays * daily);
  return { fullPayDays, partialPayDays, unpaidDays, deduction };
}

/** Calendar days inclusive, optionally excluding weekend days (0=Sun..6=Sat) and holidays. */
export function countLeaveDays(
  start: DateInput,
  end: DateInput,
  opts?: { weekendDays?: number[]; holidays?: DateInput[] },
): number {
  const s = toUtcDate(start);
  const e = toUtcDate(end);
  if (e.getTime() < s.getTime()) return 0;
  const weekend = new Set(opts?.weekendDays ?? []);
  const holidays = new Set((opts?.holidays ?? []).map((h) => toUtcDate(h).getTime()));
  let count = 0;
  for (let t = s.getTime(); t <= e.getTime(); t += 86_400_000) {
    const day = new Date(t).getUTCDay();
    if (weekend.has(day)) continue;
    if (holidays.has(t)) continue;
    count++;
  }
  return count;
}
