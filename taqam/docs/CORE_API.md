# @taqam/core — Public API (contract)

Pure TypeScript, zero runtime deps, no I/O. Built with `tsc` to `dist/` (CommonJS + .d.ts).
Consumed by `apps/api` and `apps/web` via `"@taqam/core": "file:../../packages/core"`.
All money values are SAR numbers rounded to 2 decimals (use the exported `round2`).
Dates are ISO strings `YYYY-MM-DD` or JS `Date`; functions must accept both (`DateInput = string | Date`).
All functions must be deterministic and unit-tested (vitest).

```ts
export type DateInput = string | Date;
export function round2(n: number): number;

// ---------- Wage ----------
export interface WageComponents {
  basic: number;
  housing: number;
  transport: number;
  other: number;            // other fixed monthly allowances
}
export function totalWage(w: WageComponents): number;          // sum
export function dailyWage(w: WageComponents): number;          // totalWage / 30
export function hourlyWage(w: WageComponents, hoursPerDay?: number): number; // daily / hoursPerDay(8)

// ---------- GOSI (التأمينات الاجتماعية) ----------
export interface GosiRates {
  saudiEmployee: number;    // default 0.0975 (9% annuities + 0.75% SANED)
  saudiEmployer: number;    // default 0.1175 (9% + 0.75% SANED + 2% occupational hazards)
  nonSaudiEmployee: number; // default 0
  nonSaudiEmployer: number; // default 0.02 (occupational hazards)
  minBase: number;          // default 1500
  maxBase: number;          // default 45000
}
export const DEFAULT_GOSI_RATES: GosiRates;
export interface GosiResult { base: number; employee: number; employer: number; total: number; }
// base = clamp(basic + housing, minBase, maxBase)
export function calculateGosi(input: { basic: number; housing: number; isSaudi: boolean }, rates?: Partial<GosiRates>): GosiResult;

// ---------- Overtime (م107) ----------
// pay per OT hour = hourly(total wage) + 50% of hourly(basic)
export function overtimePay(w: WageComponents, overtimeHours: number, hoursPerDay?: number): number;

// ---------- Absence / proration ----------
export function absenceDeduction(w: WageComponents, absentDays: number): number; // dailyWage * days
// For joiners/leavers mid-month: payable days in the period (month uses 30-day basis, capped 0..30)
export function payableDaysInPeriod(period: string /* YYYY-MM */, hireDate: DateInput, terminationDate?: DateInput | null): number;
export function prorate(amount: number, payableDays: number): number; // amount * days / 30

// ---------- Service duration ----------
export interface ServiceDuration { years: number; months: number; days: number; totalYears: number /* fractional, days/365 */; totalDays: number; }
export function serviceDuration(start: DateInput, end: DateInput): ServiceDuration;

// ---------- End of service (م84، م85) ----------
export type TerminationReason =
  | 'EMPLOYER_TERMINATION'      // full award
  | 'CONTRACT_END'              // full
  | 'RESIGNATION'               // Art.85 fractions
  | 'ARTICLE_80'                // no award
  | 'ARTICLE_81'                // employee leaves for employer breach -> full
  | 'FORCE_MAJEURE'             // full
  | 'FEMALE_MARRIAGE_CHILDBIRTH'// full (within 6 months of marriage / 3 of childbirth)
  | 'RETIREMENT'                // full
  | 'DEATH';                    // full
export interface EosbInput {
  startDate: DateInput;
  endDate: DateInput;
  wage: WageComponents;       // last wage; EOSB uses totalWage
  reason: TerminationReason;
  unusedLeaveDays?: number;   // encashed at dailyWage
}
export interface EosbResult {
  service: ServiceDuration;
  fullAward: number;          // before Art.85 factor: 0.5 month/yr first 5 yrs, 1 month/yr after, fractions pro-rata
  factor: number;             // 0, 1/3, 2/3, 1
  award: number;              // fullAward * factor
  leaveEncashment: number;
  total: number;
  breakdown: { labelAr: string; labelEn: string; amount: number }[];
  notesAr: string[];
}
export function calculateEndOfService(input: EosbInput): EosbResult;
// Resignation factor: <2y 0; 2–<5 1/3; 5–<10 2/3; >=10 1.

// ---------- Leave (م109، م117، تعديلات 2025) ----------
export type LeaveCode = 'ANNUAL'|'SICK'|'UNPAID'|'MATERNITY'|'PATERNITY'|'MARRIAGE'|'BEREAVEMENT'|'HAJJ'|'EXAM';
export interface LeavePolicy { code: LeaveCode; nameAr: string; nameEn: string; paid: boolean; maxDaysPerYear: number | null; notesAr: string; }
export const SAUDI_LEAVE_POLICIES: LeavePolicy[];
// ANNUAL 21 (30 after 5 yrs), SICK 120/yr (30 full, 60 at 75%, 30 unpaid), MATERNITY 84 (12 weeks),
// PATERNITY 3, MARRIAGE 5, BEREAVEMENT 5, HAJJ 15 (once, after 2 yrs service), EXAM null, UNPAID null.
export function annualLeaveEntitlement(hireDate: DateInput, asOf: DateInput): number; // 21 or 30 days/yr
// accrued days in the current service year so far, minus taken
export function annualLeaveBalance(input: { hireDate: DateInput; asOf: DateInput; takenDays: number; carriedOver?: number }): { entitlementPerYear: number; accrued: number; taken: number; balance: number };
// sick leave pay split given days already taken in the rolling year
export function sickLeavePay(w: WageComponents, alreadyTakenDays: number, requestedDays: number): { fullPayDays: number; partialPayDays: number; unpaidDays: number; deduction: number };
// calendar days inclusive between two dates, optionally excluding given weekend days (0=Sun..6=Sat) and holidays
export function countLeaveDays(start: DateInput, end: DateInput, opts?: { weekendDays?: number[]; holidays?: DateInput[] }): number;

// ---------- Attendance ----------
export interface ShiftDef { startTime: string; endTime: string; breakMinutes: number; graceMinutes: number; } // "HH:mm"; overnight allowed
export interface AttendanceCalc { workedMinutes: number; lateMinutes: number; earlyLeaveMinutes: number; overtimeMinutes: number; status: 'PRESENT'|'LATE'|'ABSENT'|'INCOMPLETE'; }
export function calculateAttendance(shift: ShiftDef, checkIn: Date | null, checkOut: Date | null, timezoneOffsetMinutes?: number /* default 180 for Riyadh */): AttendanceCalc;
export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number;
export function isWithinGeofence(point: { lat: number; lng: number }, center: { lat: number; lng: number }, radiusMeters: number): boolean;

// ---------- Payslip ----------
export interface PayslipInput {
  period: string;                 // YYYY-MM
  wage: WageComponents;
  isSaudi: boolean;
  hireDate: DateInput;
  terminationDate?: DateInput | null;
  overtimeHours?: number;
  absentDays?: number;
  unpaidLeaveDays?: number;
  sickLeaveDeduction?: number;
  additions?: { type: string; labelAr: string; amount: number }[];   // bonus, commission...
  deductions?: { type: string; labelAr: string; amount: number }[];  // penalties, other
  loanDeduction?: number;
  gosiRates?: Partial<GosiRates>;
  hoursPerDay?: number;
}
export interface PayslipResult {
  payableDays: number;
  earnings: { code: string; labelAr: string; labelEn: string; amount: number }[]; // BASIC, HOUSING, TRANSPORT, OTHER (prorated), OVERTIME, + additions
  deductions: { code: string; labelAr: string; labelEn: string; amount: number }[]; // GOSI, ABSENCE, UNPAID_LEAVE, SICK, LOAN, + deductions
  gross: number;
  totalDeductions: number;
  net: number;                    // never negative; if it would be, cap deductions and add note
  gosi: GosiResult;
  employerCost: number;           // gross + gosi.employer
  notesAr: string[];
}
export function calculatePayslip(input: PayslipInput): PayslipResult;
// Note: Art. 92 — total deductions (excluding GOSI) must not exceed 50% of wage; enforce and add note.

// ---------- WPS / Mudad payroll file ----------
export interface WpsEmployeeRow {
  employeeNumber: string; nationalId: string; nameEn: string; iban: string; bankCode: string;
  basic: number; housing: number; otherEarnings: number; deductions: number; net: number;
}
export interface WpsHeader { establishmentId: string; companyNameEn: string; companyIban: string; bankCode: string; period: string; paymentDate: DateInput; }
export function validateSaudiIban(iban: string): boolean;             // SA + 22 digits, mod-97 check
export function bankCodeFromIban(iban: string): string;               // digits 5-6 of IBAN
export function generateWpsCsv(header: WpsHeader, rows: WpsEmployeeRow[]): { csv: string; errors: { employeeNumber: string; messageAr: string }[]; totalNet: number; count: number };
// CSV: header record line then one line per employee; UTF-8; documented columns in code comments.

// ---------- Saudization (Nitaqat - simplified) ----------
export type NitaqatBand = 'PLATINUM'|'HIGH_GREEN'|'MID_GREEN'|'LOW_GREEN'|'RED';
export interface NitaqatThresholds { platinum: number; highGreen: number; midGreen: number; lowGreen: number; } // percentages
export const DEFAULT_NITAQAT_THRESHOLDS: NitaqatThresholds; // demo values: 40, 27, 20, 12 (real thresholds depend on activity & size)
export function saudizationRate(saudis: number, total: number): number; // percent 0..100, 2 decimals
export function nitaqatBand(rate: number, t?: NitaqatThresholds): NitaqatBand;
export function hiresNeededForBand(saudis: number, total: number, target: NitaqatBand, t?: NitaqatThresholds): number; // additional Saudi hires

// ---------- Document expiry ----------
export function daysUntil(date: DateInput, from?: DateInput): number;
export function expiryStatus(date: DateInput | null | undefined, from?: DateInput): 'EXPIRED'|'CRITICAL'|'WARNING'|'OK'|'NONE'; // <0, <=30, <=90, >90, null
```
