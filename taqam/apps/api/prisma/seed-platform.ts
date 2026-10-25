/* eslint-disable no-console */
/**
 * Platform admin portal demo data (docs/ADMIN_PORTAL.md → "Seed additions"):
 * the SUPER_ADMIN account, 7 extra subscriber companies in mixed lifecycle states, their event history, and 6 leads.
 */
import { BillingCycle, CompanyEventType, CompanyStatus, EmailType, PaymentMethod, Plan, Prisma, PrismaClient } from '@prisma/client';
import { SAUDI_LEAVE_POLICIES } from '@taqam/core';
import { addDays, day, riyadhDateTime, todayStr } from '../src/common/dates';
import { addDaysStr, addMonthsClamped, computeInvoice, DEFAULT_BILLING, nextInvoiceNumber, periodEndOf } from '../src/billing/billing.math';
import { EmailContent, expiredEmail, invoiceIssuedEmail, invoiceOverdueEmail, paymentReceivedEmail, trialEndingEmail } from '../src/billing/billing.emails';

export const ADMIN_EMAIL = 'admin@shuoon.demo';
export const ADMIN_NAME = 'مدير المنصة';

interface ExtraCompany {
  nameAr: string;
  nameEn: string;
  sector: string;
  city: string;
  crNumber: string;
  status: CompanyStatus;
  plan: Plan;
  billingCycle: BillingCycle;
  maxEmployees: number | null;
  pricePerEmployee: number | null;
  createdDaysAgo: number;
  owner: { name: string; email: string; phone: string };
  branch: { nameAr: string; lat: number; lng: number };
  employees: number;
  /** Lifecycle history: [type, daysAgo, from, to, data?] — the last entry defines the current state. */
  history: [CompanyEventType, number, CompanyStatus | null, CompanyStatus | null, Record<string, unknown>?][];
  trialEndsInDays?: number;
  subscriptionEndsInDays?: number;
  activatedDaysAgo?: number;
  suspended?: { daysAgo: number; reason: string };
  lastActivityHoursAgo?: number;
  adminNotes?: string;
}

// prettier-ignore
export const EXTRA_COMPANIES: ExtraCompany[] = [
  {
    nameAr: 'مخابز الحطب الذهبي', nameEn: 'Golden Hatab Bakeries', sector: 'RESTAURANTS', city: 'الرياض', crNumber: '1010781234',
    status: 'PENDING', plan: 'GROWTH', billingCycle: 'MONTHLY', maxEmployees: null, pricePerEmployee: null, createdDaysAgo: 1,
    owner: { name: 'عبدالله السالم', email: 'owner.hatab@shuoon.demo', phone: '+966501112233' },
    branch: { nameAr: 'فرع النرجس', lat: 24.8402, lng: 46.6591 }, employees: 6,
    history: [['REGISTERED', 1, null, 'PENDING', { sector: 'RESTAURANTS', employeesCount: 8 }]],
  },
  {
    nameAr: 'مجمع رواء الطبي', nameEn: 'Rawa Medical Complex', sector: 'HEALTHCARE', city: 'جدة', crNumber: '4030556677',
    status: 'PENDING', plan: 'GROWTH', billingCycle: 'MONTHLY', maxEmployees: null, pricePerEmployee: null, createdDaysAgo: 3,
    owner: { name: 'هند الزهراني', email: 'owner.rawa@shuoon.demo', phone: '+966552223344' },
    branch: { nameAr: 'الفرع الرئيسي – الروضة', lat: 21.5649, lng: 39.1561 }, employees: 9,
    history: [['REGISTERED', 3, null, 'PENDING', { sector: 'HEALTHCARE', employeesCount: 25 }]],
  },
  {
    nameAr: 'مقهى بن الديرة', nameEn: 'Bin Al-Deera Coffee', sector: 'RESTAURANTS', city: 'الرياض', crNumber: '1010902211',
    status: 'TRIAL', plan: 'GROWTH', billingCycle: 'MONTHLY', maxEmployees: 15, pricePerEmployee: null, createdDaysAgo: 12,
    owner: { name: 'فيصل المطيري', email: 'owner.deera@shuoon.demo', phone: '+966533334455' },
    branch: { nameAr: 'فرع حي الملك فهد', lat: 24.7311, lng: 46.6702 }, employees: 5,
    trialEndsInDays: 3, activatedDaysAgo: 11, lastActivityHoursAgo: 5,
    history: [
      ['REGISTERED', 12, null, 'PENDING', { sector: 'RESTAURANTS', employeesCount: 6 }],
      ['ACTIVATED', 11, 'PENDING', 'TRIAL', { mode: 'TRIAL', plan: 'GROWTH', billingCycle: 'MONTHLY', maxEmployees: 15 }],
    ],
  },
  {
    nameAr: 'مؤسسة البناء المتين للمقاولات', nameEn: 'Al-Binaa Al-Mateen Contracting', sector: 'CONTRACTING', city: 'الدمام', crNumber: '2050334455',
    status: 'TRIAL', plan: 'GROWTH', billingCycle: 'MONTHLY', maxEmployees: null, pricePerEmployee: null, createdDaysAgo: 5,
    owner: { name: 'سعد الدوسري', email: 'owner.mateen@shuoon.demo', phone: '+966544445566' },
    branch: { nameAr: 'المكتب الرئيسي – الفيصلية', lat: 26.4207, lng: 50.0888 }, employees: 12,
    trialEndsInDays: 10, activatedDaysAgo: 4, lastActivityHoursAgo: 20,
    history: [
      ['REGISTERED', 5, null, 'PENDING', { sector: 'CONTRACTING', employeesCount: 40 }],
      ['ACTIVATED', 4, 'PENDING', 'TRIAL', { mode: 'TRIAL', plan: 'GROWTH', billingCycle: 'MONTHLY' }],
    ],
  },
  {
    nameAr: 'أسواق النخبة', nameEn: 'Al-Nukhba Markets', sector: 'RETAIL', city: 'الرياض', crNumber: '1010447788',
    status: 'SUSPENDED', plan: 'ESSENTIALS', billingCycle: 'MONTHLY', maxEmployees: 20, pricePerEmployee: null, createdDaysAgo: 200,
    owner: { name: 'خالد العنزي', email: 'owner.nukhba@shuoon.demo', phone: '+966505556677' },
    branch: { nameAr: 'فرع السويدي', lat: 24.5953, lng: 46.6729 }, employees: 8,
    activatedDaysAgo: 186, subscriptionEndsInDays: 60, suspended: { daysAgo: 6, reason: 'تأخر السداد' }, lastActivityHoursAgo: 24 * 7,
    adminNotes: 'فاتورتان متأخرتان — تم التواصل مع المالك مرتين.',
    history: [
      ['REGISTERED', 200, null, 'PENDING', { sector: 'RETAIL', employeesCount: 10 }],
      ['ACTIVATED', 199, 'PENDING', 'TRIAL', { mode: 'TRIAL', plan: 'ESSENTIALS', billingCycle: 'MONTHLY' }],
      ['ACTIVATED', 186, 'TRIAL', 'ACTIVE', { mode: 'PAID', plan: 'ESSENTIALS', billingCycle: 'MONTHLY', maxEmployees: 20 }],
      ['NOTE', 20, 'ACTIVE', 'ACTIVE', { note: 'فاتورتان متأخرتان — تم التواصل مع المالك مرتين.' }],
      ['SUSPENDED', 6, 'ACTIVE', 'SUSPENDED', { reason: 'تأخر السداد' }],
    ],
  },
  {
    nameAr: 'صالون لمسة جمال', nameEn: 'Lamsat Jamal Salon', sector: 'OTHER', city: 'الخبر', crNumber: '2051223344',
    status: 'EXPIRED', plan: 'ESSENTIALS', billingCycle: 'MONTHLY', maxEmployees: null, pricePerEmployee: null, createdDaysAgo: 25,
    owner: { name: 'أريج القحطاني', email: 'owner.lamsa@shuoon.demo', phone: '+966566667788' },
    branch: { nameAr: 'فرع العقربية', lat: 26.2794, lng: 50.2083 }, employees: 4,
    trialEndsInDays: -10, activatedDaysAgo: 24, lastActivityHoursAgo: 24 * 11,
    history: [
      ['REGISTERED', 25, null, 'PENDING', { sector: 'OTHER', employeesCount: 5 }],
      ['ACTIVATED', 24, 'PENDING', 'TRIAL', { mode: 'TRIAL', plan: 'ESSENTIALS', billingCycle: 'MONTHLY' }],
      ['EXPIRED', 10, 'TRIAL', 'EXPIRED', {}],
    ],
  },
  {
    nameAr: 'شركة مسار للخدمات اللوجستية', nameEn: 'Masar Logistics', sector: 'LOGISTICS', city: 'جدة', crNumber: '4030998877',
    status: 'ACTIVE', plan: 'ENTERPRISE', billingCycle: 'ANNUAL', maxEmployees: 200, pricePerEmployee: 22, createdDaysAgo: 300,
    owner: { name: 'ماجد الغامدي', email: 'owner.masar@shuoon.demo', phone: '+966577778899' },
    branch: { nameAr: 'مستودع الخمرة', lat: 21.3891, lng: 39.2105 }, employees: 15,
    activatedDaysAgo: 290, subscriptionEndsInDays: 65, lastActivityHoursAgo: 2,
    adminNotes: 'عميل مؤسسي — سعر خاص 22 ر.س للموظف بعقد سنوي.',
    history: [
      ['REGISTERED', 300, null, 'PENDING', { sector: 'LOGISTICS', employeesCount: 120 }],
      ['ACTIVATED', 290, 'PENDING', 'ACTIVE', { mode: 'PAID', plan: 'ENTERPRISE', billingCycle: 'ANNUAL', pricePerEmployee: 22, maxEmployees: 150 }],
      ['PLAN_CHANGED', 120, 'ACTIVE', 'ACTIVE', { changes: { maxEmployees: { from: 150, to: 200 } } }],
      ['NOTE', 119, 'ACTIVE', 'ACTIVE', { note: 'عميل مؤسسي — سعر خاص 22 ر.س للموظف بعقد سنوي.' }],
      ['IMPERSONATED', 30, 'ACTIVE', 'ACTIVE', { email: 'owner.masar@shuoon.demo' }],
    ],
  },
];

export const EXTRA_OWNER_EMAILS = EXTRA_COMPANIES.map((c) => c.owner.email);
export const EXTRA_COMPANY_NAMES_EN = EXTRA_COMPANIES.map((c) => c.nameEn);

// prettier-ignore
const LEADS: { name: string; company: string; email: string; phone: string; employeesCount: number; sector: string; message: string; status: 'NEW' | 'CONTACTED' | 'CONVERTED' | 'LOST'; notes: string | null; daysAgo: number }[] = [
  { name: 'تركي العمري', company: 'مطاعم سفرة نجد', email: 'turki@safratnajd.sa', phone: '+966501234111', employeesCount: 85, sector: 'RESTAURANTS', message: 'لدينا 6 فروع ونحتاج ربط الحضور بالفروع ومسير رواتب حماية الأجور.', status: 'NEW', notes: null, daysAgo: 0 },
  { name: 'منيرة الشهري', company: 'صيدليات الشفاء الأولى', email: 'munira@shifa1.sa', phone: '+966551234222', employeesCount: 30, sector: 'HEALTHCARE', message: 'نرغب بعرض توضيحي لنظام الإجازات والسعودة.', status: 'NEW', notes: null, daysAgo: 2 },
  { name: 'عمر باعشن', company: 'مؤسسة الرصيف للمقاولات', email: 'omar@alraseef.sa', phone: '+966561234333', employeesCount: 140, sector: 'CONTRACTING', message: 'كم تكلفة باقة المؤسسات لـ 140 عاملاً؟', status: 'CONTACTED', notes: 'اتصال أول — طلب عرض سعر مكتوب.', daysAgo: 6 },
  { name: 'ريما الحربي', company: 'متاجر لمسات', email: 'reema@lamasat.sa', phone: '+966571234444', employeesCount: 18, sector: 'RETAIL', message: 'هل يدعم النظام أكثر من فرع في مدن مختلفة؟', status: 'CONTACTED', notes: 'عرض توضيحي مجدول الأحد القادم.', daysAgo: 9 },
  { name: 'ماجد الغامدي', company: 'شركة مسار للخدمات اللوجستية', email: 'majed@masar-logistics.sa', phone: '+966577778899', employeesCount: 120, sector: 'LOGISTICS', message: 'نبحث عن بديل لنظام الرواتب الحالي.', status: 'CONVERTED', notes: 'تحوّل لعميل — باقة المؤسسات (سنوي).', daysAgo: 305 },
  { name: 'نايف السبيعي', company: 'مغاسل الندى', email: 'naif@alnada.sa', phone: '+966581234555', employeesCount: 9, sector: 'OTHER', message: 'نريد تجربة مجانية.', status: 'LOST', notes: 'اختار حلاً محاسبياً أبسط.', daysAgo: 40 },
];
export const LEAD_EMAILS = LEADS.map((l) => l.email);

const FIRST_M = ['أحمد', 'محمد', 'عبدالعزيز', 'سلمان', 'يوسف', 'إبراهيم', 'حمد', 'ناصر', 'بدر', 'مشعل', 'زياد', 'هشام'];
const FIRST_F = ['سارة', 'لمى', 'جود', 'رهف', 'دانة', 'منى'];
const LAST = ['الحربي', 'العتيبي', 'القرني', 'الشمري', 'البلوي', 'الجهني', 'الرشيد', 'العمري', 'السهلي', 'الخالدي'];
const EXPATS: [string, string, string][] = [
  ['محمد', 'رحمن', 'BD'], ['راهول', 'ناير', 'IN'], ['جوزيف', 'ديلا كروز', 'PH'], ['أحمد', 'عبدالحميد', 'EG'], ['أسد', 'علي', 'PK'], ['سامي', 'الحلبي', 'SY'],
];
const TITLES: Record<string, string[]> = {
  RESTAURANTS: ['خبّاز', 'باريستا', 'كاشير', 'عامل خدمة', 'مشرف وردية'],
  HEALTHCARE: ['ممرضة', 'فني مختبر', 'موظف استقبال', 'طبيب عام', 'صيدلي'],
  CONTRACTING: ['مهندس موقع', 'مراقب سلامة', 'كهربائي', 'سائق معدات', 'محاسب'],
  RETAIL: ['أمين صندوق', 'منسق رفوف', 'مشرف مبيعات', 'أمين مستودع'],
  OTHER: ['مصففة شعر', 'خبيرة تجميل', 'موظفة استقبال'],
  LOGISTICS: ['سائق شاحنة', 'منسق شحنات', 'أمين مستودع', 'مشرف أسطول', 'محاسب'],
};

export async function wipePlatformDemo(prisma: PrismaClient, companyIds: string[]) {
  if (companyIds.length) await prisma.companyEvent.deleteMany({ where: { companyId: { in: companyIds } } });
  // invoices cascade with the companies; the email log is not FK-bound
  if (companyIds.length) await prisma.emailLog.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.lead.deleteMany({ where: { email: { in: LEAD_EMAILS } } });
}

export async function seedPlatform(prisma: PrismaClient, opts: { passwordHash: string; demoCompanyId: string; demoCreatedDaysAgo: number }) {
  const today = todayStr();
  const now = Date.now();
  const daysAgo = (n: number, hour = '10:00') => riyadhDateTime(addDays(today, -n), hour);
  const endOfDayIn = (n: number) => new Date(riyadhDateTime(addDays(today, n), '23:59').getTime() + 59999);

  // ---------- platform admin ----------
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { name: ADMIN_NAME, role: 'SUPER_ADMIN', companyId: null, employeeId: null, passwordHash: opts.passwordHash, isActive: true },
    create: { email: ADMIN_EMAIL, name: ADMIN_NAME, role: 'SUPER_ADMIN', companyId: null, passwordHash: opts.passwordHash, createdAt: daysAgo(400) },
  });
  const by = { adminId: admin.id, adminName: admin.name };
  await prisma.platformSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  // ---------- the main demo company: ACTIVE, GROWTH, MONTHLY, 60 seats, renews in 10 months ----------
  const demo = await prisma.company.update({
    where: { id: opts.demoCompanyId },
    data: {
      status: 'ACTIVE',
      plan: 'GROWTH',
      billingCycle: 'MONTHLY',
      maxEmployees: 60,
      pricePerEmployee: null,
      trialEndsAt: null,
      subscriptionEndsAt: endOfDayIn(304), // ≈ +10 months
      activatedAt: daysAgo(opts.demoCreatedDaysAgo - 14),
      createdAt: daysAgo(opts.demoCreatedDaysAgo, '09:15'),
      lastActivityAt: new Date(now - 20 * 60000),
    },
  });
  const ev = (companyId: string, companyName: string, e: ExtraCompany['history'][number], i: number): Prisma.CompanyEventCreateManyInput => {
    const [type, ago, fromStatus, toStatus, data] = e;
    const system = type === 'REGISTERED' || type === 'EXPIRED';
    return {
      companyId,
      companyName,
      type,
      fromStatus,
      toStatus,
      data: data && Object.keys(data).length ? (data as Prisma.InputJsonValue) : Prisma.JsonNull,
      ...(system ? {} : by),
      createdAt: new Date(daysAgo(ago, '09:00').getTime() + i * 60000),
    };
  };
  const demoHistory: ExtraCompany['history'] = [
    ['REGISTERED', opts.demoCreatedDaysAgo, null, 'PENDING', { sector: 'RESTAURANTS', employeesCount: 40 }],
    ['ACTIVATED', opts.demoCreatedDaysAgo - 1, 'PENDING', 'TRIAL', { mode: 'TRIAL', plan: 'GROWTH', billingCycle: 'MONTHLY' }],
    ['ACTIVATED', opts.demoCreatedDaysAgo - 14, 'TRIAL', 'ACTIVE', { mode: 'PAID', plan: 'GROWTH', billingCycle: 'MONTHLY', maxEmployees: 50 }],
    ['PLAN_CHANGED', 45, 'ACTIVE', 'ACTIVE', { changes: { maxEmployees: { from: 50, to: 60 } } }],
    ['EXTENDED', 44, 'ACTIVE', 'ACTIVE', { days: 365, field: 'subscriptionEndsAt' }],
  ];
  await prisma.companyEvent.createMany({ data: demoHistory.map((e, i) => ev(demo.id, demo.nameAr, e, i)) });

  // ---------- extra companies ----------
  let seq = 0;
  for (const def of EXTRA_COMPANIES) {
    const created = daysAgo(def.createdDaysAgo, '11:30');
    const company = await prisma.company.create({
      data: {
        nameAr: def.nameAr,
        nameEn: def.nameEn,
        sector: def.sector,
        city: def.city,
        crNumber: def.crNumber,
        employeesCount: def.employees,
        status: def.status,
        plan: def.plan,
        billingCycle: def.billingCycle,
        maxEmployees: def.maxEmployees,
        pricePerEmployee: def.pricePerEmployee,
        trialEndsAt: def.trialEndsInDays !== undefined ? endOfDayIn(def.trialEndsInDays) : null,
        subscriptionEndsAt: def.subscriptionEndsInDays !== undefined ? endOfDayIn(def.subscriptionEndsInDays) : null,
        activatedAt: def.activatedDaysAgo !== undefined ? daysAgo(def.activatedDaysAgo) : null,
        suspendedAt: def.suspended ? daysAgo(def.suspended.daysAgo) : null,
        suspensionReason: def.suspended?.reason ?? null,
        adminNotes: def.adminNotes ?? null,
        lastActivityAt: def.lastActivityHoursAgo !== undefined ? new Date(now - def.lastActivityHoursAgo * 3600000) : null,
        createdAt: created,
      },
    });
    await prisma.leaveType.createMany({
      data: SAUDI_LEAVE_POLICIES.map((p) => ({ companyId: company.id, code: p.code, nameAr: p.nameAr, nameEn: p.nameEn, paid: p.paid, maxDaysPerYear: p.maxDaysPerYear })),
    });
    const branch = await prisma.branch.create({ data: { companyId: company.id, nameAr: def.branch.nameAr, city: def.city, lat: def.branch.lat, lng: def.branch.lng, createdAt: created } });
    const titles = TITLES[def.sector] ?? TITLES.OTHER;
    const employees: Prisma.EmployeeCreateManyInput[] = [];
    for (let i = 0; i < def.employees; i++) {
      seq++;
      const saudi = i % 3 !== 2;
      const female = def.sector === 'OTHER' || (saudi && i % 4 === 1);
      const [first, last, nat] = saudi
        ? [female ? FIRST_F[seq % FIRST_F.length] : FIRST_M[seq % FIRST_M.length], LAST[(seq * 7) % LAST.length], 'SA']
        : EXPATS[seq % EXPATS.length];
      const hire = addDays(today, -Math.min(def.createdDaysAgo + 30 + i * 47, 2400));
      employees.push({
        companyId: company.id,
        employeeNumber: `EMP-${String(i + 1).padStart(4, '0')}`,
        firstNameAr: first,
        lastNameAr: last,
        nationality: nat,
        isSaudi: saudi,
        gender: female ? 'FEMALE' : 'MALE',
        nationalId: `${saudi ? '1' : '2'}${String(100000000 + seq * 7919).slice(0, 9)}`,
        phone: `+9665${String(30000000 + seq * 1543).slice(0, 8)}`,
        branchId: branch.id,
        jobTitle: titles[i % titles.length],
        hireDate: day(hire),
        contractType: saudi ? 'UNLIMITED' : 'FIXED',
        basicSalary: saudi ? 4500 + (i % 5) * 750 : 2200 + (i % 4) * 400,
        housingAllowance: saudi ? 1125 + (i % 5) * 187.5 : 550,
        transportAllowance: 400,
        createdAt: created,
      });
    }
    await prisma.employee.createMany({ data: employees });
    await prisma.user.create({
      data: {
        companyId: company.id,
        email: def.owner.email,
        name: def.owner.name,
        phone: def.owner.phone,
        role: 'OWNER',
        passwordHash: opts.passwordHash,
        createdAt: created,
        lastLoginAt: def.lastActivityHoursAgo !== undefined ? new Date(now - def.lastActivityHoursAgo * 3600000) : null,
      },
    });
    await prisma.companyEvent.createMany({ data: def.history.map((e, i) => ev(company.id, company.nameAr, e, i)) });
  }

  // ---------- leads ----------
  await prisma.lead.createMany({
    data: LEADS.map(({ daysAgo: ago, ...l }) => ({ ...l, createdAt: daysAgo(ago, '13:00'), updatedAt: daysAgo(Math.max(0, ago - 1), '13:00') })),
  });

  const billing = await seedBilling(prisma, { demoCompanyId: demo.id, admin: { id: admin.id, name: admin.name } });

  console.log(`✅ Platform: ${ADMIN_EMAIL} (SUPER_ADMIN) + ${EXTRA_COMPANIES.length} extra companies + ${LEADS.length} leads`);
  console.log(`   Billing: ${billing.invoices} invoices, ${billing.emails} logged emails`);
  for (const c of EXTRA_COMPANIES) console.log(`   ${c.status.padEnd(9)} ${c.nameAr} — owner ${c.owner.email}`);
}

/**
 * Billing demo (docs/ADMIN_PORTAL.md v2): Ward Al-Sham gets 3 PAID past monthly invoices + 1 ISSUED current one,
 * Masar Logistics an overdue ISSUED annual renewal, and a few LOGGED emails (with the dedupe keys the reminder job
 * would have used, so running it today does not resend them).
 */
async function seedBilling(prisma: PrismaClient, opts: { demoCompanyId: string; admin: { id: string; name: string } }) {
  const today = todayStr();
  const at = (d: string, hour = '10:00') => riyadhDateTime(d, hour);
  const settings = await prisma.platformSettings.findUniqueOrThrow({ where: { id: 1 } });
  const vatRate = DEFAULT_BILLING.vatRate;
  const by = { adminId: opts.admin.id, adminName: opts.admin.name };
  let invoices = 0;
  let emails = 0;

  const owner = async (companyId: string) =>
    prisma.user.findFirstOrThrow({ where: { companyId, role: 'OWNER' }, orderBy: { createdAt: 'asc' }, select: { name: true, email: true } });
  const email = async (companyId: string, type: EmailType, content: EmailContent, createdAt: Date, dedupeKey: string | null = null) => {
    const o = await owner(companyId);
    const when = createdAt.getTime() > Date.now() ? new Date() : createdAt; // "today 09:00" may still be ahead
    await prisma.emailLog.create({ data: { companyId, to: o.email, subject: content.subject, body: content.body, type, status: 'LOGGED', dedupeKey, createdAt: when } });
    emails++;
  };

  type InvoiceDef = {
    companyId: string;
    companyName: string;
    plan: Plan;
    cycle: BillingCycle;
    employees: number;
    unitPrice: number;
    periodStart: string;
    issueDate: string;
    paid?: { date: string; method: PaymentMethod; ref: string };
  };
  const issue = async (d: InvoiceDef) => {
    const year = Number(d.issueDate.slice(0, 4));
    const existing = await prisma.invoice.findMany({ where: { number: { startsWith: `SH-${year}-` } }, select: { number: true } });
    const number = nextInvoiceNumber(year, existing.map((e) => e.number));
    const a = computeInvoice({ employees: d.employees, unitPrice: d.unitPrice, billingCycle: d.cycle, annualDiscount: settings.annualDiscount, vatRate });
    const periodEnd = periodEndOf(d.periodStart, a.months);
    const dueDate = addDaysStr(d.issueDate, DEFAULT_BILLING.invoiceDueDays);
    const inv = await prisma.invoice.create({
      data: {
        number,
        companyId: d.companyId,
        companyName: d.companyName,
        status: d.paid ? 'PAID' : 'ISSUED',
        plan: d.plan,
        billingCycle: d.cycle,
        periodStart: day(d.periodStart),
        periodEnd: day(periodEnd),
        months: a.months,
        employees: d.employees,
        unitPrice: d.unitPrice,
        subtotal: a.subtotal,
        discountRate: a.discountRate,
        discount: a.discount,
        taxable: a.taxable,
        vatRate,
        vat: a.vat,
        total: a.total,
        issueDate: day(d.issueDate),
        dueDate: day(dueDate),
        paidAt: d.paid ? at(d.paid.date, '13:20') : null,
        paymentMethod: d.paid?.method ?? null,
        paymentRef: d.paid?.ref ?? null,
        createdById: opts.admin.id,
        createdByName: opts.admin.name,
        createdAt: at(d.issueDate, '09:30'),
      },
    });
    invoices++;
    const status = (await prisma.company.findUniqueOrThrow({ where: { id: d.companyId }, select: { status: true } })).status;
    await prisma.companyEvent.create({
      data: { companyId: d.companyId, companyName: d.companyName, type: 'INVOICE_ISSUED', fromStatus: status, toStatus: status, data: { invoiceId: inv.id, number, total: a.total }, ...by, createdAt: at(d.issueDate, '09:30') },
    });
    if (d.paid) {
      await prisma.companyEvent.create({
        data: { companyId: d.companyId, companyName: d.companyName, type: 'INVOICE_PAID', fromStatus: status, toStatus: status, data: { invoiceId: inv.id, number, total: a.total, paymentMethod: d.paid.method }, ...by, createdAt: at(d.paid.date, '13:20') },
      });
    }
    const ctx = { number, periodStart: d.periodStart, periodEnd, total: a.total, dueDate, employees: d.employees, plan: d.plan };
    return { inv, ctx };
  };

  // ---- Ward Al-Sham: monthly GROWTH, 40 staff × 29 SAR; 3 paid months + the current month issued ----
  const demo = await prisma.company.findUniqueOrThrow({ where: { id: opts.demoCompanyId } });
  const demoOwner = await owner(demo.id);
  const monthStart = `${today.slice(0, 7)}-01`;
  const base = { companyId: demo.id, companyName: demo.nameAr, plan: demo.plan, cycle: 'MONTHLY' as BillingCycle, employees: 40, unitPrice: 29 };
  let lastPaid: Awaited<ReturnType<typeof issue>> | null = null;
  for (let m = 3; m >= 1; m--) {
    const periodStart = addMonthsClamped(monthStart, -m);
    const issueDate = addDaysStr(periodStart, -3);
    lastPaid = await issue({ ...base, periodStart, issueDate, paid: { date: addDaysStr(issueDate, 2), method: 'BANK_TRANSFER', ref: `TRX-${periodStart.replace(/-/g, '').slice(0, 6)}-0${m}` } });
  }
  const current = await issue({ ...base, periodStart: monthStart, issueDate: addDaysStr(today, -2) });
  await email(demo.id, 'PAYMENT_RECEIVED', paymentReceivedEmail({ companyName: demo.nameAr, ownerName: demoOwner.name, invoice: lastPaid!.ctx, paymentMethod: 'BANK_TRANSFER', subscriptionEndsAt: demo.subscriptionEndsAt ? todayStr(demo.subscriptionEndsAt) : null }), at(lastPaid!.inv.paidAt ? todayStr(lastPaid!.inv.paidAt) : today, '13:25'));
  await email(demo.id, 'INVOICE_ISSUED', invoiceIssuedEmail({ companyName: demo.nameAr, ownerName: demoOwner.name, invoice: current.ctx, billing: DEFAULT_BILLING }), at(addDaysStr(today, -2), '09:31'));

  // ---- Masar Logistics (ACTIVE, ENTERPRISE annual @ 22): renewal invoice issued 20 days ago, now overdue ----
  const masar = await prisma.company.findFirstOrThrow({ where: { nameEn: 'Masar Logistics' } });
  const masarOwner = await owner(masar.id);
  const renewalStart = addDaysStr(todayStr(masar.subscriptionEndsAt!), 1);
  const overdue = await issue({ companyId: masar.id, companyName: masar.nameAr, plan: masar.plan, cycle: 'ANNUAL', employees: 15, unitPrice: 22, periodStart: renewalStart, issueDate: addDaysStr(today, -20) });
  await email(masar.id, 'INVOICE_ISSUED', invoiceIssuedEmail({ companyName: masar.nameAr, ownerName: masarOwner.name, invoice: overdue.ctx, billing: DEFAULT_BILLING }), at(addDaysStr(today, -20), '09:31'));
  for (const days of [1, 7]) {
    const sentDay = addDaysStr(overdue.ctx.dueDate, days);
    await email(masar.id, 'INVOICE_OVERDUE', invoiceOverdueEmail({ companyName: masar.nameAr, ownerName: masarOwner.name, invoice: overdue.ctx, daysOverdue: days, billing: DEFAULT_BILLING }), at(sentDay, '09:00'), `INVOICE_OVERDUE:${overdue.inv.id}:${days}`);
    await prisma.companyEvent.create({ data: { companyId: masar.id, companyName: masar.nameAr, type: 'REMINDER_SENT', fromStatus: 'ACTIVE', toStatus: 'ACTIVE', data: { type: 'INVOICE_OVERDUE', daysOverdue: days, invoiceId: overdue.inv.id, number: overdue.inv.number }, createdAt: at(sentDay, '09:00') } });
  }

  // ---- trial ending soon (Bin Al-Deera, 3 days left): the 7-day reminder went out 4 days ago, the 3-day one today ----
  const deera = await prisma.company.findFirstOrThrow({ where: { nameEn: 'Bin Al-Deera Coffee' } });
  const deeraOwner = await owner(deera.id);
  const trialEnd = todayStr(deera.trialEndsAt!);
  for (const daysLeft of [7, 3]) {
    const sentDay = addDaysStr(trialEnd, -daysLeft);
    if (sentDay > today) continue;
    await email(deera.id, 'TRIAL_ENDING', trialEndingEmail({ companyName: deera.nameAr, ownerName: deeraOwner.name, daysLeft, endDay: trialEnd }), at(sentDay, '09:00'), `TRIAL_ENDING:${deera.id}:${trialEnd}:${daysLeft}`);
  }

  // ---- expired trial (Lamsat Jamal) ----
  const lamsa = await prisma.company.findFirstOrThrow({ where: { nameEn: 'Lamsat Jamal Salon' } });
  const lamsaOwner = await owner(lamsa.id);
  const lamsaEnd = todayStr(lamsa.trialEndsAt!);
  await email(lamsa.id, 'EXPIRED', expiredEmail({ companyName: lamsa.nameAr, ownerName: lamsaOwner.name, endDay: lamsaEnd, wasTrial: true }), at(addDaysStr(lamsaEnd, 1), '00:06'), `EXPIRED:${lamsa.id}:${lamsaEnd}`);

  return { invoices, emails };
}
