import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { endOfDay } from '../src/platform/platform.service';
import { BillingService } from '../src/billing/billing.service';
import { MailService } from '../src/mail/mail.service';
import { addDaysStr, periodEndOf } from '../src/billing/billing.math';
import { day, todayStr } from '../src/common/dates';

/** docs/ADMIN_PORTAL.md "v2.1 — Review fixes": tax-invoice compliance, integrity, concurrency, security. */
describe('Billing v2.1 review fixes (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  const stamp = Date.now();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const PASSWORD = 'Passw0rd!';
  const today = todayStr();
  const TRN = '300000000000003';
  let adminToken = '';
  let seq = 0;

  const login = (email: string, password = PASSWORD) => http.post('/api/auth/login').send({ email, password });
  const admin = () => auth(adminToken);
  /** Registers + activates a company; returns its id and owner token. */
  const company = async (opts: { plan?: string; mode?: 'TRIAL' | 'PAID'; name?: string } = {}) => {
    const n = ++seq;
    const email = `v21-${stamp}-${n}@co.sa`;
    const name = opts.name ?? `منشأة اختبار ${n}`;
    const id = (await http.post('/api/auth/register').send({ companyNameAr: name, sector: 'RETAIL', ownerName: 'مالك', email, phone: '+966500000088', password: PASSWORD }).expect(201)).body.company.id as string;
    await http.post(`/api/admin/companies/${id}/activate`).set(admin()).send({ plan: opts.plan ?? 'GROWTH', billingCycle: 'MONTHLY', mode: opts.mode ?? 'PAID' }).expect(200);
    const token = (await login(email).expect(200)).body.accessToken as string;
    return { id, email, name, token };
  };
  const issue = (companyId: string, body: Record<string, unknown> = {}) => http.post(`/api/admin/companies/${companyId}/invoices`).set(admin()).send({ sendEmail: false, ...body });
  const decodeQr = (qr: string) => {
    const buf = Buffer.from(qr, 'base64');
    const tags: Record<number, string> = {};
    for (let i = 0; i < buf.length; ) {
      tags[buf[i]] = buf.subarray(i + 2, i + 2 + buf[i + 1]).toString('utf8');
      i += 2 + buf[i + 1];
    }
    return tags;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication(), { swagger: false });
    await app.init();
    http = request(app.getHttpServer());
    prisma = app.get(PrismaService);
    await prisma.platformSettings.deleteMany({});
    adminToken = (await login('platform@test.sa', 'Admin@2026!').expect(200)).body.accessToken;
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await prisma.$disconnect();
    await app.close();
  });

  it('health checks the database', async () => {
    expect((await http.get('/api/health').expect(200)).body).toEqual({ status: 'ok', db: 'up' });
  });

  it('settings: TRN must be empty or 15 digits starting/ending with 3; minBilledEmployees defaults to 10', async () => {
    const s = await http.get('/api/admin/settings').set(admin()).expect(200);
    expect(s.body.billing.minBilledEmployees).toBe(10);
    for (const bad of ['123', '200000000000003', '300000000000002', '30000000000000a3', ' 300000000000003']) {
      const r = await http.patch('/api/admin/settings').set(admin()).send({ billing: { sellerVatNumber: bad } }).expect(400);
      expect(r.body.messageAr).toBe('الرقم الضريبي يجب أن يكون 15 رقماً يبدأ وينتهي بالرقم 3');
    }
    await http.patch('/api/admin/settings').set(admin()).send({ billing: { minBilledEmployees: 0 } }).expect(400);
    await http.patch('/api/admin/settings').set(admin()).send({ billing: { sellerVatNumber: '' } }).expect(200);
    await http.patch('/api/admin/settings').set(admin()).send({ prices: { GROWTH: 29.999 } }).expect(400);
  });

  it('unregistered seller → INVOICE with 0% VAT and no QR; registered → TAX_INVOICE with ZATCA QR; snapshots never change', async () => {
    const c = await company();
    const plain = (await issue(c.id).expect(201)).body;
    expect(plain).toMatchObject({ documentType: 'INVOICE', vatRate: 0, vat: 0, qr: null, employees: 10, total: 290 });

    await http.patch('/api/admin/settings').set(admin()).send({ billing: { sellerVatNumber: TRN, sellerCrNumber: '1010101010', iban: 'SA4420000001234567891234' } }).expect(200);
    const tax = (await issue(c.id).expect(201)).body;
    expect(tax).toMatchObject({ documentType: 'TAX_INVOICE', vatRate: 0.15, vat: 43.5, total: 333.5 });
    expect(tax.seller).toMatchObject({ name: 'شؤون لتقنية المعلومات', vatNumber: TRN, crNumber: '1010101010', iban: 'SA4420000001234567891234' });
    expect(tax.buyer).toMatchObject({ nameAr: c.name, vatNumber: null });
    expect(decodeQr(tax.qr)).toEqual({ 1: 'شؤون لتقنية المعلومات', 2: TRN, 3: tax.issuedAt.replace(/\.\d{3}Z$/, 'Z'), 4: '333.50', 5: '43.50' });

    // later edits of settings / the company never change an issued document
    await http.patch('/api/admin/settings').set(admin()).send({ billing: { sellerName: 'اسم جديد', iban: 'SA0000' } }).expect(200);
    await http.patch(`/api/admin/companies/${c.id}`).set(admin()).send({ nameAr: 'اسم المنشأة الجديد' }).expect(200);
    const d = (await http.get(`/api/admin/invoices/${tax.id}`).set(admin()).expect(200)).body;
    expect(d.seller).toMatchObject({ name: 'شؤون لتقنية المعلومات', iban: 'SA4420000001234567891234' });
    expect(d.buyer.nameAr).toBe(c.name);
    expect(d.company.nameAr).toBe('اسم المنشأة الجديد'); // live block (links)
    expect(d.qr).toBe(tax.qr);
    const owner = (await http.get(`/api/billing/invoices/${tax.id}`).set(auth((await login(c.email).expect(200)).body.accessToken)).expect(200)).body;
    expect(owner).toMatchObject({ seller: d.seller, buyer: d.buyer, qr: tax.qr, documentType: 'TAX_INVOICE' });
    await http.patch('/api/admin/settings').set(admin()).send({ billing: { sellerName: 'شؤون لتقنية المعلومات' } }).expect(200);
  });

  it('ENTERPRISE bills max(1, active); explicit employees allowed', async () => {
    const c = await company({ plan: 'ENTERPRISE' });
    await http.patch(`/api/admin/companies/${c.id}`).set(admin()).send({ pricePerEmployee: 50 }).expect(200);
    expect((await issue(c.id).expect(201)).body.employees).toBe(1);
    const g = await company({ plan: 'ESSENTIALS' });
    expect((await issue(g.id, { employees: 3 }).expect(201)).body.employees).toBe(3);
  });

  it('validation: 2-decimal unit price, caps, periodStart window → 400 (never 500)', async () => {
    const c = await company();
    const bad = async (body: Record<string, unknown>) => (await issue(c.id, body).expect(400)).body;
    await bad({ unitPrice: 10.005 });
    await bad({ unitPrice: 100000000 });
    await bad({ employees: 100001 });
    expect((await bad({ employees: 100000, unitPrice: 99999999, billingCycle: 'ANNUAL' })).messageAr).toBe('إجمالي الفاتورة يتجاوز الحد المسموح');
    expect((await bad({ periodStart: addDaysStr(today, -61) })).messageAr).toBe('بداية الفترة يجب أن تكون بين 60 يوماً مضت و90 يوماً قادمة');
    await bad({ periodStart: addDaysStr(today, 91) });
    await http.patch(`/api/admin/companies/${c.id}`).set(admin()).send({ pricePerEmployee: 12.345 }).expect(400);
    const ok = (await issue(c.id, { employees: 3, unitPrice: 10 }).expect(201)).body;
    expect(ok).toMatchObject({ unitPrice: 10, subtotal: 30 });
    expect(await prisma.invoice.count({ where: { companyId: c.id } })).toBe(1);
  });

  it('numbering is race-free: 10 parallel issues → 10 distinct consecutive numbers', async () => {
    const cos: Awaited<ReturnType<typeof company>>[] = [];
    for (let i = 0; i < 5; i++) cos.push(await company());
    const res = await Promise.all(cos.flatMap((c) => [issue(c.id, { periodStart: today }), issue(c.id, { periodStart: addDaysStr(today, 40) })]));
    expect(res.map((r) => r.status)).toEqual(Array(10).fill(201));
    const seqs = res.map((r) => Number(r.body.number.slice(-4))).sort((a, b) => a - b);
    expect(new Set(seqs).size).toBe(10);
    expect(seqs[9] - seqs[0]).toBe(9);
  });

  it('double submit of the same period → one 201, one 409; numbers are never reused', async () => {
    const c = await company();
    const [a, b] = await Promise.all([issue(c.id, { periodStart: today }), issue(c.id, { periodStart: today })]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect([a, b].find((r) => r.status === 409)!.body.messageAr).toBe('توجد فاتورة تغطي هذه الفترة');
    // overlapping (not identical) period also rejected
    await issue(c.id, { periodStart: addDaysStr(today, 10) }).expect(409);
    const first = [a, b].find((r) => r.status === 201)!.body;
    // even if a row disappears (e.g. manual DB surgery), its number is not handed out again
    await prisma.invoice.delete({ where: { id: first.id } });
    const next = (await issue(c.id, { periodStart: today }).expect(201)).body;
    expect(next.number).not.toBe(first.number);
    expect(Number(next.number.slice(-4))).toBeGreaterThan(Number(first.number.slice(-4)));
  });

  it('credit notes: ISSUED or PAID → CREDITED once; the period can be re-invoiced; credit notes are not payable', async () => {
    const c = await company();
    const inv = (await issue(c.id, { periodStart: today }).expect(201)).body;
    await http.post(`/api/admin/invoices/${inv.id}/pay`).set(admin()).send({ paymentMethod: 'CASH' }).expect(200);
    await http.post(`/api/admin/invoices/${inv.id}/credit`).set(admin()).send({ reason: 'x'.repeat(1001) }).expect(400);
    await http.post(`/api/admin/invoices/${inv.id}/credit`).set(admin()).send({ reason: '   ' }).expect(400);
    const [r1, r2] = await Promise.all([
      http.post(`/api/admin/invoices/${inv.id}/credit`).set(admin()).send({ reason: 'تكرار' }),
      http.post(`/api/admin/invoices/${inv.id}/credit`).set(admin()).send({ reason: 'تكرار' }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    const cn = [r1, r2].find((r) => r.status === 201)!.body;
    expect(cn).toMatchObject({
      documentType: 'CREDIT_NOTE', status: 'ISSUED', overdue: false, creditsInvoiceId: inv.id, creditsNumber: inv.number, reason: 'تكرار',
      periodStart: inv.periodStart, periodEnd: inv.periodEnd, employees: inv.employees, total: inv.total, vat: inv.vat, vatRate: inv.vatRate,
      seller: inv.seller, buyer: inv.buyer, paidAt: null, paymentMethod: null,
    });
    expect(cn.qr).toBeTruthy(); // credit note of a tax invoice (TRN set above)
    expect(decodeQr(cn.qr)[4]).toBe(inv.total.toFixed(2));
    const orig = (await http.get(`/api/admin/invoices/${inv.id}`).set(admin()).expect(200)).body;
    expect(orig).toMatchObject({ status: 'CREDITED', creditedByNumber: cn.number, paidAt: inv.paidAt ?? expect.any(String) });
    // subscription unchanged
    const company1 = await prisma.company.findUniqueOrThrow({ where: { id: c.id } });
    expect(company1.subscriptionEndsAt!.toISOString()).toBe(endOfDay(inv.periodEnd).toISOString());

    await http.post(`/api/admin/invoices/${cn.id}/credit`).set(admin()).send({ reason: 'x' }).expect(409);
    expect((await http.post(`/api/admin/invoices/${cn.id}/pay`).set(admin()).send({ paymentMethod: 'CASH' }).expect(400)).body.messageAr).toBe('لا يمكن تسجيل دفعة على إشعار دائن');
    // CREDITED invoices are ignored by the overlap check
    const again = (await issue(c.id, { periodStart: today }).expect(201)).body;
    expect(again.periodStart).toBe(today);
    // no email to the customer by default
    expect(await prisma.emailLog.count({ where: { companyId: c.id, body: { contains: cn.number } } })).toBe(0);
    // summary excludes credit notes
    await prisma.invoice.update({ where: { id: cn.id }, data: { dueDate: day(addDaysStr(today, -3)) } });
    const list = (await http.get(`/api/admin/invoices?companyId=${c.id}`).set(admin()).expect(200)).body;
    expect(list.data.find((i: { id: string }) => i.id === cn.id).overdue).toBe(false);
    expect((await http.get(`/api/admin/invoices?overdue=true&companyId=${c.id}`).set(admin()).expect(200)).body.total).toBe(0);
  });

  it('pay: no revival into an already-ended period (400) unless extendSubscription=false; paidAt bounds; concurrent pays keep the longest extension', async () => {
    const c = await company({ mode: 'TRIAL' });
    const past = (await issue(c.id, { periodStart: addDaysStr(today, -50) }).expect(201)).body;
    await prisma.company.update({ where: { id: c.id }, data: { status: 'EXPIRED', trialEndsAt: new Date(Date.now() - 86400000) } });
    const r = await http.post(`/api/admin/invoices/${past.id}/pay`).set(admin()).send({ paymentMethod: 'CASH' }).expect(400);
    expect(r.body.messageAr).toBe('فترة هذه الفاتورة انتهت؛ أصدر فاتورة لفترة حالية');
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: past.id } })).status).toBe('ISSUED');
    await http.post(`/api/admin/invoices/${past.id}/pay`).set(admin()).send({ paymentMethod: 'CASH', paidAt: addDaysStr(today, 1) }).expect(400);
    await http.post(`/api/admin/invoices/${past.id}/pay`).set(admin()).send({ paymentMethod: 'CASH', paidAt: addDaysStr(today, -1) }).expect(400); // before issueDate
    await http.post(`/api/admin/invoices/${past.id}/pay`).set(admin()).send({ paymentMethod: 'CASH', extendSubscription: false }).expect(200);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('EXPIRED');

    // EXPIRED company: default periodStart = max(day after last periodEnd, today)
    const cur = (await issue(c.id).expect(201)).body;
    expect(cur.periodStart).toBe(today);

    // two invoices paid concurrently: the longer extension wins
    const next = (await issue(c.id).expect(201)).body;
    expect(next.periodStart).toBe(addDaysStr(cur.periodEnd, 1));
    const res = await Promise.all([
      http.post(`/api/admin/invoices/${next.id}/pay`).set(admin()).send({ paymentMethod: 'CASH' }),
      http.post(`/api/admin/invoices/${cur.id}/pay`).set(admin()).send({ paymentMethod: 'CASH' }),
    ]);
    expect(res.map((x) => x.status)).toEqual([200, 200]);
    const after = await prisma.company.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.status).toBe('ACTIVE');
    expect(after.subscriptionEndsAt!.toISOString()).toBe(endOfDay(next.periodEnd).toISOString());
  });

  it('paidThisMonth only counts payments inside the current Riyadh month', async () => {
    const before = (await http.get('/api/admin/invoices').set(admin()).expect(200)).body.summary.paidThisMonth;
    const c = await company();
    const inv = (await issue(c.id, { periodStart: today }).expect(201)).body;
    await prisma.invoice.update({ where: { id: inv.id }, data: { status: 'PAID', paidAt: new Date(Date.now() + 40 * 86400000) } });
    expect((await http.get('/api/admin/invoices').set(admin()).expect(200)).body.summary.paidThisMonth).toEqual(before);
  });

  it('monthly periods continue on the original anchor day', async () => {
    const c = await company();
    // simulate a contract that started on the 31st: last period ended on a clamped month end, anchor 31
    const start = addDaysStr(today, -20);
    const last = (await issue(c.id, { periodStart: start }).expect(201)).body;
    await prisma.invoice.update({ where: { id: last.id }, data: { anchorDay: 31 } });
    const next = (await issue(c.id).expect(201)).body;
    expect(next.periodStart).toBe(addDaysStr(last.periodEnd, 1));
    expect(next.periodEnd).toBe(periodEndOf(next.periodStart, 1, 31));
  });

  it('reminders catch up a missed threshold once; stale "sending…" claims are released by the job', async () => {
    const c = await company();
    await prisma.company.update({ where: { id: c.id }, data: { subscriptionEndsAt: endOfDay(addDaysStr(today, 5)) } });
    await prisma.emailLog.create({
      data: { companyId: c.id, to: c.email, subject: 's', body: 'b', type: 'TRIAL_ENDING', status: 'FAILED', error: 'sending…', dedupeKey: `STALE:${c.id}`, createdAt: new Date(Date.now() - 20 * 60000) },
    });
    await http.post('/api/admin/reminders/run').set(admin()).expect(200);
    const keys = (await prisma.emailLog.findMany({ where: { companyId: c.id, type: 'SUBSCRIPTION_ENDING' }, select: { dedupeKey: true } })).map((e) => e.dedupeKey);
    expect(keys).toEqual([`SUBSCRIPTION_ENDING:${c.id}:${addDaysStr(today, 5)}:7`]);
    await http.post('/api/admin/reminders/run').set(admin()).expect(200);
    expect(await prisma.emailLog.count({ where: { companyId: c.id, type: 'SUBSCRIPTION_ENDING' } })).toBe(1);
    const stale = await prisma.emailLog.findFirstOrThrow({ where: { companyId: c.id, type: 'TRIAL_ENDING' } });
    expect(stale.dedupeKey).toBeNull();
    expect(stale.error).not.toBe('sending…');
  });

  it('FAILED emails never create in-app notifications', async () => {
    const c = await company();
    const mail = app.get(MailService);
    const saved = process.env.SMTP_HOST;
    process.env.SMTP_HOST = 'smtp.invalid';
    const spy = jest.spyOn(mail as unknown as { transport: () => unknown }, 'transport').mockReturnValue({ sendMail: async () => Promise.reject(new Error('connection refused')) });
    try {
      const before = await prisma.notification.count({ where: { companyId: c.id } });
      const r = await http.post(`/api/admin/companies/${c.id}/remind`).set(admin()).send({}).expect(201);
      expect(r.body.status).toBe('FAILED');
      expect(await prisma.notification.count({ where: { companyId: c.id } })).toBe(before);
    } finally {
      spy.mockRestore();
      if (saved === undefined) delete process.env.SMTP_HOST;
      else process.env.SMTP_HOST = saved;
    }
  });

  it('a slow EXPIRED email never blocks login (expiry listener is fire-and-forget)', async () => {
    const c = await company({ mode: 'TRIAL' });
    await prisma.company.update({ where: { id: c.id }, data: { trialEndsAt: new Date(Date.now() - 60000) } });
    const billing = app.get(BillingService);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const spy = jest.spyOn(billing, 'sendExpired').mockImplementation(async () => {
      await gate;
    });
    try {
      const t0 = Date.now();
      const r = await login(c.email).expect(403);
      expect(r.body.code).toBe('COMPANY_EXPIRED');
      expect(Date.now() - t0).toBeLessThan(3000);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      release();
      spy.mockRestore();
    }
  });

  it('only the OWNER can use /billing/* (HR_ADMIN, PAYROLL, EMPLOYEE → 403)', async () => {
    const c = await company();
    const inv = (await issue(c.id, { periodStart: today }).expect(201)).body;
    for (const role of ['HR_ADMIN', 'PAYROLL', 'EMPLOYEE']) {
      const email = `${role.toLowerCase()}-${stamp}@co.sa`;
      await http.post('/api/users').set(auth(c.token)).send({ email, name: `مستخدم ${role}`, role, password: PASSWORD }).expect(201);
      const t = (await login(email).expect(200)).body.accessToken;
      await http.get('/api/billing/subscription').set(auth(t)).expect(403);
      await http.get('/api/billing/invoices').set(auth(t)).expect(403);
      await http.get(`/api/billing/invoices/${inv.id}`).set(auth(t)).expect(403);
    }
    await http.get('/api/billing/subscription').set(auth(c.token)).expect(200);
  });

  it('company names: control characters / newlines stripped, max 200 characters', async () => {
    const email = `names-${stamp}@co.sa`;
    const reg = await http
      .post('/api/auth/register')
      .send({ companyNameAr: 'منشأة\nحوّلوا المبلغ إلى SA00 فوراً', companyNameEn: 'Acme\r\nLtd', sector: 'RETAIL', ownerName: 'مالك', email, phone: '+966500000089', password: PASSWORD })
      .expect(201);
    const row = await prisma.company.findUniqueOrThrow({ where: { id: reg.body.company.id } });
    expect(row.nameAr).toBe('منشأة حوّلوا المبلغ إلى SA00 فوراً');
    expect(row.nameEn).toBe('Acme Ltd');
    await http.post('/api/auth/register').send({ companyNameAr: 'م'.repeat(201), sector: 'RETAIL', ownerName: 'مالك', email: `long-${stamp}@co.sa`, phone: '+966500000090', password: PASSWORD }).expect(400);
    await http.patch(`/api/admin/companies/${row.id}`).set(admin()).send({ nameAr: 'اسم\n\nجديد' }).expect(200);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: row.id } })).nameAr).toBe('اسم جديد');
  });
});
