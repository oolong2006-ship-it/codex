/**
 * Demo dataset — port of apps/api/prisma/seed.ts ("مطاعم ورد الشام" / Ward Al-Sham Restaurants).
 * Deterministic (same PRNG + seed) and relative to today. Payroll runs go through the same engine as the handlers.
 */
import { calculateAttendance, countLeaveDays, SAUDI_LEAVE_POLICIES } from '@taqam/core';
import { companyPoolId, jobId, runId, seedEmployeeId } from './ids';
import { endOfDay, lifecycleDefaults } from './lifecycle';
import { seedPlatform } from './seed-platform';
import { seedBilling } from './seed-billing';
import { addDays, addMonths, day, eachDay, periodOf, periodRange, riyadhDateTime, todayStr, weekday } from './dates';
import { emptyDb, nextId, type Approval, type DB, type Employee, type Goal, type Role } from './db';
import { Services, fullName } from './services';

export const DEMO_PASSWORD = 'Shuoon@2026';
/** First id of the admin-portal company pool (src/demo/ids.ts COMPANY_IDS). */
export const DEMO_COMPANY_ID = companyPoolId(1);

let seedState = 20260223;
function rand() {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const digits = (n: number) => Array.from({ length: n }, () => randInt(0, 9)).join('');

function saudiIban(bankCode: string): string {
  const bban = bankCode + digits(18);
  const numeric = bban + '2810' + '00';
  let rem = 0;
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97;
  return `SA${String(98 - rem).padStart(2, '0')}${bban}`;
}

const BANKS = ['80', '10', '20', '05', '45', '55', '15', '30'];
const COLORS = ['#0F2747', '#1B3A63', '#0E7490', '#14D1C3', '#0369A1', '#1B7F53', '#C2412D', '#7A5C99'];

type BranchKey = 'OLAYA' | 'MALQA' | 'JEDDAH' | 'DAMMAM';
type DeptKey = 'KITCHEN' | 'SERVICE' | 'ADMIN' | 'FINHR' | 'DELIVERY';
type ShiftKind = 'M' | 'E' | 'A';
interface Seed {
  key: string; b: BranchKey; first: string; last: string; en: string; nat: string; g: 'MALE' | 'FEMALE'; dept: DeptKey; title: string;
  basic: number; hire: string; shift: ShiftKind; role?: 'BM' | 'GM'; other?: number; terminated?: { date: string; reason: string };
}

// prettier-ignore
const PEOPLE: Seed[] = [
  { key: 'gm', b: 'OLAYA', first: 'تركي', last: 'الشمري', en: 'Turki Al-Shammari', nat: 'SA', g: 'MALE', dept: 'ADMIN', title: 'المدير العام للعمليات', basic: 18000, hire: '2016-03-01', shift: 'A', role: 'GM', other: 1500 },
  { key: 'hr', b: 'OLAYA', first: 'نورة', last: 'القحطاني', en: 'Noura Al-Qahtani', nat: 'SA', g: 'FEMALE', dept: 'FINHR', title: 'مديرة الموارد البشرية', basic: 12000, hire: '2018-09-16', shift: 'A' },
  { key: 'payroll', b: 'OLAYA', first: 'ماجد', last: 'الحربي', en: 'Majed Al-Harbi', nat: 'SA', g: 'MALE', dept: 'FINHR', title: 'محاسب رواتب', basic: 9000, hire: '2020-01-12', shift: 'A' },
  { key: 'mgrOlaya', b: 'OLAYA', first: 'فهد', last: 'العتيبي', en: 'Fahad Al-Otaibi', nat: 'SA', g: 'MALE', dept: 'SERVICE', title: 'مدير فرع العليا', basic: 11000, hire: '2017-06-04', shift: 'M', role: 'BM', other: 800 },
  { key: 'emp', b: 'OLAYA', first: 'سعود', last: 'الدوسري', en: 'Saud Al-Dosari', nat: 'SA', g: 'MALE', dept: 'SERVICE', title: 'مشرف صالة', basic: 5500, hire: '2022-02-20', shift: 'M' },
  { key: 'o6', b: 'OLAYA', first: 'ريم', last: 'الزهراني', en: 'Reem Al-Zahrani', nat: 'SA', g: 'FEMALE', dept: 'SERVICE', title: 'كاشير', basic: 4800, hire: '2023-05-14', shift: 'E' },
  { key: 'o7', b: 'OLAYA', first: 'محمد', last: 'حلبي', en: 'Mohammad Halabi', nat: 'SY', g: 'MALE', dept: 'KITCHEN', title: 'رئيس الطهاة', basic: 8500, hire: '2016-05-10', shift: 'M', other: 500 },
  { key: 'o8', b: 'OLAYA', first: 'أحمد', last: 'الخطيب', en: 'Ahmad Al-Khatib', nat: 'SY', g: 'MALE', dept: 'KITCHEN', title: 'طاهي مشاوي', basic: 4200, hire: '2019-11-03', shift: 'E' },
  { key: 'o9', b: 'OLAYA', first: 'جورج', last: 'حداد', en: 'George Haddad', nat: 'LB', g: 'MALE', dept: 'KITCHEN', title: 'طاهي حلويات شرقية', basic: 4500, hire: '2021-08-22', shift: 'M' },
  { key: 'o10', b: 'OLAYA', first: 'محمود', last: 'عبدالعزيز', en: 'Mahmoud Abdelaziz', nat: 'EG', g: 'MALE', dept: 'SERVICE', title: 'نادل', basic: 2800, hire: '2022-10-09', shift: 'E' },
  { key: 'o11', b: 'OLAYA', first: 'جون', last: 'سانتوس', en: 'John Santos', nat: 'PH', g: 'MALE', dept: 'SERVICE', title: 'نادل', basic: 2600, hire: '2023-01-15', shift: 'M' },
  { key: 'o12', b: 'OLAYA', first: 'محمد', last: 'عرفان', en: 'Muhammad Irfan', nat: 'PK', g: 'MALE', dept: 'DELIVERY', title: 'سائق توصيل', basic: 2200, hire: '2024-03-03', shift: 'E' },
  { key: 'mgrMalqa', b: 'MALQA', first: 'بندر', last: 'المطيري', en: 'Bandar Al-Mutairi', nat: 'SA', g: 'MALE', dept: 'SERVICE', title: 'مدير فرع الملقا', basic: 10500, hire: '2019-02-17', shift: 'M', role: 'BM', other: 800 },
  { key: 'm2', b: 'MALQA', first: 'هيفاء', last: 'الغامدي', en: 'Haifa Al-Ghamdi', nat: 'SA', g: 'FEMALE', dept: 'SERVICE', title: 'كاشير', basic: 4800, hire: '2024-06-02', shift: 'M' },
  { key: 'm3', b: 'MALQA', first: 'عبدالرحمن', last: 'السبيعي', en: 'Abdulrahman Al-Subaie', nat: 'SA', g: 'MALE', dept: 'SERVICE', title: 'مضيف استقبال', basic: 4500, hire: '2025-01-19', shift: 'E' },
  { key: 'm4', b: 'MALQA', first: 'نواف', last: 'العنزي', en: 'Nawaf Al-Anazi', nat: 'SA', g: 'MALE', dept: 'DELIVERY', title: 'منسق مشتريات', basic: 6000, hire: '2021-04-11', shift: 'A' },
  { key: 'm5', b: 'MALQA', first: 'خالد', last: 'الحمصي', en: 'Khaled Al-Homsi', nat: 'SY', g: 'MALE', dept: 'KITCHEN', title: 'طاهي شاورما', basic: 3800, hire: '2018-07-29', shift: 'M' },
  { key: 'm6', b: 'MALQA', first: 'سامح', last: 'السيد', en: 'Sameh El-Sayed', nat: 'EG', g: 'MALE', dept: 'KITCHEN', title: 'مساعد طاهٍ', basic: 2500, hire: '2023-09-10', shift: 'E' },
  { key: 'm7', b: 'MALQA', first: 'مارك', last: 'ريّيس', en: 'Mark Reyes', nat: 'PH', g: 'MALE', dept: 'SERVICE', title: 'نادل', basic: 2600, hire: '2024-02-04', shift: 'M' },
  { key: 'm8', b: 'MALQA', first: 'راجيش', last: 'كومار', en: 'Rajesh Kumar', nat: 'IN', g: 'MALE', dept: 'SERVICE', title: 'نادل', basic: 2400, hire: '2022-12-18', shift: 'E' },
  { key: 'm9', b: 'MALQA', first: 'عمران', last: 'خان', en: 'Imran Khan', nat: 'PK', g: 'MALE', dept: 'DELIVERY', title: 'سائق توصيل', basic: 2100, hire: '2023-03-26', shift: 'M' },
  { key: 'm10', b: 'MALQA', first: 'رفيق', last: 'الإسلام', en: 'Rafiqul Islam', nat: 'BD', g: 'MALE', dept: 'KITCHEN', title: 'عامل مطبخ', basic: 1800, hire: '2024-08-11', shift: 'E' },
  { key: 'mgrJeddah', b: 'JEDDAH', first: 'ياسر', last: 'الشهري', en: 'Yasser Al-Shehri', nat: 'SA', g: 'MALE', dept: 'SERVICE', title: 'مدير فرع التحلية', basic: 10500, hire: '2018-04-08', shift: 'M', role: 'BM', other: 800 },
  { key: 'j2', b: 'JEDDAH', first: 'أمل', last: 'المالكي', en: 'Amal Al-Maliki', nat: 'SA', g: 'FEMALE', dept: 'SERVICE', title: 'كاشير', basic: 4800, hire: '2023-11-05', shift: 'E' },
  { key: 'j3', b: 'JEDDAH', first: 'مازن', last: 'البقمي', en: 'Mazen Al-Baqami', nat: 'SA', g: 'MALE', dept: 'SERVICE', title: 'نادل أول', basic: 4600, hire: '2026-09-15', shift: 'M' },
  { key: 'j4', b: 'JEDDAH', first: 'باسل', last: 'الدمشقي', en: 'Basel Al-Dimashqi', nat: 'SY', g: 'MALE', dept: 'KITCHEN', title: 'طاهٍ أول', basic: 5500, hire: '2017-10-15', shift: 'M' },
  { key: 'j5', b: 'JEDDAH', first: 'إيلي', last: 'نصار', en: 'Elie Nassar', nat: 'LB', g: 'MALE', dept: 'KITCHEN', title: 'طاهي مقبلات', basic: 4000, hire: '2020-06-21', shift: 'E' },
  { key: 'j6', b: 'JEDDAH', first: 'وليد', last: 'فتحي', en: 'Waleed Fathy', nat: 'EG', g: 'MALE', dept: 'KITCHEN', title: 'مساعد طاهٍ', basic: 2500, hire: '2022-05-08', shift: 'M' },
  { key: 'j7', b: 'JEDDAH', first: 'عمر', last: 'باوزير', en: 'Omar Bawazir', nat: 'YE', g: 'MALE', dept: 'SERVICE', title: 'نادل', basic: 2600, hire: '2021-09-12', shift: 'E' },
  { key: 'j8', b: 'JEDDAH', first: 'عثمان', last: 'الطيب', en: 'Osman Eltayeb', nat: 'SD', g: 'MALE', dept: 'SERVICE', title: 'نادل', basic: 2500, hire: '2024-04-14', shift: 'M' },
  { key: 'j9', b: 'JEDDAH', first: 'شهزاد', last: 'أحمد', en: 'Shahzad Ahmed', nat: 'PK', g: 'MALE', dept: 'DELIVERY', title: 'سائق توصيل', basic: 2100, hire: '2025-07-06', shift: 'E' },
  { key: 'mgrDammam', b: 'DAMMAM', first: 'سامر', last: 'العلي', en: 'Samer Al-Ali', nat: 'JO', g: 'MALE', dept: 'SERVICE', title: 'مدير فرع الكورنيش', basic: 9500, hire: '2019-08-18', shift: 'M', role: 'BM', other: 600 },
  { key: 'd2', b: 'DAMMAM', first: 'سلطان', last: 'الرشيدي', en: 'Sultan Al-Rashidi', nat: 'SA', g: 'MALE', dept: 'SERVICE', title: 'كاشير', basic: 4800, hire: '2025-03-09', shift: 'E' },
  { key: 'd3', b: 'DAMMAM', first: 'حسام', last: 'النجار', en: 'Hussam Al-Najjar', nat: 'SY', g: 'MALE', dept: 'KITCHEN', title: 'طاهي مشاوي', basic: 4200, hire: '2020-02-02', shift: 'M' },
  { key: 'd4', b: 'DAMMAM', first: 'أنيل', last: 'شارما', en: 'Anil Sharma', nat: 'IN', g: 'MALE', dept: 'KITCHEN', title: 'طاهي تحضير', basic: 2600, hire: '2021-12-05', shift: 'E' },
  { key: 'd5', b: 'DAMMAM', first: 'رامون', last: 'كروز', en: 'Ramon Cruz', nat: 'PH', g: 'MALE', dept: 'SERVICE', title: 'نادل', basic: 2600, hire: '2023-06-18', shift: 'M' },
  { key: 'd6', b: 'DAMMAM', first: 'إسلام', last: 'رمضان', en: 'Eslam Ramadan', nat: 'EG', g: 'MALE', dept: 'SERVICE', title: 'نادل', basic: 2700, hire: '2022-08-28', shift: 'E' },
  { key: 'd7', b: 'DAMMAM', first: 'محمد', last: 'حسين', en: 'Mohammed Hossain', nat: 'BD', g: 'MALE', dept: 'KITCHEN', title: 'عامل مطبخ', basic: 1800, hire: '2024-10-20', shift: 'M' },
  { key: 'd8', b: 'DAMMAM', first: 'بيشال', last: 'تامانغ', en: 'Bishal Tamang', nat: 'NP', g: 'MALE', dept: 'DELIVERY', title: 'سائق توصيل', basic: 2000, hire: '2025-05-11', shift: 'E' },
  { key: 'd9', b: 'DAMMAM', first: 'علي', last: 'رضا', en: 'Ali Raza', nat: 'PK', g: 'MALE', dept: 'DELIVERY', title: 'سائق توصيل', basic: 2000, hire: '2024-01-21', shift: 'M' },
  { key: 'left', b: 'MALQA', first: 'كريم', last: 'منصور', en: 'Karim Mansour', nat: 'EG', g: 'MALE', dept: 'SERVICE', title: 'نادل', basic: 2600, hire: '2021-03-14', shift: 'E', terminated: { date: 'PREV2-20', reason: 'RESIGNATION' } },
];
const HABITUALLY_LATE = new Set(['o10', 'm8', 'd6']);
/** Saudis first registered in GOSI on/after 2024-07-03 → NEW Social Insurance Law regime (registered on their hire date). */
const GOSI_FIRST_REGISTERED: Record<string, string> = { m3: '2025-01-19', d2: '2025-03-09', j3: '2026-09-15' };
/** Saudis whose contracts are not yet documented in Qiwa (so the demo shows «تنبيه نطاقات»); everyone else is documented on hire. */
const QIWA_UNDOCUMENTED = new Set(['o6', 'j3']);

function plusMonths(d: string, n: number): string {
  const x = day(d);
  x.setUTCMonth(x.getUTCMonth() + n);
  return x.toISOString().slice(0, 10);
}
const ts = (d: string, hours = 0) => new Date(day(d).getTime() + hours * 3600000).toISOString();

export function buildSeed(now: Date = new Date()): DB {
  seedState = 20260223;
  const today = todayStr(now);
  const db = emptyDb(today);
  const svc = new Services(db);
  const createdAt = now.toISOString();
  const companyId = DEMO_COMPANY_ID;
  const thisPeriod = periodOf(today);
  const prev1 = addMonths(thisPeriod, -1);
  const prev2 = addMonths(thisPeriod, -2);
  const prev3 = addMonths(thisPeriod, -3);
  const attStart = periodRange(prev1).start;
  const rel = (n: number) => addDays(today, n);

  // ---------- company ----------
  db.companies.push({
    id: companyId, nameAr: 'مطاعم ورد الشام', nameEn: 'Ward Al-Sham Restaurants', crNumber: '1010654321', establishmentId: '7001845236',
    gosiNumber: '512345678', vatNumber: '310456789100003', sector: 'RESTAURANTS', city: 'الرياض', iban: saudiIban('80'), bankCode: '80',
    weekendDays: [5, 6], payrollDay: 27, employeesCount: 40, createdAt: ts(rel(-120)), updatedAt: createdAt,
    ...lifecycleDefaults(),
    status: 'ACTIVE', plan: 'GROWTH', billingCycle: 'MONTHLY', maxEmployees: 60, activatedAt: ts(rel(-119), 10),
    subscriptionEndsAt: endOfDay(plusMonths(today, 10)), adminNotes: 'عميل مرجعي — حساب العرض التجريبي العام',
    lastActivityAt: new Date(now.getTime() - 2 * 3600000).toISOString(),
  });
  const leaveTypes: Record<string, string> = {};
  for (const p of SAUDI_LEAVE_POLICIES) {
    const id = `lt-${p.code.toLowerCase()}`;
    leaveTypes[p.code] = id;
    db.leaveTypes.push({ id, companyId, code: p.code, nameAr: p.nameAr, nameEn: p.nameEn, paid: p.paid, maxDaysPerYear: p.maxDaysPerYear, createdAt });
  }

  // ---------- holidays ----------
  const holidays: [string, string, string][] = [
    ['2026-02-22', 'يوم التأسيس', 'Founding Day'], ['2026-03-19', 'عطلة عيد الفطر', 'Eid Al-Fitr holiday'], ['2026-03-20', 'عيد الفطر', 'Eid Al-Fitr'],
    ['2026-03-21', 'عطلة عيد الفطر', 'Eid Al-Fitr holiday'], ['2026-03-22', 'عطلة عيد الفطر', 'Eid Al-Fitr holiday'], ['2026-05-26', 'يوم عرفة', 'Arafat Day'],
    ['2026-05-27', 'عيد الأضحى', 'Eid Al-Adha'], ['2026-05-28', 'عطلة عيد الأضحى', 'Eid Al-Adha holiday'], ['2026-05-29', 'عطلة عيد الأضحى', 'Eid Al-Adha holiday'],
    ['2026-09-23', 'اليوم الوطني', 'Saudi National Day'], ['2027-02-22', 'يوم التأسيس', 'Founding Day'],
  ];
  holidays.forEach(([d, ar, en], i) => db.holidays.push({ id: `hol-${i + 1}`, companyId, date: d, nameAr: ar, nameEn: en, createdAt }));
  const leaveOpts = { weekendDays: [5, 6], holidays: holidays.map((h) => h[0]) };

  // ---------- branches & departments ----------
  const branchDefs: Record<BranchKey, { id: string; nameAr: string; nameEn: string; city: string; address: string; lat: number; lng: number; radiusMeters: number }> = {
    OLAYA: { id: 'br-olaya', nameAr: 'فرع العليا', nameEn: 'Riyadh – Olaya', city: 'الرياض', address: 'شارع العليا العام، حي العليا', lat: 24.6948, lng: 46.6853, radiusMeters: 200 },
    MALQA: { id: 'br-malqa', nameAr: 'فرع الملقا', nameEn: 'Riyadh – Al-Malqa', city: 'الرياض', address: 'طريق أنس بن مالك، حي الملقا', lat: 24.8075, lng: 46.6125, radiusMeters: 150 },
    JEDDAH: { id: 'br-jeddah', nameAr: 'فرع التحلية', nameEn: 'Jeddah – Tahlia', city: 'جدة', address: 'شارع التحلية، حي الأندلس', lat: 21.5491, lng: 39.1497, radiusMeters: 150 },
    DAMMAM: { id: 'br-dammam', nameAr: 'فرع كورنيش الدمام', nameEn: 'Dammam – Corniche', city: 'الدمام', address: 'طريق الكورنيش، حي الشاطئ', lat: 26.4473, lng: 50.1135, radiusMeters: 150 },
  };
  Object.values(branchDefs).forEach((b, i) => db.branches.push({ ...b, companyId, managerEmployeeId: null, createdAt: ts(rel(-120), i), updatedAt: createdAt }));
  const deptDefs: [DeptKey, string][] = [['ADMIN', 'الإدارة العامة'], ['FINHR', 'المالية والموارد البشرية'], ['KITCHEN', 'المطبخ'], ['SERVICE', 'الصالة وخدمة العملاء'], ['DELIVERY', 'التوصيل والمشتريات']];
  const depts = {} as Record<DeptKey, string>;
  deptDefs.forEach(([k, name], i) => {
    depts[k] = `dep-${k.toLowerCase()}`;
    db.departments.push({ id: depts[k], companyId, name, parentId: k === 'ADMIN' ? null : 'dep-admin', createdAt: ts(rel(-120), i) });
  });

  // ---------- shifts ----------
  const ALL_WEEK = [0, 1, 2, 3, 4, 5, 6];
  const shifts = {} as Record<BranchKey, Record<ShiftKind, { id: string; startTime: string; endTime: string; breakMinutes: number; graceMinutes: number; days: number[] }>>;
  for (const k of Object.keys(branchDefs) as BranchKey[]) {
    const bid = branchDefs[k].id;
    const mk = (kind: ShiftKind, name: string, startTime: string, endTime: string, graceMinutes: number, days: number[], color: string) => {
      const s = { id: `sh-${k.toLowerCase()}-${kind.toLowerCase()}`, companyId, branchId: bid, name, startTime, endTime, breakMinutes: 60, graceMinutes, days, color, createdAt };
      db.shifts.push(s);
      return s;
    };
    shifts[k] = {
      M: mk('M', 'الوردية الصباحية', '08:00', '16:00', 10, ALL_WEEK, '#14D1C3'),
      E: mk('E', 'الوردية المسائية', '16:00', '00:00', 10, ALL_WEEK, '#1B3A63'),
      A: mk('A', 'الدوام الإداري', '09:00', '17:00', 15, [0, 1, 2, 3, 4], '#0369A1'),
    };
  }

  // ---------- employees ----------
  const emp: Record<string, { id: string; seed: Seed; offDay: number; hire: string; term: string | null; rec: Employee }> = {};
  let n = 0;
  for (const p of PEOPLE) {
    n++;
    const isSaudi = p.nat === 'SA';
    const bank = BANKS[randInt(0, BANKS.length - 1)];
    const iban = saudiIban(bank);
    const nationalId = (isSaudi ? '1' : '2') + digits(9);
    const birthYear = p.role ? randInt(1978, 1988) : randInt(1985, 2002);
    const idExpiry = isSaudi ? rel(randInt(400, 2500)) : rel(randInt(60, 400));
    const terminationDate = p.terminated ? p.terminated.date.replace('PREV2', prev2) : null;
    const years = (day(today).getTime() - day(p.hire).getTime()) / (365 * 86400000);
    const birthDate = `${birthYear}-${String(randInt(1, 12)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`;
    const maritalStatus = rand() < 0.6 ? 'MARRIED' : 'SINGLE';
    const passportNumber = isSaudi ? null : `${p.nat}${digits(7)}`;
    const passportExpiry = isSaudi ? null : rel(randInt(200, 1800));
    const phone = `+9665${digits(8)}`;
    const contractEndDate = isSaudi ? null : rel(randInt(45, 700));
    const rec: Employee = {
      id: seedEmployeeId(n), companyId, employeeNumber: `EMP-${String(n).padStart(4, '0')}`, firstNameAr: p.first, lastNameAr: p.last, fullNameEn: p.en,
      nationality: p.nat, isSaudi, gender: p.g, birthDate, maritalStatus, nationalId, idExpiry, passportNumber, passportExpiry, phone,
      email: `${p.en.split(' ')[0].toLowerCase()}.${p.key}@wardalsham.sa`, branchId: branchDefs[p.b].id, departmentId: depts[p.dept], managerId: null,
      jobTitle: p.title, hireDate: p.hire, contractType: isSaudi ? 'UNLIMITED' : 'FIXED', contractEndDate, probationEndDate: addDays(p.hire, 90),
      status: p.terminated ? 'TERMINATED' : 'ACTIVE', terminationDate, terminationReason: p.terminated?.reason ?? null, basicSalary: p.basic,
      housingAllowance: Math.round(p.basic * 0.25), transportAllowance: Math.max(300, Math.round(p.basic * 0.1)), otherAllowances: p.other ?? 0,
      iban, bankCode: bank, gosiRegistered: true, gosiFirstRegisteredAt: GOSI_FIRST_REGISTERED[p.key] ?? null, hoursPerDay: 8, avatarColor: COLORS[n % COLORS.length], annualLeaveCarryOver: years > 1 ? randInt(4, 15) : 0,
      qiwaDocumented: !QIWA_UNDOCUMENTED.has(p.key), qiwaDocumentedAt: QIWA_UNDOCUMENTED.has(p.key) ? null : ts(p.hire),
      createdAt: ts(p.hire), updatedAt: createdAt,
    };
    db.employees.push(rec);
    emp[p.key] = { id: rec.id, seed: p, offDay: p.shift === 'A' ? 5 : (n * 3) % 7, hire: p.hire, term: terminationDate, rec };
  }
  emp.emp.offDay = 5;
  for (const e of Object.values(emp)) {
    const p = e.seed;
    if (p.role === 'GM') e.rec.managerId = null;
    else if (p.role === 'BM' || p.key === 'hr' || p.key === 'payroll') e.rec.managerId = emp.gm.id;
    else e.rec.managerId = Object.values(emp).find((x) => x.seed.role === 'BM' && x.seed.b === p.b)?.id ?? emp.gm.id;
  }
  for (const k of Object.keys(branchDefs) as BranchKey[]) {
    db.branches.find((b) => b.id === branchDefs[k].id)!.managerEmployeeId = Object.values(emp).find((x) => x.seed.role === 'BM' && x.seed.b === k)!.id;
  }

  // ---------- users ----------
  const userDefs: { id: string; email: string; name: string; role: Role; empKey?: string }[] = [
    { id: 'usr-owner', email: 'owner@shuoon.demo', name: 'عبدالله الراشد', role: 'OWNER' },
    { id: 'usr-hr', email: 'hr@shuoon.demo', name: 'نورة القحطاني', role: 'HR_ADMIN', empKey: 'hr' },
    { id: 'usr-payroll', email: 'payroll@shuoon.demo', name: 'ماجد الحربي', role: 'PAYROLL', empKey: 'payroll' },
    { id: 'usr-manager', email: 'manager@shuoon.demo', name: 'فهد العتيبي', role: 'BRANCH_MANAGER', empKey: 'mgrOlaya' },
    { id: 'usr-employee', email: 'employee@shuoon.demo', name: 'سعود الدوسري', role: 'EMPLOYEE', empKey: 'emp' },
  ];
  const users = {} as Record<Role, { id: string; name: string; companyId: string }>;
  for (const u of userDefs) {
    db.users.push({ id: u.id, companyId, email: u.email, password: DEMO_PASSWORD, name: u.name, role: u.role, employeeId: u.empKey ? emp[u.empKey].id : null, isActive: true, lastLoginAt: null, createdAt: ts(rel(-120)), updatedAt: createdAt });
    users[u.role] = { id: u.id, name: u.name, companyId };
  }

  // ---------- documents ----------
  const special: Record<string, { type: 'IQAMA' | 'PASSPORT' | 'INSURANCE' | 'CONTRACT'; offset: number }> = {
    o8: { type: 'IQAMA', offset: -6 }, m6: { type: 'IQAMA', offset: 12 }, j7: { type: 'IQAMA', offset: 25 }, d4: { type: 'IQAMA', offset: 48 },
    m9: { type: 'PASSPORT', offset: 70 }, d7: { type: 'INSURANCE', offset: -15 }, o11: { type: 'INSURANCE', offset: 20 },
    j5: { type: 'CONTRACT', offset: 55 }, d5: { type: 'CONTRACT', offset: 85 },
  };
  const doc = (employeeId: string, type: string, number: string | null, issueDate: string | null, expiryDate: string | null, note: string | null = null) =>
    db.documents.push({ id: nextId(db, 'doc'), companyId, employeeId, type, number, issueDate, expiryDate, note, createdAt });
  for (const e of Object.values(emp)) {
    if (e.seed.terminated) continue;
    const full = e.rec;
    const sp = special[e.seed.key];
    const exp = (type: string, def: string | null) => (sp && sp.type === type ? rel(sp.offset) : def);
    if (!full.isSaudi) {
      const iqamaExp = exp('IQAMA', full.idExpiry)!;
      doc(e.id, 'IQAMA', full.nationalId, addDays(iqamaExp, -365), iqamaExp);
      if (sp?.type === 'IQAMA') full.idExpiry = iqamaExp;
      const passExp = exp('PASSPORT', full.passportExpiry)!;
      doc(e.id, 'PASSPORT', full.passportNumber, addDays(passExp, -3650), passExp);
      if (sp?.type === 'PASSPORT') full.passportExpiry = passExp;
    }
    const contractExp = exp('CONTRACT', full.contractEndDate);
    doc(e.id, 'CONTRACT', `CT-${full.employeeNumber}`, full.hireDate, contractExp, full.contractType === 'FIXED' ? 'عقد محدد المدة' : 'عقد غير محدد المدة');
    if (sp?.type === 'CONTRACT') full.contractEndDate = contractExp;
    if (sp?.type === 'INSURANCE' || rand() < 0.5) {
      const insExp = exp('INSURANCE', rel(randInt(120, 330)))!;
      doc(e.id, 'INSURANCE', `BUPA-${digits(8)}`, addDays(insExp, -365), insExp, 'التأمين الطبي');
    }
    if (e.seed.dept === 'KITCHEN' || e.seed.dept === 'SERVICE') {
      const issue = rel(-randInt(30, 300));
      doc(e.id, 'CERTIFICATE', `HC-${digits(6)}`, issue, rel(randInt(95, 360)), 'الشهادة الصحية (بلدي)');
    }
  }

  // ---------- leave requests ----------
  const prev1Start = periodRange(prev1).start;
  const addLeave = (key: string, code: string, start: string, end: string, status: Approval, reason: string, approver?: { id: string; name: string }, comment?: string) => {
    const decided = status === 'APPROVED' || status === 'REJECTED';
    db.leaves.push({
      id: nextId(db, 'lv'), companyId, employeeId: emp[key].id, leaveTypeId: leaveTypes[code], startDate: start, endDate: end, days: countLeaveDays(start, end, leaveOpts),
      reason, status, approverId: decided ? approver?.id ?? null : null, approverName: decided ? approver?.name ?? null : null,
      decidedAt: status === 'PENDING' ? null : ts(addDays(start, -5)), comment: comment ?? null, createdAt: ts(addDays(start, -10)),
    });
  };
  const hrU = users.HR_ADMIN;
  const mgrU = users.BRANCH_MANAGER;
  addLeave('emp', 'ANNUAL', rel(-40), rel(-37), 'APPROVED', 'إجازة عائلية', mgrU);
  addLeave('emp', 'ANNUAL', rel(20), rel(24), 'PENDING', 'سفر إلى أبها');
  addLeave('o9', 'ANNUAL', rel(-2), rel(5), 'APPROVED', 'زيارة الأهل في بيروت', hrU, 'إجازة سعيدة');
  addLeave('m5', 'SICK', addDays(prev1Start, 9), addDays(prev1Start, 11), 'APPROVED', 'التهاب حاد — تقرير طبي مرفق', hrU);
  // 18 unpaid calendar days (60% of the wage): the last run's WPS pre-upload check shows a DEDUCTION_OVER_HALF warning (net still > 0).
  addLeave('j6', 'UNPAID', addDays(prev1Start, 5), addDays(prev1Start, 22), 'APPROVED', 'سفر طارئ — ظرف عائلي', hrU);
  addLeave('o7', 'ANNUAL', addDays(prev1Start, 2), addDays(prev1Start, 8), 'APPROVED', 'إجازة سنوية', hrU);
  addLeave('m7', 'ANNUAL', rel(7), rel(9), 'PENDING', 'تجديد جواز السفر في السفارة');
  addLeave('d3', 'ANNUAL', rel(30), rel(34), 'PENDING', 'إجازة سنوية');
  addLeave('d2', 'MARRIAGE', rel(10), rel(14), 'PENDING', 'زواج — بارك الله لكم');
  addLeave('o6', 'ANNUAL', rel(3), rel(4), 'PENDING', 'مراجعة جامعية');
  addLeave('j8', 'ANNUAL', rel(-20), rel(-16), 'REJECTED', 'إجازة', hrU, 'ضغط العمل في موسم جدة، يرجى اختيار موعد آخر');
  addLeave('o10', 'ANNUAL', rel(-12), rel(-10), 'REJECTED', 'سفر', mgrU, 'تجاوز عدد الإجازات المتزامنة في الفرع');
  addLeave('m2', 'ANNUAL', rel(15), rel(16), 'CANCELLED', 'تم تأجيل السفر');
  addLeave('j2', 'SICK', rel(-8), rel(-8), 'APPROVED', 'مراجعة مستشفى', hrU);
  emp.o9.rec.status = 'ON_LEAVE';
  const approvedLeaves = db.leaves.filter((l) => l.status === 'APPROVED');
  const onLeave = (employeeId: string, d: string) => approvedLeaves.some((l) => l.employeeId === employeeId && l.startDate <= d && l.endDate >= d);

  // ---------- roster + attendance ----------
  const rosterEnd = addDays(today, 13 - weekday(today));
  for (const e of Object.values(emp)) {
    const sh = shifts[e.seed.b][e.seed.shift];
    const b = branchDefs[e.seed.b];
    for (const d of eachDay(attStart, rosterEnd)) {
      if (d < e.hire || (e.term && d > e.term)) continue;
      const wd = weekday(d);
      if (!sh.days.includes(wd) || wd === e.offDay) continue;
      db.assignments.push({ id: nextId(db, 'asg'), companyId, employeeId: e.id, shiftId: sh.id, date: d });
      if (d > today || onLeave(e.id, d)) continue;
      const shiftStart = riyadhDateTime(d, sh.startTime);
      const shiftDef = { startTime: sh.startTime, endTime: sh.endTime, breakMinutes: sh.breakMinutes, graceMinutes: sh.graceMinutes };
      const base = { companyId, employeeId: e.id, date: d, shiftId: sh.id, checkOut: null, checkOutLat: null, checkOutLng: null, earlyLeaveMinutes: 0, overtimeMinutes: 0, source: 'SEED', note: null, createdAt, updatedAt: createdAt };
      if (d === today) {
        if (e.seed.key === 'emp' || e.seed.key === 'mgrOlaya') continue;
        if (now.getTime() < shiftStart.getTime() + 20 * 60000) continue;
        const r = rand();
        if (r < 0.08) continue;
        const lateBy = r < 0.25 ? randInt(12, 40) : randInt(-12, 6);
        const checkIn = new Date(shiftStart.getTime() + lateBy * 60000);
        const m = calculateAttendance(shiftDef, checkIn, null);
        db.attendance.push({ ...base, id: nextId(db, 'att'), checkIn: checkIn.toISOString(), checkInLat: b.lat, checkInLng: b.lng, workedMinutes: 0, lateMinutes: m.lateMinutes, status: m.status });
        continue;
      }
      const lateRate = HABITUALLY_LATE.has(e.seed.key) ? 0.35 : 0.1;
      const r = rand();
      if (r < 0.035) {
        db.attendance.push({ ...base, id: nextId(db, 'att'), checkIn: null, checkInLat: null, checkInLng: null, workedMinutes: 0, lateMinutes: 0, status: 'ABSENT', note: 'غياب بدون عذر' });
        continue;
      }
      const lateBy = r < 0.035 + lateRate ? randInt(12, 55) : randInt(-12, 6);
      const checkIn = new Date(shiftStart.getTime() + lateBy * 60000);
      const extra = rand() < 0.12 ? randInt(60, 150) : randInt(-5, 12);
      const checkOut = new Date(shiftStart.getTime() + (480 + extra) * 60000);
      const m = calculateAttendance(shiftDef, checkIn, checkOut);
      const lat = b.lat + (rand() - 0.5) * 0.0006;
      const lng = b.lng + (rand() - 0.5) * 0.0006;
      db.attendance.push({
        ...base, id: nextId(db, 'att'), checkIn: checkIn.toISOString(), checkOut: checkOut.toISOString(), checkInLat: lat, checkInLng: lng,
        workedMinutes: m.workedMinutes, lateMinutes: m.lateMinutes, earlyLeaveMinutes: m.earlyLeaveMinutes, overtimeMinutes: m.overtimeMinutes, status: m.status,
      });
    }
  }

  // ---------- loans ----------
  for (const l of [
    { key: 'o8', amount: 6000, monthly: 1000, start: prev3, note: 'سلفة ظروف عائلية' },
    { key: 'm8', amount: 2400, monthly: 400, start: prev2, note: 'سلفة شراء أثاث' },
    { key: 'j7', amount: 1500, monthly: 500, start: prev3, note: 'سلفة تجديد إقامة المرافقين' },
    { key: 'd5', amount: 3000, monthly: 500, start: prev1, note: 'سلفة سفر' },
  ]) {
    db.loans.push({ id: nextId(db, 'loan'), companyId, employeeId: emp[l.key].id, amount: l.amount, monthlyDeduction: l.monthly, remaining: l.amount, startPeriod: l.start, status: 'ACTIVE', note: l.note, requestId: null, createdAt: ts(`${l.start}-01`), updatedAt: createdAt });
  }

  // ---------- adjustments ----------
  const adj: [string, string, 'BONUS' | 'COMMISSION' | 'ALLOWANCE' | 'DEDUCTION' | 'PENALTY', number, string][] = [
    ['o7', prev2, 'BONUS', 1000, 'تقييم ممتاز من العملاء'], ['o12', prev2, 'COMMISSION', 350, 'عمولة طلبات التوصيل'],
    ['m9', prev1, 'COMMISSION', 420, 'عمولة طلبات التوصيل'], ['j4', prev1, 'BONUS', 750, 'مكافأة موسم الصيف'],
    ['d6', prev1, 'PENALTY', 150, 'تكرار التأخير'], ['mgrJeddah', prev1, 'ALLOWANCE', 500, 'بدل افتتاح ركن جديد'],
    ['o12', thisPeriod, 'COMMISSION', 300, 'عمولة طلبات التوصيل'], ['m8', thisPeriod, 'DEDUCTION', 120, 'تلف معدات'],
  ];
  for (const [key, period, type, amount, note] of adj) {
    db.adjustments.push({ id: nextId(db, 'adj'), companyId, employeeId: emp[key].id, period, type, amount, note, createdById: users.PAYROLL.id, createdAt: ts(`${period}-15`) });
  }

  // ---------- payroll (real engine) ----------
  const payrollUser = users.PAYROLL;
  for (const period of [prev3, prev2, prev1]) {
    const id = runId(period);
    db.runs.push({
      id, companyId, period, status: 'DRAFT', employeesCount: 0, totalGross: 0, totalDeductions: 0, totalNet: 0, totalGosiEmployer: 0, totalEmployerCost: 0,
      calculatedAt: null, approvedAt: null, approvedById: null, approvedByName: null, paidAt: null, wpsExportedAt: null, createdAt: ts(`${period}-24`), updatedAt: createdAt,
    });
    svc.calculateRun(companyId, id);
    const run = svc.approveRun(companyId, id, payrollUser);
    const paid = period !== prev1;
    run.calculatedAt = ts(`${period}-25`, 9);
    run.approvedAt = ts(`${period}-26`, 10);
    run.status = paid ? 'PAID' : 'APPROVED';
    run.paidAt = paid ? ts(`${period}-27`, 9) : null;
    run.wpsExportedAt = paid ? ts(`${period}-26`, 11) : null;
    if (paid) {
      const slips = db.payslips.filter((s) => s.payrollRunId === id);
      for (const u of db.users.filter((x) => x.employeeId && slips.some((s) => s.employeeId === x.employeeId))) {
        const slip = slips.find((s) => s.employeeId === u.employeeId)!;
        svc.notifyUsers(companyId, [u.id], `تم صرف راتب شهر ${period}`, 'قسيمة الراتب متاحة الآن في الخدمة الذاتية', svc.payslipLink(slip.id), { readAt: createdAt, createdAt: ts(`${period}-27`) });
      }
    }
  }

  // ---------- employee requests ----------
  const req = (key: string, type: string, title: string, details: string, status: Approval, extra: Partial<{ amount: number; payload: Record<string, unknown>; approver: { id: string; name: string }; decidedAt: string; comment: string; createdAt: string }> = {}) =>
    db.requests.push({
      id: nextId(db, 'req'), companyId, employeeId: emp[key].id, type, title, details, amount: extra.amount ?? null, payload: extra.payload ?? null, status,
      approverId: extra.approver?.id ?? null, approverName: extra.approver?.name ?? null, decidedAt: extra.decidedAt ? ts(extra.decidedAt) : null,
      comment: extra.comment ?? null, createdAt: ts(extra.createdAt ?? today),
    });
  req('emp', 'SALARY_CERTIFICATE', 'تعريف بالراتب لبنك الراجحي', 'لغرض فتح حساب تمويل', 'APPROVED', { approver: hrU, decidedAt: rel(-6), createdAt: rel(-7) });
  req('emp', 'EXPENSE_CLAIM', 'مطالبة شراء مستلزمات صالة', 'شراء مفارش طاولات عاجلة من السوق', 'PENDING', { amount: 385, createdAt: rel(-1) });
  req('o11', 'LOAN', 'طلب سلفة', 'مصاريف علاج أحد أفراد الأسرة', 'PENDING', { amount: 3000, payload: { months: 6 }, createdAt: rel(-2) });
  req('j5', 'EXIT_REENTRY', 'تأشيرة خروج وعودة', 'سفر إلى لبنان لمدة 30 يوماً', 'APPROVED', { payload: { from: rel(40), to: rel(70) }, approver: hrU, decidedAt: rel(-3), createdAt: rel(-5) });
  req('o10', 'ATTENDANCE_CORRECTION', 'نسيت تسجيل الحضور', 'تعطل الجوال وقت البصمة', 'PENDING', { payload: { date: rel(-3), checkIn: '16:02', checkOut: '00:05' }, createdAt: rel(-2) });
  req('m3', 'LETTER', 'خطاب لمن يهمه الأمر', 'للسفارة الأمريكية', 'REJECTED', { approver: hrU, decidedAt: rel(-9), comment: 'يرجى تحديد الجهة بالضبط وإعادة التقديم', createdAt: rel(-10) });
  req('d8', 'OTHER', 'طلب تغيير الوردية', 'أرغب في الانتقال للوردية الصباحية لظروف الدراسة', 'PENDING', { createdAt: rel(-4) });
  req('m8', 'SALARY_CERTIFICATE', 'تعريف بالراتب للسفارة', 'تأشيرة زيارة عائلية', 'CANCELLED', { createdAt: rel(-15), decidedAt: rel(-14) });

  // ---------- performance ----------
  const activeEmps = Object.values(emp).filter((e) => !e.seed.terminated && e.hire <= today);
  const goals = (scored: boolean): Goal[] => [
    { title: 'جودة العمل وخدمة العملاء', weight: 40, score: scored ? randInt(3, 5) : null },
    { title: 'الالتزام بالحضور والأنظمة', weight: 30, score: scored ? randInt(2, 5) : null },
    { title: 'العمل الجماعي والمبادرة', weight: 30, score: scored ? randInt(3, 5) : null },
  ];
  const score = (g: Goal[]) => {
    const s = g.filter((x) => x.score !== null);
    const w = s.reduce((a, x) => a + x.weight, 0);
    return w ? Math.round((s.reduce((a, x) => a + x.weight * (x.score as number), 0) / w) * 100) / 100 : null;
  };
  const year = today.slice(0, 4);
  db.cycles.push({ id: 'cyc-h1', companyId, name: `تقييم النصف الأول ${year}`, startDate: `${year}-01-01`, endDate: `${year}-06-30`, status: 'CLOSED', createdAt });
  db.cycles.push({ id: 'cyc-h2', companyId, name: `تقييم النصف الثاني ${year}`, startDate: `${year}-07-01`, endDate: `${year}-12-31`, status: 'ACTIVE', createdAt });
  for (const e of activeEmps) {
    const reviewerId = e.rec.managerId;
    if (e.hire < `${year}-06-30`) {
      const g = goals(true);
      db.reviews.push({ id: nextId(db, 'rev'), companyId, cycleId: 'cyc-h1', employeeId: e.id, reviewerId, goals: g, overallScore: score(g), status: 'SUBMITTED', comments: 'أداء جيد ومستمر', submittedAt: ts(`${year}-07-10`), createdAt, updatedAt: createdAt });
    }
    const submitted = rand() < 0.4;
    const g = goals(submitted);
    db.reviews.push({ id: nextId(db, 'rev'), companyId, cycleId: 'cyc-h2', employeeId: e.id, reviewerId, goals: g, overallScore: score(g), status: submitted ? 'SUBMITTED' : 'PENDING', comments: submitted ? 'ملتزم ويحتاج تطويراً في مهارات البيع الإضافي' : null, submittedAt: submitted ? ts(rel(-randInt(1, 10))) : null, createdAt, updatedAt: createdAt });
  }

  // ---------- recruitment ----------
  const job1 = jobId(1);
  const job2 = jobId(2);
  db.jobUsed = 2;
  db.jobs.push({ id: job1, companyId, title: 'طاهٍ شامي أول', branchId: 'br-jeddah', departmentId: 'dep-kitchen', employmentType: 'FULL_TIME', description: 'خبرة 5 سنوات على الأقل في المطبخ الشامي (مشاوي، مقبلات، فتّات). يفضل من عمل في مطاعم فاخرة.', status: 'OPEN', createdAt: ts(rel(-20)), updatedAt: createdAt });
  db.jobs.push({ id: job2, companyId, title: 'مشرف صالة (سعودي)', branchId: 'br-dammam', departmentId: 'dep-service', employmentType: 'FULL_TIME', description: 'وظيفة مخصصة للسعوديين لرفع نسبة التوطين في فرع الكورنيش. خبرة في خدمة العملاء وإدارة فريق.', status: 'OPEN', createdAt: ts(rel(-2)), updatedAt: createdAt });
  const cands: [string, string, string, string, string, number, string, string?][] = [
    [job1, 'رامي الحلبي', 'rami.h@mail.com', '+963944000111', 'SY', 6500, 'INTERVIEW', 'مقابلة عملية يوم الأحد'],
    [job1, 'طارق منصور', 'tarek.m@mail.com', '+201001112223', 'EG', 5200, 'SCREENING'],
    [job1, 'جاد عون', 'jad.aoun@mail.com', '+96170111222', 'LB', 7000, 'OFFER', 'عرض مرسل — بانتظار الرد'],
    [job1, 'فراس العمر', 'firas@mail.com', '+962790001122', 'JO', 6000, 'APPLIED'],
    [job1, 'نبيل قاسم', 'nabil.q@mail.com', '+963933222111', 'SY', 8000, 'REJECTED', 'الراتب المتوقع أعلى من الميزانية'],
    [job2, 'عبدالإله الدوسري', 'abdulelah@mail.com', '+966555111222', 'SA', 7500, 'INTERVIEW'],
    [job2, 'شهد العمري', 'shahad@mail.com', '+966555333444', 'SA', 7000, 'SCREENING'],
    [job2, 'محمد الخالدي', 'mkhalidi@mail.com', '+966555777888', 'SA', 6800, 'APPLIED'],
    [job2, 'راكان الهاجري', 'rakan@mail.com', '+966555999000', 'SA', 7200, 'HIRED', 'يبدأ أول الشهر القادم'],
  ];
  cands.forEach(([jid, name, email, phone, nationality, expectedSalary, stage, notes], i) =>
    db.candidates.push({ id: nextId(db, 'cand'), companyId, jobId: jid, name, email, phone, nationality, expectedSalary, notes: notes ?? null, stage, createdAt: ts(rel(-15), i), updatedAt: createdAt }));

  // ---------- announcements & notifications ----------
  const owner = users.OWNER;
  const ann = (title: string, body: string, author: { id: string; name: string }, at: string, branchId: string | null = null) =>
    db.announcements.push({ id: nextId(db, 'ann'), companyId, title, body, branchId, authorId: author.id, authorName: author.name, createdAt: at });
  ann('قائمة الشتاء الجديدة 🍲', 'نطلق قائمة الشتاء (شوربة العدس، الفتّة الشامية، السحلب) بداية الشهر القادم. التدريب الإلزامي لشؤون المطبخ والصالة يوم الأحد الساعة 3 عصراً.', owner, ts(rel(-2)));
  ann('تحديث سياسة الحضور', 'يرجى تسجيل الحضور والانصراف من تطبيق شؤون داخل نطاق الفرع فقط. فترة السماح 10 دقائق للورديات التشغيلية.', hrU, ts(rel(-9)));
  ann('زيارة تفتيش البلدية', 'زيارة تفتيش متوقعة هذا الأسبوع في فرع العليا. تأكدوا من سريان الشهادات الصحية ونظافة المطبخ.', hrU, ts(rel(-1)), 'br-olaya');
  ann('تهنئة باليوم الوطني 🇸🇦', 'كل عام والوطن بخير. تم صرف مكافأة اليوم الوطني مع راتب الشهر.', owner, ts(`${year}-09-22`));
  const n2 = (userId: string, title: string, body: string, link: string, daysAgo: number, read = false) =>
    svc.notifyUsers(companyId, [userId], title, body, link, { createdAt: ts(rel(-daysAgo)), readAt: read ? ts(rel(-daysAgo)) : null });
  n2(owner.id, 'وثائق تنتهي قريباً', 'يوجد إقامات وتأمينات تنتهي خلال 30 يوماً', '/documents', 1);
  n2(owner.id, `مسير رواتب ${prev1} بانتظار الصرف`, 'تم اعتماد المسير — يمكنك تنزيل ملف حماية الأجور', '/payroll', 3);
  n2(owner.id, 'فرع كورنيش الدمام في النطاق الأحمر', 'نسبة السعودة في الفرع أقل من 12%', '/saudization', 5);
  n2(hrU.id, 'طلب إجازة جديد', 'ريم الزهراني — إجازة سنوية (2 يوم)', '/leaves', 0);
  n2(hrU.id, 'طلب جديد: سلفة', 'جون سانتوس — طلب سلفة', '/requests', 2);
  n2(users.PAYROLL.id, `مسير ${prev1} معتمد`, 'بانتظار تأكيد الصرف', '/payroll', 3);
  n2(mgrU.id, 'طلب إجازة جديد', 'سعود الدوسري — إجازة سنوية', '/leaves', 1);
  n2(mgrU.id, 'زيارة تفتيش البلدية', 'زيارة تفتيش متوقعة هذا الأسبوع', '/announcements', 1);
  n2(users.EMPLOYEE.id, 'تمت الموافقة على طلبك: تعريف بالراتب', 'يمكنك استلامه من الموارد البشرية', '/me/requests', 6);
  n2(users.EMPLOYEE.id, 'إعلان: قائمة الشتاء الجديدة', 'التدريب الإلزامي يوم الأحد', '/announcements', 2);

  // ---------- audit trail ----------
  const audit = (u: { id: string; name: string }, action: string, entity: string, entityId: string | null, hoursAgo: number, data?: unknown) =>
    svc.audit({ ...u, companyId }, action, entity, entityId, data, new Date(now.getTime() - hoursAgo * 3600000).toISOString());
  audit(owner, 'REGISTER', 'Company', companyId, 24 * 120);
  [prev3, prev2, prev1].forEach((p, i) => {
    audit(payrollUser, 'CALCULATE', 'PayrollRun', runId(p), 24 * (90 - i * 30) + 5, { period: p });
    audit(payrollUser, 'APPROVE', 'PayrollRun', runId(p), 24 * (88 - i * 30), { period: p });
  });
  audit(hrU, 'CREATE', 'Employee', emp.j3.id, 24 * 38, { name: fullName(emp.j3.rec) });
  audit(hrU, 'APPROVE', 'LeaveRequest', null, 26, { employee: 'جورج حداد' });
  audit(hrU, 'CREATE', 'Announcement', null, 20);
  audit(mgrU, 'UPDATE', 'Roster', null, 8, { upserted: 42 });
  audit(hrU, 'APPROVE', 'EmployeeRequest', null, 5, { type: 'EXIT_REENTRY' });
  audit(owner, 'UPDATE', 'Company', companyId, 3, { payrollDay: 27 });
  audit(hrU, 'CREATE', 'JobOpening', job2, 2, { title: 'مشرف صالة (سعودي)' });

  // ---------- platform: admins, other subscriber companies, leads ----------
  seedPlatform(db, svc, now);
  // ---------- billing: invoices, outbox history ----------
  seedBilling(db, svc, now);
  svc.dirty = false;
  return db;
}
