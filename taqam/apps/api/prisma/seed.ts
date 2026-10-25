/* eslint-disable no-console */
/**
 * Demo seed — "مطاعم ورد الشام" / Ward Al-Sham Restaurants.
 * Idempotent: wipes the demo companies (cascade) + their platform events/leads and recreates them.
 * Platform admin portal data (admin@shuoon.demo, 7 extra companies, leads) comes from ./seed-platform.ts.
 * Payroll runs are produced by the real payroll engine (src/payroll/payroll.engine.ts → @taqam/core).
 */
import 'dotenv/config';
import { Prisma, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { calculateAttendance, countLeaveDays, SAUDI_LEAVE_POLICIES } from '@taqam/core';
import { approvePayrollRun, calculatePayrollRun } from '../src/payroll/payroll.engine';
import { EXTRA_COMPANY_NAMES_EN, EXTRA_OWNER_EMAILS, seedPlatform, wipePlatformDemo } from './seed-platform';
import { addDays, addMonths, day, dayStr, eachDay, periodOf, periodRange, riyadhDateTime, todayStr, weekday } from '../src/common/dates';

const prisma = new PrismaClient();
const PASSWORD = 'Shuoon@2026';
const DEMO_EMAILS = ['owner@shuoon.demo', 'hr@shuoon.demo', 'payroll@shuoon.demo', 'manager@shuoon.demo', 'employee@shuoon.demo'];

// ---------- deterministic PRNG ----------
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

/** Valid-format Saudi IBAN: SA + 2 check digits + 2-digit bank code + 18-digit account (ISO 7064 mod-97). */
function saudiIban(bankCode: string): string {
  const bban = bankCode + digits(18);
  const numeric = bban + '2810' + '00'; // S=28, A=10, check "00"
  let rem = 0;
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97;
  return `SA${String(98 - rem).padStart(2, '0')}${bban}`;
}

const BANKS = ['80', '10', '20', '05', '45', '55', '15', '30'];
const COLORS = ['#0F3D3E', '#145A5C', '#1F7A7C', '#F2A541', '#3B7EA1', '#2E8B57', '#C8553D', '#7A5C99'];

type BranchKey = 'OLAYA' | 'MALQA' | 'JEDDAH' | 'DAMMAM';
type DeptKey = 'KITCHEN' | 'SERVICE' | 'ADMIN' | 'FINHR' | 'DELIVERY';
type ShiftKind = 'M' | 'E' | 'A';

interface Seed {
  key: string;
  b: BranchKey;
  first: string;
  last: string;
  en: string;
  nat: string;
  g: 'MALE' | 'FEMALE';
  dept: DeptKey;
  title: string;
  basic: number;
  hire: string;
  shift: ShiftKind;
  role?: 'BM' | 'GM';
  other?: number;
  terminated?: { date: string; reason: string };
}

// prettier-ignore
const PEOPLE: Seed[] = [
  // ---- Riyadh Olaya (12, 6 Saudi) ----
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
  // ---- Riyadh Al-Malqa (10, 4 Saudi) ----
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
  // ---- Jeddah Tahlia (9, 3 Saudi) ----
  { key: 'mgrJeddah', b: 'JEDDAH', first: 'ياسر', last: 'الشهري', en: 'Yasser Al-Shehri', nat: 'SA', g: 'MALE', dept: 'SERVICE', title: 'مدير فرع التحلية', basic: 10500, hire: '2018-04-08', shift: 'M', role: 'BM', other: 800 },
  { key: 'j2', b: 'JEDDAH', first: 'أمل', last: 'المالكي', en: 'Amal Al-Maliki', nat: 'SA', g: 'FEMALE', dept: 'SERVICE', title: 'كاشير', basic: 4800, hire: '2023-11-05', shift: 'E' },
  { key: 'j3', b: 'JEDDAH', first: 'مازن', last: 'البقمي', en: 'Mazen Al-Baqami', nat: 'SA', g: 'MALE', dept: 'SERVICE', title: 'نادل أول', basic: 4600, hire: '2026-09-15', shift: 'M' },
  { key: 'j4', b: 'JEDDAH', first: 'باسل', last: 'الدمشقي', en: 'Basel Al-Dimashqi', nat: 'SY', g: 'MALE', dept: 'KITCHEN', title: 'طاهٍ أول', basic: 5500, hire: '2017-10-15', shift: 'M' },
  { key: 'j5', b: 'JEDDAH', first: 'إيلي', last: 'نصار', en: 'Elie Nassar', nat: 'LB', g: 'MALE', dept: 'KITCHEN', title: 'طاهي مقبلات', basic: 4000, hire: '2020-06-21', shift: 'E' },
  { key: 'j6', b: 'JEDDAH', first: 'وليد', last: 'فتحي', en: 'Waleed Fathy', nat: 'EG', g: 'MALE', dept: 'KITCHEN', title: 'مساعد طاهٍ', basic: 2500, hire: '2022-05-08', shift: 'M' },
  { key: 'j7', b: 'JEDDAH', first: 'عمر', last: 'باوزير', en: 'Omar Bawazir', nat: 'YE', g: 'MALE', dept: 'SERVICE', title: 'نادل', basic: 2600, hire: '2021-09-12', shift: 'E' },
  { key: 'j8', b: 'JEDDAH', first: 'عثمان', last: 'الطيب', en: 'Osman Eltayeb', nat: 'SD', g: 'MALE', dept: 'SERVICE', title: 'نادل', basic: 2500, hire: '2024-04-14', shift: 'M' },
  { key: 'j9', b: 'JEDDAH', first: 'شهزاد', last: 'أحمد', en: 'Shahzad Ahmed', nat: 'PK', g: 'MALE', dept: 'DELIVERY', title: 'سائق توصيل', basic: 2100, hire: '2025-07-06', shift: 'E' },
  // ---- Dammam Corniche (9, 1 Saudi → RED band) ----
  { key: 'mgrDammam', b: 'DAMMAM', first: 'سامر', last: 'العلي', en: 'Samer Al-Ali', nat: 'JO', g: 'MALE', dept: 'SERVICE', title: 'مدير فرع الكورنيش', basic: 9500, hire: '2019-08-18', shift: 'M', role: 'BM', other: 600 },
  { key: 'd2', b: 'DAMMAM', first: 'سلطان', last: 'الرشيدي', en: 'Sultan Al-Rashidi', nat: 'SA', g: 'MALE', dept: 'SERVICE', title: 'كاشير', basic: 4800, hire: '2025-03-09', shift: 'E' },
  { key: 'd3', b: 'DAMMAM', first: 'حسام', last: 'النجار', en: 'Hussam Al-Najjar', nat: 'SY', g: 'MALE', dept: 'KITCHEN', title: 'طاهي مشاوي', basic: 4200, hire: '2020-02-02', shift: 'M' },
  { key: 'd4', b: 'DAMMAM', first: 'أنيل', last: 'شارما', en: 'Anil Sharma', nat: 'IN', g: 'MALE', dept: 'KITCHEN', title: 'طاهي تحضير', basic: 2600, hire: '2021-12-05', shift: 'E' },
  { key: 'd5', b: 'DAMMAM', first: 'رامون', last: 'كروز', en: 'Ramon Cruz', nat: 'PH', g: 'MALE', dept: 'SERVICE', title: 'نادل', basic: 2600, hire: '2023-06-18', shift: 'M' },
  { key: 'd6', b: 'DAMMAM', first: 'إسلام', last: 'رمضان', en: 'Eslam Ramadan', nat: 'EG', g: 'MALE', dept: 'SERVICE', title: 'نادل', basic: 2700, hire: '2022-08-28', shift: 'E' },
  { key: 'd7', b: 'DAMMAM', first: 'محمد', last: 'حسين', en: 'Mohammed Hossain', nat: 'BD', g: 'MALE', dept: 'KITCHEN', title: 'عامل مطبخ', basic: 1800, hire: '2024-10-20', shift: 'M' },
  { key: 'd8', b: 'DAMMAM', first: 'بيشال', last: 'تامانغ', en: 'Bishal Tamang', nat: 'NP', g: 'MALE', dept: 'DELIVERY', title: 'سائق توصيل', basic: 2000, hire: '2025-05-11', shift: 'E' },
  { key: 'd9', b: 'DAMMAM', first: 'علي', last: 'رضا', en: 'Ali Raza', nat: 'PK', g: 'MALE', dept: 'DELIVERY', title: 'سائق توصيل', basic: 2000, hire: '2024-01-21', shift: 'M' },
  // ---- left the company (resignation, prorated in its last payroll) ----
  { key: 'left', b: 'MALQA', first: 'كريم', last: 'منصور', en: 'Karim Mansour', nat: 'EG', g: 'MALE', dept: 'SERVICE', title: 'نادل', basic: 2600, hire: '2021-03-14', shift: 'E', terminated: { date: 'PREV2-20', reason: 'RESIGNATION' } },
];

const HABITUALLY_LATE = new Set(['o10', 'm8', 'd6']);

async function wipe() {
  const users = await prisma.user.findMany({
    where: { email: { in: [...DEMO_EMAILS, ...EXTRA_OWNER_EMAILS] }, companyId: { not: null } },
    select: { companyId: true },
  });
  const companies = await prisma.company.findMany({
    where: {
      OR: [
        { nameEn: { in: ['Ward Al-Sham Restaurants', ...EXTRA_COMPANY_NAMES_EN] } },
        { id: { in: users.map((u) => u.companyId as string) } },
      ],
    },
    select: { id: true },
  });
  const ids = companies.map((c) => c.id);
  await wipePlatformDemo(prisma, ids);
  if (ids.length) {
    await prisma.company.deleteMany({ where: { id: { in: ids } } });
    console.log(`  wiped ${ids.length} existing demo compan${ids.length > 1 ? 'ies' : 'y'}`);
  }
}

async function main() {
  console.log('🌱 Seeding Shuoon demo data…');
  await wipe();

  const today = todayStr();
  const thisPeriod = periodOf(today);
  const prev1 = addMonths(thisPeriod, -1);
  const prev2 = addMonths(thisPeriod, -2);
  const prev3 = addMonths(thisPeriod, -3);
  const attStart = periodRange(prev1).start; // attendance from the 1st of the previous month
  const rel = (n: number) => addDays(today, n);
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // ---------- company ----------
  const company = await prisma.company.create({
    data: {
      nameAr: 'مطاعم ورد الشام',
      nameEn: 'Ward Al-Sham Restaurants',
      crNumber: '1010654321',
      establishmentId: '7001845236',
      gosiNumber: '512345678',
      vatNumber: '310456789100003',
      sector: 'RESTAURANTS',
      city: 'الرياض',
      iban: saudiIban('80'),
      bankCode: '80',
      weekendDays: [5, 6],
      payrollDay: 27,
      employeesCount: 40,
    },
  });
  const companyId = company.id;

  await prisma.leaveType.createMany({
    data: SAUDI_LEAVE_POLICIES.map((p) => ({ companyId, code: p.code, nameAr: p.nameAr, nameEn: p.nameEn, paid: p.paid, maxDaysPerYear: p.maxDaysPerYear })),
  });
  const leaveTypes = Object.fromEntries((await prisma.leaveType.findMany({ where: { companyId } })).map((t) => [t.code, t]));

  // ---------- holidays ----------
  const holidays = [
    ['2026-02-22', 'يوم التأسيس', 'Founding Day'],
    ['2026-03-19', 'عطلة عيد الفطر', 'Eid Al-Fitr holiday'],
    ['2026-03-20', 'عيد الفطر', 'Eid Al-Fitr'],
    ['2026-03-21', 'عطلة عيد الفطر', 'Eid Al-Fitr holiday'],
    ['2026-03-22', 'عطلة عيد الفطر', 'Eid Al-Fitr holiday'],
    ['2026-05-26', 'يوم عرفة', 'Arafat Day'],
    ['2026-05-27', 'عيد الأضحى', 'Eid Al-Adha'],
    ['2026-05-28', 'عطلة عيد الأضحى', 'Eid Al-Adha holiday'],
    ['2026-05-29', 'عطلة عيد الأضحى', 'Eid Al-Adha holiday'],
    ['2026-09-23', 'اليوم الوطني', 'Saudi National Day'],
    ['2027-02-22', 'يوم التأسيس', 'Founding Day'],
  ];
  await prisma.publicHoliday.createMany({ data: holidays.map(([d, ar, en]) => ({ companyId, date: day(d), nameAr: ar, nameEn: en })) });
  const leaveOpts = { weekendDays: [5, 6], holidays: holidays.map((h) => h[0]) };

  // ---------- branches & departments ----------
  const branchDefs: Record<BranchKey, { nameAr: string; nameEn: string; city: string; address: string; lat: number; lng: number; radiusMeters: number }> = {
    OLAYA: { nameAr: 'فرع العليا', nameEn: 'Riyadh – Olaya', city: 'الرياض', address: 'شارع العليا العام، حي العليا', lat: 24.6948, lng: 46.6853, radiusMeters: 200 },
    MALQA: { nameAr: 'فرع الملقا', nameEn: 'Riyadh – Al-Malqa', city: 'الرياض', address: 'طريق أنس بن مالك، حي الملقا', lat: 24.8075, lng: 46.6125, radiusMeters: 150 },
    JEDDAH: { nameAr: 'فرع التحلية', nameEn: 'Jeddah – Tahlia', city: 'جدة', address: 'شارع التحلية، حي الأندلس', lat: 21.5491, lng: 39.1497, radiusMeters: 150 },
    DAMMAM: { nameAr: 'فرع كورنيش الدمام', nameEn: 'Dammam – Corniche', city: 'الدمام', address: 'طريق الكورنيش، حي الشاطئ', lat: 26.4473, lng: 50.1135, radiusMeters: 150 },
  };
  const branches = {} as Record<BranchKey, { id: string }>;
  for (const [k, v] of Object.entries(branchDefs)) branches[k as BranchKey] = await prisma.branch.create({ data: { ...v, companyId } });

  const deptDefs: Record<DeptKey, string> = {
    ADMIN: 'الإدارة العامة',
    FINHR: 'المالية والموارد البشرية',
    KITCHEN: 'المطبخ',
    SERVICE: 'الصالة وخدمة العملاء',
    DELIVERY: 'التوصيل والمشتريات',
  };
  const depts = {} as Record<DeptKey, { id: string }>;
  for (const [k, name] of Object.entries(deptDefs)) depts[k as DeptKey] = await prisma.department.create({ data: { companyId, name } });
  await prisma.department.updateMany({ where: { id: { in: [depts.FINHR.id, depts.KITCHEN.id, depts.SERVICE.id, depts.DELIVERY.id] } }, data: { parentId: depts.ADMIN.id } });

  // ---------- shifts ----------
  const ALL_WEEK = [0, 1, 2, 3, 4, 5, 6];
  const shifts = {} as Record<BranchKey, Record<ShiftKind, { id: string; startTime: string; endTime: string; breakMinutes: number; graceMinutes: number; days: number[] }>>;
  for (const k of Object.keys(branchDefs) as BranchKey[]) {
    const bid = branches[k].id;
    shifts[k] = {
      M: await prisma.shift.create({ data: { companyId, branchId: bid, name: 'الوردية الصباحية', startTime: '08:00', endTime: '16:00', breakMinutes: 60, graceMinutes: 10, days: ALL_WEEK, color: '#F2A541' } }),
      E: await prisma.shift.create({ data: { companyId, branchId: bid, name: 'الوردية المسائية', startTime: '16:00', endTime: '00:00', breakMinutes: 60, graceMinutes: 10, days: ALL_WEEK, color: '#145A5C' } }),
      A: await prisma.shift.create({ data: { companyId, branchId: bid, name: 'الدوام الإداري', startTime: '09:00', endTime: '17:00', breakMinutes: 60, graceMinutes: 15, days: [0, 1, 2, 3, 4], color: '#3B7EA1' } }),
    };
  }

  // ---------- employees ----------
  const emp: Record<string, { id: string; seed: Seed; offDay: number; hire: Date; term: Date | null; userEmail?: string }> = {};
  let n = 0;
  for (const p of PEOPLE) {
    n++;
    const isSaudi = p.nat === 'SA';
    const housing = Math.round(p.basic * 0.25);
    const transport = Math.max(300, Math.round(p.basic * 0.1));
    const bank = BANKS[randInt(0, BANKS.length - 1)];
    const iban = saudiIban(bank);
    const nationalId = (isSaudi ? '1' : '2') + digits(9);
    const birthYear = p.role ? randInt(1978, 1988) : randInt(1985, 2002);
    const idExpiry = isSaudi ? rel(randInt(400, 2500)) : rel(randInt(60, 400));
    const terminationDate = p.terminated ? day(p.terminated.date.replace('PREV2', prev2)) : null;
    const hire = day(p.hire);
    const years = (day(today).getTime() - hire.getTime()) / (365 * 86400000);
    const e = await prisma.employee.create({
      data: {
        companyId,
        employeeNumber: `EMP-${String(n).padStart(4, '0')}`,
        firstNameAr: p.first,
        lastNameAr: p.last,
        fullNameEn: p.en,
        nationality: p.nat,
        isSaudi,
        gender: p.g,
        birthDate: day(`${birthYear}-${String(randInt(1, 12)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`),
        maritalStatus: rand() < 0.6 ? 'MARRIED' : 'SINGLE',
        nationalId,
        idExpiry,
        passportNumber: isSaudi ? null : `${p.nat}${digits(7)}`,
        passportExpiry: isSaudi ? null : rel(randInt(200, 1800)),
        phone: `+9665${digits(8)}`,
        email: `${p.en.split(' ')[0].toLowerCase()}.${p.key}@wardalsham.sa`,
        branchId: branches[p.b].id,
        departmentId: depts[p.dept].id,
        jobTitle: p.title,
        hireDate: hire,
        contractType: isSaudi ? 'UNLIMITED' : 'FIXED',
        contractEndDate: isSaudi ? null : rel(randInt(45, 700)),
        probationEndDate: addDays(hire, 90),
        status: p.terminated ? 'TERMINATED' : 'ACTIVE',
        terminationDate,
        terminationReason: p.terminated?.reason ?? null,
        basicSalary: p.basic,
        housingAllowance: housing,
        transportAllowance: transport,
        otherAllowances: p.other ?? 0,
        iban,
        bankCode: bank,
        gosiRegistered: true,
        hoursPerDay: 8,
        avatarColor: COLORS[n % COLORS.length],
        annualLeaveCarryOver: years > 1 ? randInt(4, 15) : 0,
      },
    });
    emp[p.key] = { id: e.id, seed: p, offDay: p.shift === 'A' ? 5 : (n * 3) % 7, hire, term: terminationDate };
  }
  // Demo employee works Sun–Thu mornings with Friday off (stable demo)
  emp.emp.offDay = 5;

  // managers: GM → branch managers → staff
  for (const e of Object.values(emp)) {
    const p = e.seed;
    let managerId: string | null = null;
    if (p.role === 'GM') managerId = null;
    else if (p.role === 'BM' || p.key === 'hr' || p.key === 'payroll') managerId = emp.gm.id;
    else {
      const bm = Object.values(emp).find((x) => x.seed.role === 'BM' && x.seed.b === p.b);
      managerId = bm?.id ?? emp.gm.id;
    }
    await prisma.employee.update({ where: { id: e.id }, data: { managerId } });
  }
  for (const k of ['OLAYA', 'MALQA', 'JEDDAH', 'DAMMAM'] as BranchKey[]) {
    const bm = Object.values(emp).find((x) => x.seed.role === 'BM' && x.seed.b === k)!;
    await prisma.branch.update({ where: { id: branches[k].id }, data: { managerEmployeeId: bm.id } });
  }

  // ---------- users ----------
  const userDefs: { email: string; name: string; role: Role; empKey?: string }[] = [
    { email: 'owner@shuoon.demo', name: 'عبدالله الراشد', role: 'OWNER' },
    { email: 'hr@shuoon.demo', name: 'نورة القحطاني', role: 'HR_ADMIN', empKey: 'hr' },
    { email: 'payroll@shuoon.demo', name: 'ماجد الحربي', role: 'PAYROLL', empKey: 'payroll' },
    { email: 'manager@shuoon.demo', name: 'فهد العتيبي', role: 'BRANCH_MANAGER', empKey: 'mgrOlaya' },
    { email: 'employee@shuoon.demo', name: 'سعود الدوسري', role: 'EMPLOYEE', empKey: 'emp' },
  ];
  const users: Record<string, { id: string; name: string }> = {};
  for (const u of userDefs) {
    users[u.role] = await prisma.user.create({
      data: { companyId, email: u.email, name: u.name, role: u.role, passwordHash, employeeId: u.empKey ? emp[u.empKey].id : null },
    });
  }

  // ---------- documents ----------
  const docs: Prisma.EmployeeDocumentCreateManyInput[] = [];
  const special: Record<string, { type: 'IQAMA' | 'PASSPORT' | 'INSURANCE' | 'CONTRACT'; offset: number }> = {
    o8: { type: 'IQAMA', offset: -6 }, // expired
    m6: { type: 'IQAMA', offset: 12 },
    j7: { type: 'IQAMA', offset: 25 },
    d4: { type: 'IQAMA', offset: 48 },
    m9: { type: 'PASSPORT', offset: 70 },
    d7: { type: 'INSURANCE', offset: -15 }, // expired
    o11: { type: 'INSURANCE', offset: 20 },
    j5: { type: 'CONTRACT', offset: 55 },
    d5: { type: 'CONTRACT', offset: 85 },
  };
  for (const e of Object.values(emp)) {
    if (e.seed.terminated) continue;
    const full = await prisma.employee.findUniqueOrThrow({ where: { id: e.id } });
    const sp = special[e.seed.key];
    const exp = (type: string, def: Date | null) => (sp && sp.type === type ? rel(sp.offset) : def);
    if (!full.isSaudi) {
      const iqamaExp = exp('IQAMA', full.idExpiry)!;
      docs.push({ companyId, employeeId: e.id, type: 'IQAMA', number: full.nationalId, issueDate: addDays(iqamaExp, -365), expiryDate: iqamaExp });
      if (sp?.type === 'IQAMA') await prisma.employee.update({ where: { id: e.id }, data: { idExpiry: iqamaExp } });
      const passExp = exp('PASSPORT', full.passportExpiry)!;
      docs.push({ companyId, employeeId: e.id, type: 'PASSPORT', number: full.passportNumber, issueDate: addDays(passExp, -3650), expiryDate: passExp });
      if (sp?.type === 'PASSPORT') await prisma.employee.update({ where: { id: e.id }, data: { passportExpiry: passExp } });
    }
    const contractExp = exp('CONTRACT', full.contractEndDate);
    docs.push({ companyId, employeeId: e.id, type: 'CONTRACT', number: `CT-${full.employeeNumber}`, issueDate: full.hireDate, expiryDate: contractExp, note: full.contractType === 'FIXED' ? 'عقد محدد المدة' : 'عقد غير محدد المدة' });
    if (sp?.type === 'CONTRACT') await prisma.employee.update({ where: { id: e.id }, data: { contractEndDate: contractExp } });
    if (sp?.type === 'INSURANCE' || rand() < 0.5) {
      const insExp = exp('INSURANCE', rel(randInt(120, 330)))!;
      docs.push({ companyId, employeeId: e.id, type: 'INSURANCE', number: `BUPA-${digits(8)}`, issueDate: addDays(insExp, -365), expiryDate: insExp, note: 'التأمين الطبي' });
    }
    if (e.seed.dept === 'KITCHEN' || e.seed.dept === 'SERVICE') {
      docs.push({ companyId, employeeId: e.id, type: 'CERTIFICATE', number: `HC-${digits(6)}`, issueDate: rel(-randInt(30, 300)), expiryDate: rel(randInt(95, 360)), note: 'الشهادة الصحية (بلدي)' });
    }
  }
  await prisma.employeeDocument.createMany({ data: docs });

  // ---------- leave requests ----------
  const leaves: Prisma.LeaveRequestCreateManyInput[] = [];
  const prev1Start = periodRange(prev1).start;
  const addLeave = (key: string, code: string, start: Date, end: Date, status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED', reason: string, approver?: { id: string; name: string }, comment?: string) => {
    leaves.push({
      companyId,
      employeeId: emp[key].id,
      leaveTypeId: leaveTypes[code].id,
      startDate: start,
      endDate: end,
      days: countLeaveDays(start, end, leaveOpts),
      reason,
      status,
      approverId: status === 'APPROVED' || status === 'REJECTED' ? approver?.id : null,
      approverName: status === 'APPROVED' || status === 'REJECTED' ? approver?.name : null,
      decidedAt: status === 'PENDING' ? null : addDays(start, -5),
      comment: comment ?? null,
      createdAt: addDays(start, -10),
    });
  };
  const hrU = users.HR_ADMIN;
  const mgrU = users.BRANCH_MANAGER;
  addLeave('emp', 'ANNUAL', rel(-40), rel(-37), 'APPROVED', 'إجازة عائلية', mgrU);
  addLeave('emp', 'ANNUAL', rel(20), rel(24), 'PENDING', 'سفر إلى أبها');
  addLeave('o9', 'ANNUAL', rel(-2), rel(5), 'APPROVED', 'زيارة الأهل في بيروت', hrU, 'إجازة سعيدة');
  addLeave('m5', 'SICK', addDays(prev1Start, 9), addDays(prev1Start, 11), 'APPROVED', 'التهاب حاد — تقرير طبي مرفق', hrU);
  addLeave('j6', 'UNPAID', addDays(prev1Start, 14), addDays(prev1Start, 15), 'APPROVED', 'ظرف شخصي', hrU);
  addLeave('o7', 'ANNUAL', addDays(prev1Start, 2), addDays(prev1Start, 8), 'APPROVED', 'إجازة سنوية', hrU);
  addLeave('m7', 'ANNUAL', rel(7), rel(9), 'PENDING', 'تجديد جواز السفر في السفارة');
  addLeave('d3', 'ANNUAL', rel(30), rel(34), 'PENDING', 'إجازة سنوية');
  addLeave('d2', 'MARRIAGE', rel(10), rel(14), 'PENDING', 'زواج — بارك الله لكم');
  addLeave('o6', 'ANNUAL', rel(3), rel(4), 'PENDING', 'مراجعة جامعية');
  addLeave('j8', 'ANNUAL', rel(-20), rel(-16), 'REJECTED', 'إجازة', hrU, 'ضغط العمل في موسم جدة، يرجى اختيار موعد آخر');
  addLeave('o10', 'ANNUAL', rel(-12), rel(-10), 'REJECTED', 'سفر', mgrU, 'تجاوز عدد الإجازات المتزامنة في الفرع');
  addLeave('m2', 'ANNUAL', rel(15), rel(16), 'CANCELLED', 'تم تأجيل السفر');
  addLeave('j2', 'SICK', rel(-8), rel(-8), 'APPROVED', 'مراجعة مستشفى', hrU);
  await prisma.leaveRequest.createMany({ data: leaves });
  await prisma.employee.update({ where: { id: emp.o9.id }, data: { status: 'ON_LEAVE' } });
  const approvedLeaves = leaves.filter((l) => l.status === 'APPROVED');
  const onLeave = (employeeId: string, d: Date) =>
    approvedLeaves.some((l) => l.employeeId === employeeId && day(l.startDate as Date) <= d && day(l.endDate as Date) >= d);

  // ---------- roster + attendance ----------
  const rosterEnd = addDays(today, 13 - weekday(today)); // through the end of next week
  const assignments: Prisma.ShiftAssignmentCreateManyInput[] = [];
  const records: Prisma.AttendanceRecordCreateManyInput[] = [];
  const now = new Date();
  for (const e of Object.values(emp)) {
    const sh = shifts[e.seed.b][e.seed.shift];
    for (const d of eachDay(attStart, rosterEnd)) {
      if (d < e.hire || (e.term && d > e.term)) continue;
      const wd = weekday(d);
      if (!sh.days.includes(wd) || wd === e.offDay) continue;
      assignments.push({ companyId, employeeId: e.id, shiftId: sh.id, date: d });
      const ds = dayStr(d)!;
      if (ds > today || onLeave(e.id, d)) continue;
      const shiftStart = riyadhDateTime(d, sh.startTime);
      const shiftDef = { startTime: sh.startTime, endTime: sh.endTime, breakMinutes: sh.breakMinutes, graceMinutes: sh.graceMinutes };
      if (ds === today) {
        if (e.seed.key === 'emp' || e.seed.key === 'mgrOlaya') continue; // leave demo users free to check in
        if (now.getTime() < shiftStart.getTime() + 20 * 60000) continue;
        const r = rand();
        if (r < 0.08) continue; // not in yet → shows ABSENT
        const lateBy = r < 0.25 ? randInt(12, 40) : randInt(-12, 6);
        const checkIn = new Date(shiftStart.getTime() + lateBy * 60000);
        const m = calculateAttendance(shiftDef, checkIn, null);
        records.push({ companyId, employeeId: e.id, date: d, shiftId: sh.id, checkIn, workedMinutes: 0, lateMinutes: m.lateMinutes, status: m.status, source: 'SEED', checkInLat: branchDefs[e.seed.b].lat, checkInLng: branchDefs[e.seed.b].lng });
        continue;
      }
      const lateRate = HABITUALLY_LATE.has(e.seed.key) ? 0.35 : 0.1;
      const r = rand();
      if (r < 0.035) {
        records.push({ companyId, employeeId: e.id, date: d, shiftId: sh.id, status: 'ABSENT', source: 'SEED', note: 'غياب بدون عذر' });
        continue;
      }
      const lateBy = r < 0.035 + lateRate ? randInt(12, 55) : randInt(-12, 6);
      const checkIn = new Date(shiftStart.getTime() + lateBy * 60000);
      const lengthMin = sh.endTime === '00:00' ? 480 : 480;
      const extra = rand() < 0.12 ? randInt(60, 150) : randInt(-5, 12);
      const checkOut = new Date(shiftStart.getTime() + (lengthMin + extra) * 60000);
      const m = calculateAttendance(shiftDef, checkIn, checkOut);
      records.push({
        companyId,
        employeeId: e.id,
        date: d,
        shiftId: sh.id,
        checkIn,
        checkOut,
        checkInLat: branchDefs[e.seed.b].lat + (rand() - 0.5) * 0.0006,
        checkInLng: branchDefs[e.seed.b].lng + (rand() - 0.5) * 0.0006,
        workedMinutes: m.workedMinutes,
        lateMinutes: m.lateMinutes,
        earlyLeaveMinutes: m.earlyLeaveMinutes,
        overtimeMinutes: m.overtimeMinutes,
        status: m.status,
        source: 'SEED',
      });
    }
  }
  await prisma.shiftAssignment.createMany({ data: assignments });
  await prisma.attendanceRecord.createMany({ data: records });

  // ---------- loans ----------
  const loanDefs = [
    { key: 'o8', amount: 6000, monthly: 1000, start: prev3, note: 'سلفة ظروف عائلية' },
    { key: 'm8', amount: 2400, monthly: 400, start: prev2, note: 'سلفة شراء أثاث' },
    { key: 'j7', amount: 1500, monthly: 500, start: prev3, note: 'سلفة تجديد إقامة المرافقين' },
    { key: 'd5', amount: 3000, monthly: 500, start: prev1, note: 'سلفة سفر' },
  ];
  for (const l of loanDefs) {
    await prisma.loan.create({
      data: { companyId, employeeId: emp[l.key].id, amount: l.amount, monthlyDeduction: l.monthly, remaining: l.amount, startPeriod: l.start, note: l.note, createdAt: day(`${l.start}-01`) },
    });
  }

  // ---------- adjustments ----------
  const adj: Prisma.PayrollAdjustmentCreateManyInput[] = [
    { companyId, employeeId: emp.o7.id, period: prev2, type: 'BONUS', amount: 1000, note: 'تقييم ممتاز من العملاء' },
    { companyId, employeeId: emp.o12.id, period: prev2, type: 'COMMISSION', amount: 350, note: 'عمولة طلبات التوصيل' },
    { companyId, employeeId: emp.m9.id, period: prev1, type: 'COMMISSION', amount: 420, note: 'عمولة طلبات التوصيل' },
    { companyId, employeeId: emp.j4.id, period: prev1, type: 'BONUS', amount: 750, note: 'مكافأة موسم الصيف' },
    { companyId, employeeId: emp.d6.id, period: prev1, type: 'PENALTY', amount: 150, note: 'تكرار التأخير' },
    { companyId, employeeId: emp.mgrJeddah.id, period: prev1, type: 'ALLOWANCE', amount: 500, note: 'بدل افتتاح ركن جديد' },
    { companyId, employeeId: emp.o12.id, period: thisPeriod, type: 'COMMISSION', amount: 300, note: 'عمولة طلبات التوصيل' },
    { companyId, employeeId: emp.m8.id, period: thisPeriod, type: 'DEDUCTION', amount: 120, note: 'تلف معدات' },
  ];
  await prisma.payrollAdjustment.createMany({ data: adj });

  // ---------- payroll (real engine) ----------
  const payrollUser = users.PAYROLL;
  for (const period of [prev3, prev2, prev1]) {
    const run = await prisma.payrollRun.create({ data: { companyId, period, createdAt: day(`${period}-24`) } });
    await calculatePayrollRun(prisma, companyId, run.id);
    await approvePayrollRun(prisma, companyId, run.id, payrollUser);
    const approvedAt = new Date(day(`${period}-26`).getTime() + 10 * 3600000);
    const paid = period !== prev1;
    await prisma.payrollRun.update({
      where: { id: run.id },
      data: { approvedAt, status: paid ? 'PAID' : 'APPROVED', paidAt: paid ? new Date(day(`${period}-27`).getTime() + 9 * 3600000) : null },
    });
    if (paid) {
      const slips = await prisma.payslip.findMany({ where: { payrollRunId: run.id }, select: { id: true, employeeId: true } });
      const linked = await prisma.user.findMany({ where: { companyId, employeeId: { in: slips.map((s) => s.employeeId) } } });
      await prisma.notification.createMany({
        data: linked.map((u) => ({
          companyId,
          userId: u.id,
          title: `تم صرف راتب شهر ${period}`,
          body: 'قسيمة الراتب متاحة الآن في الخدمة الذاتية',
          link: `/me/payslips/${slips.find((s) => s.employeeId === u.employeeId)!.id}`,
          readAt: new Date(),
          createdAt: day(`${period}-27`),
        })),
      });
    }
  }

  // ---------- employee requests ----------
  const reqs: Prisma.EmployeeRequestCreateManyInput[] = [
    { companyId, employeeId: emp.emp.id, type: 'SALARY_CERTIFICATE', title: 'تعريف بالراتب لبنك الراجحي', details: 'لغرض فتح حساب تمويل', status: 'APPROVED', approverId: hrU.id, approverName: hrU.name, decidedAt: rel(-6), createdAt: rel(-7) },
    { companyId, employeeId: emp.emp.id, type: 'EXPENSE_CLAIM', title: 'مطالبة شراء مستلزمات صالة', details: 'شراء مفارش طاولات عاجلة من السوق', amount: 385, status: 'PENDING', createdAt: rel(-1) },
    { companyId, employeeId: emp.o11.id, type: 'LOAN', title: 'طلب سلفة', details: 'مصاريف علاج أحد أفراد الأسرة', amount: 3000, payload: { months: 6 }, status: 'PENDING', createdAt: rel(-2) },
    { companyId, employeeId: emp.j5.id, type: 'EXIT_REENTRY', title: 'تأشيرة خروج وعودة', details: 'سفر إلى لبنان لمدة 30 يوماً', payload: { from: dayStr(rel(40)), to: dayStr(rel(70)) }, status: 'APPROVED', approverId: hrU.id, approverName: hrU.name, decidedAt: rel(-3), createdAt: rel(-5) },
    { companyId, employeeId: emp.o10.id, type: 'ATTENDANCE_CORRECTION', title: 'نسيت تسجيل الحضور', details: 'تعطل الجوال وقت البصمة', payload: { date: dayStr(rel(-3)), checkIn: '16:02', checkOut: '00:05' }, status: 'PENDING', createdAt: rel(-2) },
    { companyId, employeeId: emp.m3.id, type: 'LETTER', title: 'خطاب لمن يهمه الأمر', details: 'للسفارة الأمريكية', status: 'REJECTED', approverId: hrU.id, approverName: hrU.name, decidedAt: rel(-9), comment: 'يرجى تحديد الجهة بالضبط وإعادة التقديم', createdAt: rel(-10) },
    { companyId, employeeId: emp.d8.id, type: 'OTHER', title: 'طلب تغيير الوردية', details: 'أرغب في الانتقال للوردية الصباحية لظروف الدراسة', status: 'PENDING', createdAt: rel(-4) },
    { companyId, employeeId: emp.m8.id, type: 'SALARY_CERTIFICATE', title: 'تعريف بالراتب للسفارة', details: 'تأشيرة زيارة عائلية', status: 'CANCELLED', createdAt: rel(-15), decidedAt: rel(-14) },
  ];
  await prisma.employeeRequest.createMany({ data: reqs });

  // ---------- performance ----------
  const activeEmps = Object.values(emp).filter((e) => !e.seed.terminated && e.hire <= day(today));
  const goals = (scored: boolean) => [
    { title: 'جودة العمل وخدمة العملاء', weight: 40, score: scored ? randInt(3, 5) : null },
    { title: 'الالتزام بالحضور والأنظمة', weight: 30, score: scored ? randInt(2, 5) : null },
    { title: 'العمل الجماعي والمبادرة', weight: 30, score: scored ? randInt(3, 5) : null },
  ];
  const score = (g: { weight: number; score: number | null }[]) => {
    const s = g.filter((x) => x.score !== null);
    const w = s.reduce((a, x) => a + x.weight, 0);
    return w ? Math.round((s.reduce((a, x) => a + x.weight * (x.score as number), 0) / w) * 100) / 100 : null;
  };
  const year = today.slice(0, 4);
  const closed = await prisma.reviewCycle.create({ data: { companyId, name: `تقييم النصف الأول ${year}`, startDate: day(`${year}-01-01`), endDate: day(`${year}-06-30`), status: 'CLOSED' } });
  const active = await prisma.reviewCycle.create({ data: { companyId, name: `تقييم النصف الثاني ${year}`, startDate: day(`${year}-07-01`), endDate: day(`${year}-12-31`), status: 'ACTIVE' } });
  const reviewRows: Prisma.PerformanceReviewCreateManyInput[] = [];
  for (const e of activeEmps) {
    const mgr = await prisma.employee.findUniqueOrThrow({ where: { id: e.id }, select: { managerId: true } });
    if (e.hire < day(`${year}-06-30`)) {
      const g = goals(true);
      reviewRows.push({ companyId, cycleId: closed.id, employeeId: e.id, reviewerId: mgr.managerId, goals: g, overallScore: score(g), status: 'SUBMITTED', comments: 'أداء جيد ومستمر', submittedAt: day(`${year}-07-10`) });
    }
    const submitted = rand() < 0.4;
    const g = goals(submitted);
    reviewRows.push({ companyId, cycleId: active.id, employeeId: e.id, reviewerId: mgr.managerId, goals: g, overallScore: score(g), status: submitted ? 'SUBMITTED' : 'PENDING', comments: submitted ? 'ملتزم ويحتاج تطويراً في مهارات البيع الإضافي' : null, submittedAt: submitted ? rel(-randInt(1, 10)) : null });
  }
  await prisma.performanceReview.createMany({ data: reviewRows });

  // ---------- recruitment ----------
  const job1 = await prisma.jobOpening.create({
    data: { companyId, title: 'طاهٍ شامي أول', branchId: branches.JEDDAH.id, departmentId: depts.KITCHEN.id, employmentType: 'FULL_TIME', description: 'خبرة 5 سنوات على الأقل في المطبخ الشامي (مشاوي، مقبلات، فتّات). يفضل من عمل في مطاعم فاخرة.', status: 'OPEN' },
  });
  const job2 = await prisma.jobOpening.create({
    data: { companyId, title: 'مشرف صالة (سعودي)', branchId: branches.DAMMAM.id, departmentId: depts.SERVICE.id, employmentType: 'FULL_TIME', description: 'وظيفة مخصصة للسعوديين لرفع نسبة التوطين في فرع الكورنيش. خبرة في خدمة العملاء وإدارة فريق.', status: 'OPEN' },
  });
  await prisma.candidate.createMany({
    data: [
      { companyId, jobId: job1.id, name: 'رامي الحلبي', email: 'rami.h@mail.com', phone: '+963944000111', nationality: 'SY', expectedSalary: 6500, stage: 'INTERVIEW', notes: 'مقابلة عملية يوم الأحد' },
      { companyId, jobId: job1.id, name: 'طارق منصور', email: 'tarek.m@mail.com', phone: '+201001112223', nationality: 'EG', expectedSalary: 5200, stage: 'SCREENING' },
      { companyId, jobId: job1.id, name: 'جاد عون', email: 'jad.aoun@mail.com', phone: '+96170111222', nationality: 'LB', expectedSalary: 7000, stage: 'OFFER', notes: 'عرض مرسل — بانتظار الرد' },
      { companyId, jobId: job1.id, name: 'فراس العمر', email: 'firas@mail.com', phone: '+962790001122', nationality: 'JO', expectedSalary: 6000, stage: 'APPLIED' },
      { companyId, jobId: job1.id, name: 'نبيل قاسم', email: 'nabil.q@mail.com', phone: '+963933222111', nationality: 'SY', expectedSalary: 8000, stage: 'REJECTED', notes: 'الراتب المتوقع أعلى من الميزانية' },
      { companyId, jobId: job2.id, name: 'عبدالإله الدوسري', email: 'abdulelah@mail.com', phone: '+966555111222', nationality: 'SA', expectedSalary: 7500, stage: 'INTERVIEW' },
      { companyId, jobId: job2.id, name: 'شهد العمري', email: 'shahad@mail.com', phone: '+966555333444', nationality: 'SA', expectedSalary: 7000, stage: 'SCREENING' },
      { companyId, jobId: job2.id, name: 'محمد الخالدي', email: 'mkhalidi@mail.com', phone: '+966555777888', nationality: 'SA', expectedSalary: 6800, stage: 'APPLIED' },
      { companyId, jobId: job2.id, name: 'راكان الهاجري', email: 'rakan@mail.com', phone: '+966555999000', nationality: 'SA', expectedSalary: 7200, stage: 'HIRED', notes: 'يبدأ أول الشهر القادم' },
    ],
  });

  // ---------- announcements & notifications ----------
  const owner = users.OWNER;
  await prisma.announcement.createMany({
    data: [
      { companyId, title: 'قائمة الشتاء الجديدة 🍲', body: 'نطلق قائمة الشتاء (شوربة العدس، الفتّة الشامية، السحلب) بداية الشهر القادم. التدريب الإلزامي لشؤون المطبخ والصالة يوم الأحد الساعة 3 عصراً.', authorId: owner.id, authorName: owner.name, createdAt: rel(-2) },
      { companyId, title: 'تحديث سياسة الحضور', body: 'يرجى تسجيل الحضور والانصراف من تطبيق شؤون داخل نطاق الفرع فقط. فترة السماح 10 دقائق للورديات التشغيلية.', authorId: users.HR_ADMIN.id, authorName: users.HR_ADMIN.name, createdAt: rel(-9) },
      { companyId, branchId: branches.OLAYA.id, title: 'زيارة تفتيش البلدية', body: 'زيارة تفتيش متوقعة هذا الأسبوع في فرع العليا. تأكدوا من سريان الشهادات الصحية ونظافة المطبخ.', authorId: users.HR_ADMIN.id, authorName: users.HR_ADMIN.name, createdAt: rel(-1) },
      { companyId, title: 'تهنئة باليوم الوطني 🇸🇦', body: 'كل عام والوطن بخير. تم صرف مكافأة اليوم الوطني مع راتب الشهر.', authorId: owner.id, authorName: owner.name, createdAt: day(`${year}-09-22`) },
    ],
  });
  const n2 = (userId: string, title: string, body: string, link: string, daysAgo: number, read = false) => ({
    companyId, userId, title, body, link, createdAt: rel(-daysAgo), readAt: read ? rel(-daysAgo) : null,
  });
  await prisma.notification.createMany({
    data: [
      n2(owner.id, 'وثائق تنتهي قريباً', 'يوجد إقامات وتأمينات تنتهي خلال 30 يوماً', '/documents', 1),
      n2(owner.id, `مسير رواتب ${prev1} بانتظار الصرف`, 'تم اعتماد المسير — يمكنك تنزيل ملف حماية الأجور', '/payroll', 3),
      n2(owner.id, 'فرع كورنيش الدمام في النطاق الأحمر', 'نسبة السعودة في الفرع أقل من 12%', '/saudization', 5),
      n2(users.HR_ADMIN.id, 'طلب إجازة جديد', 'ريم الزهراني — إجازة سنوية (2 يوم)', '/leaves', 0),
      n2(users.HR_ADMIN.id, 'طلب جديد: سلفة', 'جون سانتوس — طلب سلفة', '/requests', 2),
      n2(users.PAYROLL.id, `مسير ${prev1} معتمد`, 'بانتظار تأكيد الصرف', '/payroll', 3),
      n2(users.BRANCH_MANAGER.id, 'طلب إجازة جديد', 'سعود الدوسري — إجازة سنوية', '/leaves', 1),
      n2(users.BRANCH_MANAGER.id, 'زيارة تفتيش البلدية', 'زيارة تفتيش متوقعة هذا الأسبوع', '/announcements', 1),
      n2(users.EMPLOYEE.id, 'تمت الموافقة على طلبك: تعريف بالراتب', 'يمكنك استلامه من الموارد البشرية', '/me/requests', 6),
      n2(users.EMPLOYEE.id, 'إعلان: قائمة الشتاء الجديدة', 'التدريب الإلزامي يوم الأحد', '/announcements', 2),
    ],
  });

  // ---------- audit trail ----------
  const audit = (u: { id: string; name: string }, action: string, entity: string, entityId: string | null, hoursAgo: number, data?: Prisma.InputJsonValue) => ({
    companyId, userId: u.id, userName: u.name, action, entity, entityId, data, createdAt: new Date(Date.now() - hoursAgo * 3600000),
  });
  const runs = await prisma.payrollRun.findMany({ where: { companyId }, orderBy: { period: 'asc' } });
  await prisma.auditLog.createMany({
    data: [
      audit(owner, 'REGISTER', 'Company', companyId, 24 * 120),
      ...runs.flatMap((r, i) => [
        audit(payrollUser, 'CALCULATE', 'PayrollRun', r.id, 24 * (90 - i * 30) + 5, { period: r.period }),
        audit(payrollUser, 'APPROVE', 'PayrollRun', r.id, 24 * (88 - i * 30), { period: r.period }),
      ]),
      audit(hrU, 'CREATE', 'Employee', emp.j3.id, 24 * 38, { name: 'مازن البقمي' }),
      audit(hrU, 'APPROVE', 'LeaveRequest', null, 26, { employee: 'جورج حداد' }),
      audit(hrU, 'CREATE', 'Announcement', null, 20),
      audit(mgrU, 'UPDATE', 'Roster', null, 8, { upserted: 42 }),
      audit(hrU, 'APPROVE', 'EmployeeRequest', null, 5, { type: 'EXIT_REENTRY' }),
      audit(owner, 'UPDATE', 'Company', companyId, 3, { payrollDay: 27 }),
      audit(hrU, 'CREATE', 'JobOpening', job2.id, 2, { title: job2.title }),
    ],
  });

  await seedPlatform(prisma, { passwordHash, demoCompanyId: companyId, demoCreatedDaysAgo: 120 });

  const totals = await prisma.payrollRun.findMany({ where: { companyId }, orderBy: { period: 'asc' }, select: { period: true, status: true, employeesCount: true, totalNet: true } });
  console.log(`✅ Company: ${company.nameAr} (${companyId})`);
  console.log(`   ${Object.keys(emp).length} employees, ${docs.length} documents, ${assignments.length} roster slots, ${records.length} attendance records`);
  console.log(`   ${leaves.length} leave requests, ${reqs.length} employee requests, ${loanDefs.length} loans`);
  for (const t of totals) console.log(`   payroll ${t.period}: ${t.status} — ${t.employeesCount} payslips, net ${t.totalNet.toString()} SAR`);
  console.log(`   Logins (password ${PASSWORD}): ${DEMO_EMAILS.join(', ')}, admin@shuoon.demo (SUPER_ADMIN)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
