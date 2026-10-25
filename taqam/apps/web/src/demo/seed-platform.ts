/**
 * Platform-level demo data (docs/ADMIN_PORTAL.md "Seed additions"): the SUPER_ADMIN accounts, 7 extra subscriber
 * companies in mixed lifecycle states (owner, a few employees, usage and an event history each) and 6 leads.
 * Deterministic and relative to "today", like the main seed. Runs after the demo company is seeded.
 */
import { countLeaveDays, SAUDI_LEAVE_POLICIES } from '@taqam/core';
import { companyEmployeeId, companyPoolId, OTHER_COMPANY_EMPLOYEE_POOL, runId } from './ids';
import { addDays, addMonths, eachDay, periodOf, riyadhDateTime, todayStr, weekday } from './dates';
import { nextId, type BillingCycle, type Company, type CompanyStatus, type DB, type Employee, type Plan } from './db';
import { endOfDay, lifecycleDefaults, logEvent, type Actor } from './lifecycle';
import type { Services } from './services';

let st = 20261024;
function rand() {
  st |= 0;
  st = (st + 0x6d2b79f5) | 0;
  let t = Math.imul(st ^ (st >>> 15), 1 | st);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const pick = <T,>(xs: readonly T[]) => xs[randInt(0, xs.length - 1)];
const digits = (n: number) => Array.from({ length: n }, () => randInt(0, 9)).join('');
function saudiIban(bankCode: string): string {
  const bban = bankCode + digits(18);
  let rem = 0;
  for (const ch of bban + '281000') rem = (rem * 10 + Number(ch)) % 97;
  return `SA${String(98 - rem).padStart(2, '0')}${bban}`;
}

export const PLATFORM_ADMIN = { id: 'adm-01', email: 'admin@shuoon.demo', name: 'مدير المنصة' };
const SUPPORT_ADMIN = { id: 'adm-02', email: 'support@shuoon.demo', name: 'سارة المطيري' };

const SAUDI_M = ['محمد', 'عبدالله', 'فهد', 'سعد', 'تركي', 'نايف', 'بندر', 'ياسر', 'مشعل', 'عمر', 'مازن', 'راشد'];
const SAUDI_F = ['نوف', 'لمى', 'أمل', 'هند', 'جواهر', 'منيرة', 'العنود', 'رهف'];
const SAUDI_LAST = ['العتيبي', 'الشهري', 'الزهراني', 'المالكي', 'الدوسري', 'السبيعي', 'العمري', 'القرني', 'الحربي', 'الغامدي', 'الشمري', 'المطيري', 'البلوي', 'الرشيدي'];
const EXPATS: [string, string, string][] = [
  ['أحمد', 'عبدالفتاح', 'EG'], ['محمد', 'إقبال', 'PK'], ['راجو', 'كومار', 'IN'], ['خوسيه', 'ريس', 'PH'], ['سامر', 'الخطيب', 'SY'],
  ['ياسين', 'بن علي', 'TN'], ['أنور', 'حسين', 'BD'], ['وليد', 'منصور', 'JO'], ['مصطفى', 'السيد', 'EG'], ['أرجون', 'ناير', 'IN'],
];
const TITLES: Record<string, string[]> = {
  CONTRACTING: ['مهندس موقع', 'مشرف عمال', 'فني كهرباء', 'سائق معدات', 'محاسب', 'عامل بناء'],
  HEALTHCARE: ['طبيب عام', 'ممرضة', 'فني مختبر', 'موظف استقبال', 'صيدلي'],
  RETAIL: ['مدير متجر', 'بائع', 'أمين صندوق', 'منسق مخزون', 'مسؤول مبيعات'],
  RESTAURANTS: ['خباز', 'باريستا', 'كاشير', 'عامل توصيل', 'مشرف وردية'],
  LOGISTICS: ['سائق شاحنة', 'منسق شحنات', 'أمين مستودع', 'مشرف أسطول', 'محاسب'],
};
const CITY_GEO: Record<string, [number, number]> = {
  'الرياض': [24.7136, 46.6753], 'جدة': [21.5433, 39.1728], 'الدمام': [26.4207, 50.0888], 'بريدة': [26.3592, 43.9818], 'الخبر': [26.2172, 50.1971],
};
const COLORS = ['#0C1F24', '#16313A', '#0B7A6B', '#FFB547', '#2F6F9F', '#1B7F53', '#C2412D', '#7A5C99'];

interface EventDef { type: 'REGISTERED' | 'ACTIVATED' | 'SUSPENDED' | 'REACTIVATED' | 'PLAN_CHANGED' | 'EXTENDED' | 'NOTE' | 'IMPERSONATED' | 'EXPIRED'; daysAgo: number; from?: CompanyStatus | null; to?: CompanyStatus | null; data?: Record<string, unknown>; system?: boolean; support?: boolean }
interface CompanyDef {
  nameAr: string; nameEn: string; sector: string; city: string; status: CompanyStatus; plan: Plan; cycle: BillingCycle; max: number | null; price: number | null;
  createdDaysAgo: number; employees: number; owner: { name: string; email: string; phone: string }; hr?: { name: string; email: string };
  activatedDaysAgo?: number; trialEndsIn?: number; subscriptionEndsIn?: number; suspendedDaysAgo?: number; suspensionReason?: string; adminNotes?: string;
  lastActivityHoursAgo: number | null; attendance?: [fromDaysAgo: number, toDaysAgo: number]; payrollMonthsAgo?: number; leaves?: boolean; events: EventDef[];
}

/** The 7 extra companies, seeded as co-02 … co-08 (co-01 is the demo company). */
function companyDefs(): CompanyDef[] {
  return [
    {
      nameAr: 'مؤسسة أركان المدى للمقاولات', nameEn: 'Arkan Al-Mada Contracting', sector: 'CONTRACTING', city: 'الرياض', status: 'PENDING', plan: 'GROWTH', cycle: 'MONTHLY',
      max: null, price: null, createdDaysAgo: 1, employees: 6, owner: { name: 'سلطان الشمري', email: 'owner@arkan.demo', phone: '+966551204411' }, lastActivityHoursAgo: null,
      events: [{ type: 'REGISTERED', daysAgo: 1, to: 'PENDING', system: true, data: { employeesCount: 25 } }],
    },
    {
      nameAr: 'عيادات بسمة الطبية', nameEn: 'Basma Medical Clinics', sector: 'HEALTHCARE', city: 'جدة', status: 'PENDING', plan: 'GROWTH', cycle: 'MONTHLY',
      max: null, price: null, createdDaysAgo: 3, employees: 4, owner: { name: 'هيفاء الغامدي', email: 'owner@basma.demo', phone: '+966562318840' }, lastActivityHoursAgo: null,
      events: [
        { type: 'REGISTERED', daysAgo: 3, to: 'PENDING', system: true, data: { employeesCount: 12 } },
        { type: 'NOTE', daysAgo: 2, from: 'PENDING', to: 'PENDING', support: true, data: { note: 'تم التواصل هاتفياً — بانتظار صورة السجل التجاري' } },
      ],
      adminNotes: 'تم التواصل هاتفياً — بانتظار صورة السجل التجاري',
    },
    {
      nameAr: 'متاجر لمسة أناقة', nameEn: 'Lamsa Fashion Stores', sector: 'RETAIL', city: 'الرياض', status: 'TRIAL', plan: 'ESSENTIALS', cycle: 'MONTHLY',
      max: 15, price: null, createdDaysAgo: 12, activatedDaysAgo: 11, trialEndsIn: 3, employees: 8, owner: { name: 'ريم العنزي', email: 'owner@lamsa.demo', phone: '+966503377120' },
      lastActivityHoursAgo: 5, attendance: [10, 1],
      events: [
        { type: 'REGISTERED', daysAgo: 12, to: 'PENDING', system: true, data: { employeesCount: 10 } },
        { type: 'ACTIVATED', daysAgo: 11, from: 'PENDING', to: 'TRIAL', data: { mode: 'TRIAL', plan: 'ESSENTIALS', billingCycle: 'MONTHLY', maxEmployees: 15 } },
      ],
    },
    {
      nameAr: 'مخابز السنبلة الذهبية', nameEn: 'Golden Sunbula Bakeries', sector: 'RESTAURANTS', city: 'الدمام', status: 'TRIAL', plan: 'GROWTH', cycle: 'MONTHLY',
      max: 20, price: null, createdDaysAgo: 5, activatedDaysAgo: 4, trialEndsIn: 10, employees: 7, owner: { name: 'خالد البقمي', email: 'owner@sunbula.demo', phone: '+966545100982' },
      lastActivityHoursAgo: 30, attendance: [4, 1],
      events: [
        { type: 'REGISTERED', daysAgo: 5, to: 'PENDING', system: true, data: { employeesCount: 18 } },
        { type: 'ACTIVATED', daysAgo: 4, from: 'PENDING', to: 'TRIAL', support: true, data: { mode: 'TRIAL', plan: 'GROWTH', billingCycle: 'MONTHLY', maxEmployees: 20 } },
        { type: 'IMPERSONATED', daysAgo: 3, from: 'TRIAL', to: 'TRIAL', support: true, data: { reason: 'مساعدة في إعداد الورديات' } },
      ],
    },
    {
      nameAr: 'شركة مسار السريع للنقل', nameEn: 'Masar Express Logistics', sector: 'LOGISTICS', city: 'الرياض', status: 'SUSPENDED', plan: 'GROWTH', cycle: 'MONTHLY',
      max: 25, price: null, createdDaysAgo: 200, activatedDaysAgo: 198, subscriptionEndsIn: 20, suspendedDaysAgo: 9, suspensionReason: 'تأخر السداد', employees: 10,
      owner: { name: 'ماجد السبيعي', email: 'owner@masar.demo', phone: '+966558830017' }, lastActivityHoursAgo: 24 * 9 + 3, attendance: [24, 10], payrollMonthsAgo: 2,
      adminNotes: 'فاتورتان متأخرتان — تم إرسال تذكير بالبريد',
      events: [
        { type: 'REGISTERED', daysAgo: 200, to: 'PENDING', system: true, data: { employeesCount: 15 } },
        { type: 'ACTIVATED', daysAgo: 198, from: 'PENDING', to: 'ACTIVE', data: { mode: 'PAID', plan: 'GROWTH', billingCycle: 'MONTHLY', maxEmployees: 15 } },
        { type: 'PLAN_CHANGED', daysAgo: 120, from: 'ACTIVE', to: 'ACTIVE', data: { changes: { maxEmployees: { from: 15, to: 25 } } } },
        { type: 'NOTE', daysAgo: 15, from: 'ACTIVE', to: 'ACTIVE', support: true, data: { note: 'فاتورتان متأخرتان — تم إرسال تذكير بالبريد' } },
        { type: 'SUSPENDED', daysAgo: 9, from: 'ACTIVE', to: 'SUSPENDED', data: { reason: 'تأخر السداد' } },
      ],
    },
    {
      nameAr: 'مقاهي قهوة الديرة', nameEn: 'Deira Coffee', sector: 'RESTAURANTS', city: 'بريدة', status: 'EXPIRED', plan: 'ESSENTIALS', cycle: 'MONTHLY',
      max: 10, price: null, createdDaysAgo: 42, activatedDaysAgo: 41, trialEndsIn: -27, employees: 5, owner: { name: 'عبدالرحمن الحربي', email: 'owner@deira.demo', phone: '+966534482265' },
      lastActivityHoursAgo: 24 * 28, attendance: [40, 28],
      events: [
        { type: 'REGISTERED', daysAgo: 42, to: 'PENDING', system: true, data: { employeesCount: 6 } },
        { type: 'ACTIVATED', daysAgo: 41, from: 'PENDING', to: 'TRIAL', data: { mode: 'TRIAL', plan: 'ESSENTIALS', billingCycle: 'MONTHLY', maxEmployees: 10 } },
        { type: 'NOTE', daysAgo: 29, from: 'TRIAL', to: 'TRIAL', support: true, data: { note: 'المالك مهتم لكنه يؤجل الاشتراك لبعد الموسم' } },
        { type: 'EXPIRED', daysAgo: 26, from: 'TRIAL', to: 'EXPIRED', system: true },
      ],
    },
    {
      nameAr: 'مجموعة الواحة للتجزئة', nameEn: 'Al-Waha Retail Group', sector: 'RETAIL', city: 'الخبر', status: 'ACTIVE', plan: 'ENTERPRISE', cycle: 'ANNUAL',
      max: 100, price: 22, createdDaysAgo: 150, activatedDaysAgo: 148, subscriptionEndsIn: 215, employees: 12,
      owner: { name: 'فيصل القحطاني', email: 'owner@alwaha.demo', phone: '+966505561203' }, hr: { name: 'جواهر المالكي', email: 'hr@alwaha.demo' },
      lastActivityHoursAgo: 20, attendance: [14, 1], payrollMonthsAgo: 1, leaves: true, adminNotes: 'عقد سنوي — سعر خاص 22 ر.س للموظف',
      events: [
        { type: 'REGISTERED', daysAgo: 150, to: 'PENDING', system: true, data: { employeesCount: 80 } },
        { type: 'ACTIVATED', daysAgo: 148, from: 'PENDING', to: 'ACTIVE', data: { mode: 'PAID', plan: 'ENTERPRISE', billingCycle: 'ANNUAL', maxEmployees: 100, pricePerEmployee: 22 } },
        { type: 'NOTE', daysAgo: 147, from: 'ACTIVE', to: 'ACTIVE', data: { note: 'عقد سنوي — سعر خاص 22 ر.س للموظف' } },
        { type: 'IMPERSONATED', daysAgo: 40, from: 'ACTIVE', to: 'ACTIVE', support: true, data: { reason: 'دعم في إعداد مسير الرواتب' } },
      ],
    },
  ];
}

export function seedPlatform(db: DB, svc: Services, now: Date) {
  st = 20261024;
  const today = todayStr(now);
  const rel = (n: number) => addDays(today, n);
  const ago = (days: number, hours = 0) => new Date(now.getTime() - days * 86400000 - hours * 3600000).toISOString();
  const createdAt = now.toISOString();

  // ---------- platform admins ----------
  db.admins.push(
    { ...PLATFORM_ADMIN, password: 'Shuoon@2026', isActive: true, lastLoginAt: ago(1), createdAt: ago(400), updatedAt: createdAt },
    { ...SUPPORT_ADMIN, password: 'Shuoon@2026', isActive: true, lastLoginAt: ago(2, 4), createdAt: ago(180), updatedAt: createdAt },
  );
  const adminActor: Actor = { id: PLATFORM_ADMIN.id, name: PLATFORM_ADMIN.name };
  const supportActor: Actor = { id: SUPPORT_ADMIN.id, name: SUPPORT_ADMIN.name };

  // ---------- demo company (co-01) history ----------
  const demo = db.companies[0];
  const demoOwner = db.users.find((u) => u.companyId === demo.id && u.role === 'OWNER');
  if (demoOwner) demoOwner.phone = '+966501234567';
  const demoCreated = Math.round((now.getTime() - new Date(demo.createdAt).getTime()) / 86400000);
  logEvent(svc, demo, 'REGISTERED', { to: 'PENDING', data: { employeesCount: 40 }, createdAt: ago(demoCreated) });
  logEvent(svc, demo, 'ACTIVATED', { from: 'PENDING', to: 'ACTIVE', actor: adminActor, data: { mode: 'PAID', plan: 'GROWTH', billingCycle: 'MONTHLY', maxEmployees: 50 }, createdAt: ago(demoCreated - 1, -3) });
  logEvent(svc, demo, 'PLAN_CHANGED', { from: 'ACTIVE', to: 'ACTIVE', actor: adminActor, data: { changes: { maxEmployees: { from: 50, to: 60 } } }, createdAt: ago(60) });
  logEvent(svc, demo, 'EXTENDED', { from: 'ACTIVE', to: 'ACTIVE', actor: supportActor, data: { days: 300, field: 'subscriptionEndsAt', to: demo.subscriptionEndsAt }, createdAt: ago(20) });
  logEvent(svc, demo, 'NOTE', { from: 'ACTIVE', to: 'ACTIVE', actor: adminActor, data: { note: demo.adminNotes }, createdAt: ago(18) });

  // ---------- extra companies ----------
  let empSeq = 0;
  companyDefs().forEach((d, i) => {
    const companyId = companyPoolId(i + 2);
    const created = ago(d.createdDaysAgo, randInt(1, 9));
    const c: Company = {
      id: companyId, nameAr: d.nameAr, nameEn: d.nameEn, crNumber: `${pick(['1010', '4030', '2050', '1131'])}${digits(6)}`, establishmentId: d.status === 'PENDING' ? null : `70${digits(8)}`,
      gosiNumber: d.status === 'PENDING' ? null : `5${digits(8)}`, vatNumber: null, sector: d.sector, city: d.city, iban: null, bankCode: null,
      weekendDays: [5, 6], payrollDay: 27, employeesCount: d.employees, createdAt: created, updatedAt: createdAt,
      ...lifecycleDefaults(),
      status: d.status, plan: d.plan, billingCycle: d.cycle, maxEmployees: d.max, pricePerEmployee: d.price,
      trialEndsAt: d.trialEndsIn !== undefined ? endOfDay(rel(d.trialEndsIn)) : null,
      subscriptionEndsAt: d.subscriptionEndsIn !== undefined ? endOfDay(rel(d.subscriptionEndsIn)) : null,
      activatedAt: d.activatedDaysAgo !== undefined ? ago(d.activatedDaysAgo, 2) : null,
      suspendedAt: d.suspendedDaysAgo !== undefined ? ago(d.suspendedDaysAgo, 1) : null,
      suspensionReason: d.suspensionReason ?? null, adminNotes: d.adminNotes ?? null,
      lastActivityAt: d.lastActivityHoursAgo === null ? null : ago(0, d.lastActivityHoursAgo),
    };
    db.companies.push(c);
    const ltIds: Record<string, string> = {};
    for (const p of SAUDI_LEAVE_POLICIES) {
      const id = nextId(db, 'lt');
      ltIds[p.code] = id;
      db.leaveTypes.push({ id, companyId, code: p.code, nameAr: p.nameAr, nameEn: p.nameEn, paid: p.paid, maxDaysPerYear: p.maxDaysPerYear, createdAt: created });
    }
    const [lat, lng] = CITY_GEO[d.city] ?? CITY_GEO['الرياض'];
    const branchId = nextId(db, 'br');
    db.branches.push({ id: branchId, companyId, nameAr: `الفرع الرئيسي — ${d.city}`, nameEn: 'Main branch', city: d.city, address: null, lat, lng, radiusMeters: 200, managerEmployeeId: null, createdAt: created, updatedAt: createdAt });
    const shift = { id: nextId(db, 'sh'), companyId, branchId, name: 'الدوام الرسمي', startTime: '08:00', endTime: '17:00', breakMinutes: 60, graceMinutes: 15, days: [0, 1, 2, 3, 4, 6], color: '#2F6F9F', createdAt: created };
    db.shifts.push(shift);

    // employees
    const emps: Employee[] = [];
    for (let k = 0; k < d.employees; k++) {
      empSeq++;
      const saudi = k === 0 || rand() < 0.4;
      const female = saudi && rand() < 0.3;
      const [first, last, nat] = saudi ? [pick(female ? SAUDI_F : SAUDI_M), pick(SAUDI_LAST), 'SA'] : pick(EXPATS);
      const hire = addDays(today, -randInt(Math.max(30, d.createdDaysAgo), d.createdDaysAgo + 900));
      const basic = Math.round(randInt(3500, 12000) / 100) * 100;
      const bank = pick(['80', '10', '20', '05', '45']);
      const id = empSeq <= OTHER_COMPANY_EMPLOYEE_POOL ? companyEmployeeId(empSeq) : nextId(db, 'emp-x');
      const e: Employee = {
        id, companyId, employeeNumber: `EMP-${String(k + 1).padStart(4, '0')}`, firstNameAr: first, lastNameAr: last, fullNameEn: null, nationality: nat, isSaudi: saudi,
        gender: female ? 'FEMALE' : 'MALE', birthDate: `${randInt(1975, 2000)}-${String(randInt(1, 12)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`,
        maritalStatus: rand() < 0.6 ? 'MARRIED' : 'SINGLE', nationalId: (saudi ? '1' : '2') + digits(9), idExpiry: rel(randInt(saudi ? 400 : 40, saudi ? 2500 : 500)),
        passportNumber: saudi ? null : `${nat}${digits(7)}`, passportExpiry: saudi ? null : rel(randInt(200, 1500)), phone: `+9665${digits(8)}`, email: null,
        branchId, departmentId: null, managerId: k === 0 ? null : emps[0]?.id ?? null, jobTitle: k === 0 ? 'المدير العام' : pick(TITLES[d.sector] ?? TITLES.RETAIL),
        hireDate: hire, contractType: saudi ? 'UNLIMITED' : 'FIXED', contractEndDate: saudi ? null : rel(randInt(60, 700)), probationEndDate: addDays(hire, 90),
        status: 'ACTIVE', terminationDate: null, terminationReason: null, basicSalary: k === 0 ? 15000 : basic, housingAllowance: Math.round((k === 0 ? 15000 : basic) * 0.25),
        transportAllowance: Math.max(300, Math.round((k === 0 ? 15000 : basic) * 0.1)), otherAllowances: 0, iban: saudiIban(bank), bankCode: bank, gosiRegistered: true,
        hoursPerDay: 8, avatarColor: COLORS[(empSeq + k) % COLORS.length], annualLeaveCarryOver: 0, createdAt: created, updatedAt: createdAt,
      };
      db.employees.push(e);
      emps.push(e);
    }
    db.branches.find((b) => b.id === branchId)!.managerEmployeeId = emps[0]?.id ?? null;

    // users
    const ownerId = nextId(db, 'usr');
    db.users.push({
      id: ownerId, companyId, email: d.owner.email, password: 'Shuoon@2026', name: d.owner.name, role: 'OWNER', employeeId: null, isActive: true, phone: d.owner.phone,
      lastLoginAt: d.lastActivityHoursAgo === null ? created : ago(0, d.lastActivityHoursAgo), createdAt: created, updatedAt: createdAt,
    });
    if (d.hr) {
      db.users.push({ id: nextId(db, 'usr'), companyId, email: d.hr.email, password: 'Shuoon@2026', name: d.hr.name, role: 'HR_ADMIN', employeeId: emps[1]?.id ?? null, isActive: true, lastLoginAt: ago(1, 2), createdAt: ago(d.createdDaysAgo - 2), updatedAt: createdAt });
    }

    // usage: attendance
    if (d.attendance) {
      const [fromAgo, toAgo] = d.attendance;
      for (const ds of eachDay(rel(-fromAgo), rel(-toAgo))) {
        if (!shift.days.includes(weekday(ds))) continue;
        for (const e of emps) {
          if (e.hireDate > ds || rand() < 0.08) continue;
          const inAt = riyadhDateTime(ds, `07:${String(randInt(45, 59)).padStart(2, '0')}`);
          const checkIn = rand() < 0.15 ? new Date(inAt.getTime() + randInt(20, 40) * 60000) : inAt;
          const checkOut = riyadhDateTime(ds, `17:${String(randInt(0, 25)).padStart(2, '0')}`);
          const m = svc.compute(shift, checkIn, checkOut);
          db.attendance.push({
            id: nextId(db, 'att'), companyId, employeeId: e.id, date: ds, shiftId: shift.id, checkIn: checkIn.toISOString(), checkOut: checkOut.toISOString(),
            checkInLat: lat, checkInLng: lng, checkOutLat: lat, checkOutLng: lng, ...m, source: 'MOBILE', note: null, createdAt: checkIn.toISOString(), updatedAt: checkOut.toISOString(),
          });
        }
      }
    }
    // usage: leaves
    if (d.leaves && emps.length > 3) {
      const opts = { weekendDays: [5, 6], holidays: [] as string[] };
      const leave = (e: Employee, code: string, start: string, end: string, status: 'APPROVED' | 'PENDING', createdDaysAgo: number) => db.leaves.push({
        id: nextId(db, 'lv'), companyId, employeeId: e.id, leaveTypeId: ltIds[code], startDate: start, endDate: end, days: countLeaveDays(start, end, opts), reason: null, status,
        approverId: status === 'APPROVED' ? ownerId : null, approverName: status === 'APPROVED' ? d.owner.name : null, decidedAt: status === 'APPROVED' ? ago(createdDaysAgo - 1) : null,
        comment: null, createdAt: ago(createdDaysAgo),
      });
      leave(emps[2], 'ANNUAL', rel(-12), rel(-8), 'APPROVED', 20);
      leave(emps[3], 'ANNUAL', rel(6), rel(9), 'PENDING', 2);
    }
    // usage: one paid payroll run (real engine)
    if (d.payrollMonthsAgo) {
      const period = addMonths(periodOf(today), -d.payrollMonthsAgo);
      const id = runId(period);
      db.runs.push({
        id, companyId, period, status: 'DRAFT', employeesCount: 0, totalGross: 0, totalDeductions: 0, totalNet: 0, totalGosiEmployer: 0, totalEmployerCost: 0,
        calculatedAt: null, approvedAt: null, approvedById: null, approvedByName: null, paidAt: null, createdAt: `${period}-24T06:00:00.000Z`, updatedAt: createdAt,
      });
      svc.calculateRun(companyId, id);
      const run = svc.approveRun(companyId, id, { id: ownerId, name: d.owner.name });
      Object.assign(run, { status: 'PAID', calculatedAt: `${period}-25T06:00:00.000Z`, approvedAt: `${period}-26T07:00:00.000Z`, paidAt: `${period}-27T06:00:00.000Z` });
    }

    // lifecycle history
    for (const ev of d.events) {
      const actor = ev.system ? undefined : ev.support ? supportActor : adminActor;
      const at = ev.type === 'REGISTERED' ? created : ago(ev.daysAgo, ev.system ? 0 : -randInt(1, 6));
      logEvent(svc, c, ev.type, { from: ev.from ?? null, to: ev.to ?? null, actor, data: ev.data ?? null, createdAt: at });
    }
    svc.audit({ id: ownerId, name: d.owner.name, companyId }, 'REGISTER', 'Company', companyId, undefined, created);
  });

  // ---------- leads ----------
  const leads: [string, string, string, string, number, string, string | null, 'NEW' | 'CONTACTED' | 'CONVERTED' | 'LOST', string | null, number][] = [
    ['منصور الدوسري', 'مطاعم برجر الحي', 'mansour@burgerhay.sa', '+966551112233', 35, 'RESTAURANTS', 'نريد عرضاً لثلاثة فروع مع ربط الحضور بالجوال', 'NEW', null, 0.3],
    ['أسماء الزهراني', 'مجمع عيادات ابتسامة', 'asma@ebtisama.sa', '+966562224455', 22, 'HEALTHCARE', 'هل يدعم النظام الورديات الليلية للممرضين؟', 'NEW', null, 1.5],
    ['حمد العنزي', 'شركة الأفق للمقاولات', 'hamad@alofuq.sa', '+966503336677', 120, 'CONTRACTING', 'لدينا عمالة كبيرة ونحتاج ملف حماية الأجور شهرياً', 'CONTACTED', 'عرض توضيحي يوم الأحد القادم', 4],
    ['لمى القرشي', 'متاجر وردة للعطور', 'lama@warda.sa', '+966544447788', 18, 'RETAIL', null, 'CONTACTED', 'أرسلنا عرض السعر — بانتظار الرد', 7],
    ['فيصل القحطاني', 'مجموعة الواحة للتجزئة', 'owner@alwaha.demo', '+966505561203', 80, 'RETAIL', 'نرغب بعقد سنوي', 'CONVERTED', 'تحوّل لعميل — باقة المؤسسات', 152],
    ['ثامر المطيري', 'نقليات الشمال', 'thamer@shamal.sa', '+966535559900', 40, 'LOGISTICS', 'نبحث عن نظام بسعر أقل', 'LOST', 'اختار مزوداً آخر بسبب السعر', 25],
  ];
  leads.forEach(([name, company, email, phone, employeesCount, sector, message, status, notes, daysAgo]) => {
    const at = new Date(now.getTime() - daysAgo * 86400000).toISOString();
    db.leads.push({ id: nextId(db, 'lead'), name, company, email, phone, employeesCount, sector, message, status, notes, createdAt: at, updatedAt: at });
  });
}
