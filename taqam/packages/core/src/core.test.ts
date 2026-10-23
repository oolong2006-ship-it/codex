import { describe, it, expect } from 'vitest';
import {
  round2, totalWage, dailyWage, hourlyWage, overtimePay, absenceDeduction,
  calculateGosi, DEFAULT_GOSI_RATES, payableDaysInPeriod, prorate, serviceDuration,
  calculateEndOfService, SAUDI_LEAVE_POLICIES, annualLeaveEntitlement, annualLeaveBalance,
  sickLeavePay, countLeaveDays, calculateAttendance, haversineMeters, isWithinGeofence,
  calculatePayslip, validateSaudiIban, bankCodeFromIban, generateWpsCsv, makeSaudiIban,
  saudizationRate, nitaqatBand, hiresNeededForBand, DEFAULT_NITAQAT_THRESHOLDS,
  daysUntil, expiryStatus, WageComponents, ShiftDef, WpsEmployeeRow,
} from './index';

const W10K: WageComponents = { basic: 7000, housing: 2000, transport: 1000, other: 0 };

describe('round2', () => {
  it('rounds half up on float edge cases', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(10)).toBe(10);
  });
  it('returns 0 for non-finite', () => {
    expect(round2(NaN)).toBe(0);
    expect(round2(Infinity)).toBe(0);
  });
});

describe('wage', () => {
  it('total / daily / hourly', () => {
    expect(totalWage(W10K)).toBe(10000);
    expect(dailyWage(W10K)).toBe(333.33);
    expect(hourlyWage(W10K)).toBe(41.67);
    expect(hourlyWage(W10K, 10)).toBe(33.33);
  });
  it('overtime Art.107: hourly(total) + 0.5 × hourly(basic)', () => {
    const w = { basic: 6000, housing: 1500, transport: 500, other: 0 };
    // 8000/240 = 33.3333 + 0.5 × 25 = 45.8333 × 10 = 458.33
    expect(overtimePay(w, 10)).toBe(458.33);
    expect(overtimePay(w, 0)).toBe(0);
    expect(overtimePay(w, -5)).toBe(0);
  });
  it('overtime respects hoursPerDay', () => {
    const w = { basic: 6000, housing: 0, transport: 0, other: 0 };
    // 6 h/day: hourly = 6000/180 = 33.333; + 16.667 = 50 per hour
    expect(overtimePay(w, 2, 6)).toBe(100);
  });
  it('absence deduction = daily × days', () => {
    expect(absenceDeduction({ basic: 6000, housing: 2000, transport: 1000, other: 0 }, 3)).toBe(900);
    expect(absenceDeduction(W10K, 0)).toBe(0);
  });
});

describe('GOSI', () => {
  it('Saudi 8000 + 2000 → 975 / 1175', () => {
    expect(calculateGosi({ basic: 8000, housing: 2000, isSaudi: true })).toEqual({
      base: 10000, employee: 975, employer: 1175, total: 2150,
    });
  });
  it('non-Saudi → 0 / 200', () => {
    expect(calculateGosi({ basic: 8000, housing: 2000, isSaudi: false })).toEqual({
      base: 10000, employee: 0, employer: 200, total: 200,
    });
  });
  it('caps base at 45,000', () => {
    const r = calculateGosi({ basic: 50000, housing: 10000, isSaudi: true });
    expect(r.base).toBe(45000);
    expect(r.employee).toBe(4387.5);
    expect(r.employer).toBe(5287.5);
  });
  it('floors base at 1,500', () => {
    const r = calculateGosi({ basic: 1000, housing: 0, isSaudi: true });
    expect(r.base).toBe(1500);
    expect(r.employee).toBe(146.25);
  });
  it('accepts partial rate overrides', () => {
    const r = calculateGosi({ basic: 10000, housing: 0, isSaudi: true }, { saudiEmployee: 0.1 });
    expect(r.employee).toBe(1000);
    expect(r.employer).toBe(1175);
  });
  it('exposes defaults', () => {
    expect(DEFAULT_GOSI_RATES).toMatchObject({ saudiEmployee: 0.0975, saudiEmployer: 0.1175, nonSaudiEmployee: 0, nonSaudiEmployer: 0.02, minBase: 1500, maxBase: 45000 });
  });
});

describe('payableDaysInPeriod / prorate', () => {
  it('full month = 30 (incl. 31-day and February months)', () => {
    expect(payableDaysInPeriod('2024-03', '2020-01-01')).toBe(30);
    expect(payableDaysInPeriod('2024-02', '2020-01-01', null)).toBe(30);
  });
  it('joiner on day d → 30 - d + 1', () => {
    expect(payableDaysInPeriod('2024-03', '2024-03-10')).toBe(21);
    expect(payableDaysInPeriod('2024-03', '2024-03-01')).toBe(30);
    expect(payableDaysInPeriod('2024-03', '2024-03-31')).toBe(0);
  });
  it('leaver on day d → d; Feb end-of-month → 30', () => {
    expect(payableDaysInPeriod('2024-03', '2020-01-01', '2024-03-15')).toBe(15);
    expect(payableDaysInPeriod('2024-02', '2020-01-01', '2024-02-29')).toBe(30);
    expect(payableDaysInPeriod('2023-02', '2020-01-01', '2023-02-28')).toBe(30);
    expect(payableDaysInPeriod('2024-02', '2020-01-01', '2024-02-28')).toBe(28);
    expect(payableDaysInPeriod('2024-01', '2020-01-01', '2024-01-31')).toBe(30);
    expect(payableDaysInPeriod('2024-01', '2020-01-01', '2024-01-30')).toBe(30);
  });
  it('joiner and leaver in same month', () => {
    expect(payableDaysInPeriod('2024-03', '2024-03-10', '2024-03-20')).toBe(11);
  });
  it('outside range → 0', () => {
    expect(payableDaysInPeriod('2024-03', '2024-04-01')).toBe(0);
    expect(payableDaysInPeriod('2024-03', '2020-01-01', '2024-02-15')).toBe(0);
  });
  it('accepts Date objects', () => {
    expect(payableDaysInPeriod('2024-03', new Date(Date.UTC(2024, 2, 10)))).toBe(21);
  });
  it('rejects bad periods', () => {
    expect(() => payableDaysInPeriod('2024-13', '2020-01-01')).toThrow();
  });
  it('prorate = amount × days / 30', () => {
    expect(prorate(3000, 21)).toBe(2100);
    expect(prorate(10000, 30)).toBe(10000);
    expect(prorate(10000, 0)).toBe(0);
    expect(prorate(1000, 10)).toBe(333.33);
  });
});

describe('serviceDuration', () => {
  it('exact years', () => {
    const s = serviceDuration('2020-01-01', '2023-01-01');
    expect(s).toMatchObject({ years: 3, months: 0, days: 0, totalYears: 3, totalDays: 1096 });
  });
  it('years / months / days breakdown', () => {
    const s = serviceDuration('2020-01-15', '2021-03-10');
    expect(s.years).toBe(1);
    expect(s.months).toBe(1);
    expect(s.days).toBe(23);
    expect(s.totalYears).toBeCloseTo(1 + 54 / 365, 10);
  });
  it('end before start → zeros', () => {
    expect(serviceDuration('2024-01-01', '2023-01-01').totalDays).toBe(0);
  });
});

describe('End of service (Arts. 84/85/80)', () => {
  const wage = W10K; // total 10,000
  it('3 years full award = 15,000', () => {
    const r = calculateEndOfService({ startDate: '2020-01-01', endDate: '2023-01-01', wage, reason: 'EMPLOYER_TERMINATION' });
    expect(r.fullAward).toBe(15000);
    expect(r.factor).toBe(1);
    expect(r.award).toBe(15000);
    expect(r.total).toBe(15000);
    expect(r.breakdown[0].labelAr).toBe('الخمس سنوات الأولى: نصف راتب عن كل سنة');
  });
  it('7 years = 2.5 × 10,000 + 2 × 10,000 = 45,000', () => {
    const r = calculateEndOfService({ startDate: '2016-01-01', endDate: '2023-01-01', wage, reason: 'CONTRACT_END' });
    expect(r.fullAward).toBe(45000);
    expect(r.breakdown.map((b) => b.amount)).toEqual([25000, 20000]);
  });
  it('resignation at 7 years → 2/3 = 30,000', () => {
    const r = calculateEndOfService({ startDate: '2016-01-01', endDate: '2023-01-01', wage, reason: 'RESIGNATION' });
    expect(r.factor).toBeCloseTo(2 / 3, 10);
    expect(r.award).toBe(30000);
    expect(r.breakdown.find((b) => b.amount < 0)?.amount).toBe(-15000);
  });
  it('resignation at 3 years → 1/3 = 5,000', () => {
    const r = calculateEndOfService({ startDate: '2020-01-01', endDate: '2023-01-01', wage, reason: 'RESIGNATION' });
    expect(r.factor).toBeCloseTo(1 / 3, 10);
    expect(r.award).toBe(5000);
  });
  it('resignation under 2 years → 0', () => {
    const r = calculateEndOfService({ startDate: '2021-06-01', endDate: '2023-05-31', wage, reason: 'RESIGNATION' });
    expect(r.factor).toBe(0);
    expect(r.award).toBe(0);
    expect(r.notesAr.some((n) => n.includes('أقل من سنتين'))).toBe(true);
  });
  it('resignation boundary at exactly 2, 5 and 10 years', () => {
    const f = (start: string) => calculateEndOfService({ startDate: start, endDate: '2023-01-01', wage, reason: 'RESIGNATION' }).factor;
    expect(f('2021-01-01')).toBeCloseTo(1 / 3, 10);
    expect(f('2018-01-01')).toBeCloseTo(2 / 3, 10);
    expect(f('2013-01-01')).toBe(1);
  });
  it('resignation at 10 years → full 75,000', () => {
    const r = calculateEndOfService({ startDate: '2013-01-01', endDate: '2023-01-01', wage, reason: 'RESIGNATION' });
    expect(r.award).toBe(75000);
  });
  it('Article 80 → 0', () => {
    const r = calculateEndOfService({ startDate: '2013-01-01', endDate: '2023-01-01', wage, reason: 'ARTICLE_80', unusedLeaveDays: 10 });
    expect(r.fullAward).toBe(75000);
    expect(r.award).toBe(0);
    expect(r.leaveEncashment).toBe(3333.33);
    expect(r.total).toBe(3333.33);
  });
  it.each(['ARTICLE_81', 'FORCE_MAJEURE', 'FEMALE_MARRIAGE_CHILDBIRTH', 'RETIREMENT', 'DEATH'] as const)('%s → full award', (reason) => {
    const r = calculateEndOfService({ startDate: '2021-01-01', endDate: '2022-01-01', wage, reason });
    expect(r.factor).toBe(1);
    expect(r.award).toBe(5000);
  });
  it('partial years pro-rata by days: 5 years + 73 days = 27,000', () => {
    const r = calculateEndOfService({ startDate: '2015-01-01', endDate: '2020-03-14', wage, reason: 'EMPLOYER_TERMINATION' });
    expect(r.service.totalYears).toBeCloseTo(5.2, 10);
    expect(r.fullAward).toBe(27000);
  });
  it('half year in the first 5 years', () => {
    // 2022-01-01 → 2022-07-02 = 182 days → 0.5 × 10000 × 182/365 = 2493.15
    const r = calculateEndOfService({ startDate: '2022-01-01', endDate: '2022-07-02', wage, reason: 'CONTRACT_END' });
    expect(r.fullAward).toBe(2493.15);
  });
  it('leave encashment = days × total/30', () => {
    const r = calculateEndOfService({ startDate: '2020-01-01', endDate: '2023-01-01', wage: { basic: 6000, housing: 2000, transport: 1000, other: 0 }, reason: 'CONTRACT_END', unusedLeaveDays: 10 });
    expect(r.leaveEncashment).toBe(3000);
    expect(r.total).toBe(13500 + 3000);
    expect(r.breakdown.some((b) => b.labelEn.startsWith('Unused leave'))).toBe(true);
  });
});

describe('leave', () => {
  it('policies match Saudi law', () => {
    const p = Object.fromEntries(SAUDI_LEAVE_POLICIES.map((x) => [x.code, x]));
    expect(p.ANNUAL.maxDaysPerYear).toBe(21);
    expect(p.SICK.maxDaysPerYear).toBe(120);
    expect(p.MATERNITY.maxDaysPerYear).toBe(84);
    expect(p.PATERNITY.maxDaysPerYear).toBe(3);
    expect(p.MARRIAGE.maxDaysPerYear).toBe(5);
    expect(p.BEREAVEMENT.maxDaysPerYear).toBe(5);
    expect(p.HAJJ.maxDaysPerYear).toBe(15);
    expect(p.EXAM.maxDaysPerYear).toBeNull();
    expect(p.UNPAID.maxDaysPerYear).toBeNull();
    expect(p.UNPAID.paid).toBe(false);
    expect(SAUDI_LEAVE_POLICIES).toHaveLength(9);
  });
  it('annual entitlement 21 → 30 after 5 completed years', () => {
    expect(annualLeaveEntitlement('2020-01-01', '2024-12-31')).toBe(21);
    expect(annualLeaveEntitlement('2020-01-01', '2025-01-01')).toBe(30);
  });
  it('annual balance accrues pro-rata in current service year', () => {
    // 182 days into the service year → 21 × 182/365 = 10.47
    const b = annualLeaveBalance({ hireDate: '2023-01-01', asOf: '2023-07-02', takenDays: 3 });
    expect(b).toEqual({ entitlementPerYear: 21, accrued: 10.47, taken: 3, balance: 7.47 });
  });
  it('annual balance uses current service year and carry-over', () => {
    const b = annualLeaveBalance({ hireDate: '2019-03-01', asOf: '2024-03-01', takenDays: 0, carriedOver: 5 });
    expect(b.entitlementPerYear).toBe(30);
    expect(b.accrued).toBe(0);
    expect(b.balance).toBe(5);
  });
  it('sick leave: within first 30 days → no deduction', () => {
    expect(sickLeavePay(W10K, 0, 10)).toEqual({ fullPayDays: 10, partialPayDays: 0, unpaidDays: 0, deduction: 0 });
  });
  it('sick leave: crossing into 75% tier', () => {
    const w = { basic: 9000, housing: 0, transport: 0, other: 0 }; // daily 300
    expect(sickLeavePay(w, 25, 10)).toEqual({ fullPayDays: 5, partialPayDays: 5, unpaidDays: 0, deduction: 375 });
  });
  it('sick leave: crossing into unpaid tier', () => {
    const w = { basic: 9000, housing: 0, transport: 0, other: 0 };
    expect(sickLeavePay(w, 85, 10)).toEqual({ fullPayDays: 0, partialPayDays: 5, unpaidDays: 5, deduction: 1875 });
    expect(sickLeavePay(w, 115, 10)).toEqual({ fullPayDays: 0, partialPayDays: 0, unpaidDays: 10, deduction: 3000 });
  });
  it('countLeaveDays inclusive with weekend & holidays', () => {
    expect(countLeaveDays('2024-01-01', '2024-01-07')).toBe(7);
    expect(countLeaveDays('2024-01-01', '2024-01-07', { weekendDays: [5, 6] })).toBe(5);
    expect(countLeaveDays('2024-01-01', '2024-01-07', { weekendDays: [5, 6], holidays: ['2024-01-02'] })).toBe(4);
    expect(countLeaveDays('2024-01-05', '2024-01-05')).toBe(1);
    expect(countLeaveDays('2024-01-07', '2024-01-01')).toBe(0);
  });
});

describe('attendance', () => {
  const day: ShiftDef = { startTime: '08:00', endTime: '17:00', breakMinutes: 60, graceMinutes: 15 };
  const z = (s: string) => new Date(s);
  it('absent when no check-in', () => {
    expect(calculateAttendance(day, null, null).status).toBe('ABSENT');
  });
  it('incomplete when no check-out', () => {
    const r = calculateAttendance(day, z('2024-01-01T05:00:00Z'), null);
    expect(r.status).toBe('INCOMPLETE');
    expect(r.workedMinutes).toBe(0);
  });
  it('within grace → present, not late', () => {
    // 05:10Z = 08:10 Riyadh
    const r = calculateAttendance(day, z('2024-01-01T05:10:00Z'), z('2024-01-01T14:00:00Z'));
    expect(r).toEqual({ workedMinutes: 470, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0, status: 'PRESENT' });
  });
  it('late beyond grace = diff - grace', () => {
    const r = calculateAttendance(day, z('2024-01-01T05:30:00Z'), z('2024-01-01T14:00:00Z'));
    expect(r.lateMinutes).toBe(15);
    expect(r.status).toBe('LATE');
  });
  it('overtime counted when >= 15 min', () => {
    const r = calculateAttendance(day, z('2024-01-01T05:00:00Z'), z('2024-01-01T15:00:00Z'));
    expect(r.workedMinutes).toBe(540);
    expect(r.overtimeMinutes).toBe(60);
  });
  it('overtime ignored below 15 min', () => {
    const r = calculateAttendance(day, z('2024-01-01T05:00:00Z'), z('2024-01-01T14:10:00Z'));
    expect(r.overtimeMinutes).toBe(0);
  });
  it('early leave minutes', () => {
    const r = calculateAttendance(day, z('2024-01-01T05:00:00Z'), z('2024-01-01T13:00:00Z'));
    expect(r.earlyLeaveMinutes).toBe(60);
    expect(r.status).toBe('PRESENT');
  });
  it('overnight shift 22:00 → 06:00', () => {
    const night: ShiftDef = { startTime: '22:00', endTime: '06:00', breakMinutes: 30, graceMinutes: 10 };
    // 22:05 local Jan 1 → 06:00 local Jan 2
    const r = calculateAttendance(night, z('2024-01-01T19:05:00Z'), z('2024-01-02T03:00:00Z'));
    expect(r).toEqual({ workedMinutes: 445, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0, status: 'PRESENT' });
  });
  it('overnight shift late check-in after midnight maps to previous day start', () => {
    const night: ShiftDef = { startTime: '22:00', endTime: '06:00', breakMinutes: 30, graceMinutes: 10 };
    // 00:30 local Jan 2 → 150 min after 22:00 → late 140
    const r = calculateAttendance(night, z('2024-01-01T21:30:00Z'), z('2024-01-02T03:00:00Z'));
    expect(r.lateMinutes).toBe(140);
    expect(r.status).toBe('LATE');
  });
  it('overnight shift with overtime', () => {
    const night: ShiftDef = { startTime: '22:00', endTime: '06:00', breakMinutes: 30, graceMinutes: 10 };
    const r = calculateAttendance(night, z('2024-01-01T19:00:00Z'), z('2024-01-02T04:00:00Z'));
    expect(r.workedMinutes).toBe(510);
    expect(r.overtimeMinutes).toBe(60);
  });
  it('custom timezone offset (UTC)', () => {
    const r = calculateAttendance(day, z('2024-01-01T08:20:00Z'), z('2024-01-01T17:00:00Z'), 0);
    expect(r.lateMinutes).toBe(5);
  });
  it('haversine: 1 degree latitude ≈ 111,195 m', () => {
    expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111195.08, 0);
    expect(haversineMeters({ lat: 24.7, lng: 46.7 }, { lat: 24.7, lng: 46.7 })).toBe(0);
  });
  it('haversine Riyadh → Jeddah ≈ 845 km', () => {
    const d = haversineMeters({ lat: 24.7136, lng: 46.6753 }, { lat: 21.4858, lng: 39.1925 });
    expect(d).toBeGreaterThan(840_000);
    expect(d).toBeLessThan(850_000);
  });
  it('geofence', () => {
    const c = { lat: 24.7136, lng: 46.6753 };
    expect(isWithinGeofence({ lat: 24.7137, lng: 46.6753 }, c, 50)).toBe(true);
    expect(isWithinGeofence({ lat: 24.7146, lng: 46.6753 }, c, 50)).toBe(false);
  });
});

describe('payslip', () => {
  const wage = { basic: 8000, housing: 2000, transport: 500, other: 0 };
  const base = { period: '2024-03', wage, isSaudi: true, hireDate: '2020-01-01' };
  it('full month Saudi', () => {
    const r = calculatePayslip(base);
    expect(r.payableDays).toBe(30);
    expect(r.gross).toBe(10500);
    expect(r.gosi.employee).toBe(975);
    expect(r.totalDeductions).toBe(975);
    expect(r.net).toBe(9525);
    expect(r.employerCost).toBe(11675);
    expect(r.earnings.map((e) => e.code)).toEqual(['BASIC', 'HOUSING', 'TRANSPORT']);
    expect(r.deductions.map((d) => d.code)).toEqual(['GOSI']);
  });
  it('non-Saudi has no employee GOSI deduction', () => {
    const r = calculatePayslip({ ...base, isSaudi: false });
    expect(r.net).toBe(10500);
    expect(r.employerCost).toBe(10700);
  });
  it('overtime earning', () => {
    const r = calculatePayslip({ ...base, overtimeHours: 10 });
    // 10500/240 = 43.75 + 0.5 × 33.3333 = 60.4167 × 10
    expect(r.earnings.find((e) => e.code === 'OVERTIME')?.amount).toBe(604.17);
    expect(r.gross).toBe(11104.17);
  });
  it('joiner proration; GOSI not prorated', () => {
    const r = calculatePayslip({ ...base, hireDate: '2024-03-11' });
    expect(r.payableDays).toBe(20);
    expect(r.earnings.find((e) => e.code === 'BASIC')?.amount).toBe(5333.33);
    expect(r.gross).toBe(6999.99);
    expect(r.gosi.employee).toBe(975);
    expect(r.net).toBe(6024.99);
    expect(r.notesAr.length).toBeGreaterThan(0);
  });
  it('additions and deductions', () => {
    const r = calculatePayslip({
      ...base,
      absentDays: 2,
      loanDeduction: 500,
      additions: [{ type: 'BONUS', labelAr: 'مكافأة', amount: 1000 }],
      deductions: [{ type: 'PENALTY', labelAr: 'جزاء', amount: 100 }],
    });
    expect(r.gross).toBe(11500);
    expect(r.deductions.map((d) => [d.code, d.amount])).toEqual([
      ['GOSI', 975], ['ABSENCE', 700], ['LOAN', 500], ['PENALTY', 100],
    ]);
    expect(r.net).toBe(11500 - 975 - 700 - 500 - 100);
  });
  it('Art.92: non-GOSI deductions capped at 50% of wage', () => {
    const r = calculatePayslip({ ...base, loanDeduction: 6000 });
    expect(r.deductions.find((d) => d.code === 'LOAN')?.amount).toBe(5250);
    expect(r.net).toBe(10500 - 975 - 5250);
    expect(r.notesAr.some((n) => n.includes('المادة 92'))).toBe(true);
  });
  it('Art.92 caps loans at 50% of earned wage; absence is not capped', () => {
    // gross 10500, absence 3500 → earned 7000 → Art.92 cap 3500
    const ok = calculatePayslip({ ...base, absentDays: 10, loanDeduction: 3000 });
    expect(ok.deductions.find((d) => d.code === 'ABSENCE')?.amount).toBe(3500);
    expect(ok.deductions.find((d) => d.code === 'LOAN')?.amount).toBe(3000);
    const capped = calculatePayslip({ ...base, absentDays: 10, loanDeduction: 5000 });
    expect(capped.deductions.find((d) => d.code === 'LOAN')?.amount).toBe(3500);
    expect(capped.notesAr.some((n) => n.includes('المادة 92'))).toBe(true);
  });
  it('long absence is fully deducted (no work, no pay)', () => {
    const r = calculatePayslip({ ...base, absentDays: 20 });
    expect(r.deductions.find((d) => d.code === 'ABSENCE')?.amount).toBe(7000);
  });
  it('net never negative (GOSI larger than a 1-day gross)', () => {
    const r = calculatePayslip({ ...base, period: '2024-04', hireDate: '2024-04-30' });
    expect(r.payableDays).toBe(1);
    expect(r.gross).toBe(350.01); // 266.67 + 66.67 + 16.67 (per-line rounding)
    expect(r.net).toBe(0);
    expect(r.totalDeductions).toBe(350.01);
    expect(r.net).toBeGreaterThanOrEqual(0);
  });
  it('zero payable days → zero GOSI and net', () => {
    const r = calculatePayslip({ ...base, terminationDate: '2024-02-15' });
    expect(r.payableDays).toBe(0);
    expect(r.gosi.total).toBe(0);
    expect(r.gross).toBe(0);
    expect(r.net).toBe(0);
  });
  it('unpaid leave and sick deductions', () => {
    const r = calculatePayslip({ ...base, unpaidLeaveDays: 1, sickLeaveDeduction: 87.5 });
    expect(r.deductions.find((d) => d.code === 'UNPAID_LEAVE')?.amount).toBe(350);
    expect(r.deductions.find((d) => d.code === 'SICK')?.amount).toBe(87.5);
    expect(r.net).toBe(10500 - 975 - 350 - 87.5);
  });
});

describe('IBAN & WPS', () => {
  const VALID = 'SA0380000000608010167519';
  const IBAN2 = makeSaudiIban('10000001234567890123');
  it('validates a real-format Saudi IBAN', () => {
    expect(validateSaudiIban(VALID)).toBe(true);
    expect(validateSaudiIban('sa03 8000 0000 6080 1016 7519')).toBe(true);
    expect(validateSaudiIban(IBAN2)).toBe(true);
  });
  it('rejects wrong check digits / format', () => {
    expect(validateSaudiIban('SA0480000000608010167519')).toBe(false);
    expect(validateSaudiIban('SA038000000060801016751')).toBe(false);
    expect(validateSaudiIban('AE070331234567890123456')).toBe(false);
    expect(validateSaudiIban('SA03800000006080101675AB')).toBe(false);
    expect(validateSaudiIban('')).toBe(false);
  });
  it('bank code = chars 5–6', () => {
    expect(bankCodeFromIban(VALID)).toBe('80');
    expect(bankCodeFromIban(IBAN2)).toBe('10');
  });
  const header = { establishmentId: '7001234567', companyNameEn: 'Taqam Demo', companyIban: VALID, bankCode: '', period: '2024-03', paymentDate: '2024-03-27' };
  const row = (o: Partial<WpsEmployeeRow>): WpsEmployeeRow => ({
    employeeNumber: 'E1', nationalId: '1012345678', nameEn: 'Ahmed Ali', iban: IBAN2, bankCode: '',
    basic: 8000, housing: 2000, otherEarnings: 500, deductions: 975, net: 9525, ...o,
  });
  it('generates header + employee lines', () => {
    const r = generateWpsCsv(header, [row({}), row({ employeeNumber: 'E2', nameEn: 'Doe, John', net: 1000.5 })]);
    const lines = r.csv.trim().split('\n');
    expect(lines[0]).toBe('7001234567,80,SA0380000000608010167519,2024-03,2024-03-27,2,10525.50');
    expect(lines[1]).toBe(`E1,1012345678,Ahmed Ali,${IBAN2},10,8000.00,2000.00,500.00,975.00,9525.00`);
    expect(lines[2]).toContain('"Doe, John"');
    expect(r.count).toBe(2);
    expect(r.totalNet).toBe(10525.5);
    expect(r.errors).toEqual([]);
  });
  it('collects Arabic errors and skips invalid rows', () => {
    const r = generateWpsCsv(header, [
      row({}),
      row({ employeeNumber: 'E2', iban: 'SA0000000000000000000000' }),
      row({ employeeNumber: 'E3', nationalId: '' }),
      row({ employeeNumber: 'E4', net: 0 }),
    ]);
    expect(r.count).toBe(1);
    expect(r.totalNet).toBe(9525);
    expect(r.errors.map((e) => e.employeeNumber)).toEqual(['E2', 'E3', 'E4']);
    expect(r.errors[0].messageAr).toContain('الآيبان');
    expect(r.csv.trim().split('\n')).toHaveLength(2);
  });
  it('quotes fields with quotes and reports invalid company IBAN', () => {
    const r = generateWpsCsv({ ...header, companyIban: 'SA00' }, [row({ nameEn: 'A "B" C' })]);
    expect(r.csv).toContain('"A ""B"" C"');
    expect(r.errors[0].employeeNumber).toBe('HEADER');
  });
  it('accepts Date payment date', () => {
    const r = generateWpsCsv({ ...header, paymentDate: new Date(Date.UTC(2024, 2, 27)) }, []);
    expect(r.csv.split('\n')[0]).toContain(',2024-03-27,0,0.00');
  });
});

describe('Nitaqat', () => {
  it('saudization rate', () => {
    expect(saudizationRate(3, 10)).toBe(30);
    expect(saudizationRate(1, 3)).toBe(33.33);
    expect(saudizationRate(0, 0)).toBe(0);
  });
  it('bands with default thresholds', () => {
    expect(DEFAULT_NITAQAT_THRESHOLDS).toEqual({ platinum: 40, highGreen: 27, midGreen: 20, lowGreen: 12 });
    expect(nitaqatBand(40)).toBe('PLATINUM');
    expect(nitaqatBand(30)).toBe('HIGH_GREEN');
    expect(nitaqatBand(20)).toBe('MID_GREEN');
    expect(nitaqatBand(12)).toBe('LOW_GREEN');
    expect(nitaqatBand(11.99)).toBe('RED');
  });
  it('custom thresholds', () => {
    expect(nitaqatBand(30, { platinum: 50, highGreen: 35, midGreen: 25, lowGreen: 10 })).toBe('MID_GREEN');
  });
  it('hires needed', () => {
    expect(hiresNeededForBand(2, 10, 'PLATINUM')).toBe(4); // 6/14 = 42.86%
    expect(hiresNeededForBand(1, 10, 'LOW_GREEN')).toBe(1); // 2/11 = 18.18%
    expect(hiresNeededForBand(5, 10, 'HIGH_GREEN')).toBe(0);
    expect(hiresNeededForBand(0, 10, 'RED')).toBe(0);
    expect(hiresNeededForBand(0, 0, 'LOW_GREEN')).toBe(1);
  });
});

describe('documents', () => {
  it('daysUntil', () => {
    expect(daysUntil('2025-01-31', '2025-01-01')).toBe(30);
    expect(daysUntil('2024-12-31', '2025-01-01')).toBe(-1);
    expect(daysUntil(new Date(Date.UTC(2025, 0, 2)), '2025-01-01')).toBe(1);
  });
  it('expiry status thresholds', () => {
    const f = '2025-01-01';
    expect(expiryStatus('2024-12-31', f)).toBe('EXPIRED');
    expect(expiryStatus('2025-01-01', f)).toBe('CRITICAL');
    expect(expiryStatus('2025-01-31', f)).toBe('CRITICAL');
    expect(expiryStatus('2025-02-01', f)).toBe('WARNING');
    expect(expiryStatus('2025-04-01', f)).toBe('WARNING'); // 90 days
    expect(expiryStatus('2025-04-02', f)).toBe('OK');
    expect(expiryStatus(null, f)).toBe('NONE');
    expect(expiryStatus(undefined)).toBe('NONE');
  });
});
