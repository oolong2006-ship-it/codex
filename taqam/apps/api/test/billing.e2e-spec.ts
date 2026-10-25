import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { PlatformService, endOfDay } from '../src/platform/platform.service';
import { addDaysStr, periodEndOf } from '../src/billing/billing.math';
import { day, todayStr } from '../src/common/dates';

/** Billing (invoices) & subscription reminders — docs/ADMIN_PORTAL.md v2. */
describe('Billing & reminders (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  const stamp = Date.now();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const PASSWORD = 'Passw0rd!';
  const today = todayStr();

  let adminToken = '';
  const A = { id: '', name: 'منشأة الفواتير', email: `billing${stamp}@a.sa`, token: '' };
  const B = { id: '', name: 'منشأة أخرى', email: `other${stamp}@b.sa`, token: '' };
  const C = { id: '', name: 'منشأة تجريبية', email: `trial${stamp}@c.sa` };
  let inv1 = { id: '', number: '' };
  let inv2 = { id: '', number: '' };
  let invB = { id: '', number: '' };

  const login = (email: string, password = PASSWORD) => http.post('/api/auth/login').send({ email, password });
  const employee = (n: number) => ({
    firstNameAr: `موظف${n}`,
    lastNameAr: 'الفوترة',
    nationality: 'SA',
    gender: 'MALE',
    nationalId: `11${String(stamp).slice(-6)}${n}${n}`.slice(0, 10),
    hireDate: '2024-01-01',
    basicSalary: 5000,
  });
  const register = async (c: { name: string; email: string }) =>
    (await http.post('/api/auth/register').send({ companyNameAr: c.name, sector: 'RETAIL', ownerName: 'مالك', email: c.email, phone: '+966500000077', password: PASSWORD }).expect(201)).body.company.id as string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication(), { swagger: false });
    await app.init();
    http = request(app.getHttpServer());
    prisma = app.get(PrismaService);
    await prisma.company.deleteMany({});
    await prisma.companyEvent.deleteMany({});
    await prisma.emailLog.deleteMany({});
    await prisma.platformSettings.deleteMany({});
    adminToken = (await login('platform@test.sa', 'Admin@2026!').expect(200)).body.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('settings: billing / reminders defaults, partial PATCH merges, validation', async () => {
    const s = await http.get('/api/admin/settings').set(auth(adminToken)).expect(200);
    expect(s.body.billing).toEqual({
      sellerName: 'شؤون لتقنية المعلومات', sellerNameEn: 'Shuoon IT', sellerVatNumber: '', sellerCrNumber: '',
      sellerAddress: 'الرياض، المملكة العربية السعودية', sellerEmail: 'hello@shuoon.net', sellerPhone: '+966 55 042 1235',
      vatRate: 0.15, invoiceDueDays: 7, bankName: '', iban: '',
    });
    expect(s.body.reminders).toEqual({ enabled: true, trialDays: [7, 3, 1], subscriptionDays: [14, 7, 1], notifyOnExpiry: true, overdueInvoiceDays: [1, 7] });

    const p = await http.patch('/api/admin/settings').set(auth(adminToken)).send({ billing: { iban: 'SA0380000000608010167519', bankName: 'مصرف الراجحي' }, reminders: { trialDays: [3] } }).expect(200);
    expect(p.body.billing).toMatchObject({ iban: 'SA0380000000608010167519', bankName: 'مصرف الراجحي', vatRate: 0.15, sellerName: 'شؤون لتقنية المعلومات' });
    expect(p.body.reminders).toMatchObject({ trialDays: [3], subscriptionDays: [14, 7, 1], enabled: true });
    expect(p.body.trialDays).toBe(14);

    await http.patch('/api/admin/settings').set(auth(adminToken)).send({ billing: { vatRate: 2 } }).expect(400);
    await http.patch('/api/admin/settings').set(auth(adminToken)).send({ billing: { invoiceDueDays: 91 } }).expect(400);
    await http.patch('/api/admin/settings').set(auth(adminToken)).send({ reminders: { trialDays: [61] } }).expect(400);
    await http.patch('/api/admin/settings').set(auth(adminToken)).send({ reminders: { trialDays: [1, 2, 3, 4, 5, 6, 7] } }).expect(400);
    await http.patch('/api/admin/settings').set(auth(adminToken)).send({ reminders: { trialDays: [1.5] } }).expect(400);
    await http.patch('/api/admin/settings').set(auth(adminToken)).send({ reminders: { trialDays: [7, 3, 1] } }).expect(200);
  });

  it('create invoice: 400 for PENDING, 400 without a price, then defaults are correct', async () => {
    A.id = await register(A);
    const pending = await http.post(`/api/admin/companies/${A.id}/invoices`).set(auth(adminToken)).send({}).expect(400);
    expect(pending.body.messageAr).toBe('لا يمكن إصدار فاتورة لمنشأة بانتظار الموافقة');

    await http.post(`/api/admin/companies/${A.id}/activate`).set(auth(adminToken)).send({ plan: 'ENTERPRISE', billingCycle: 'MONTHLY', mode: 'TRIAL' }).expect(200);
    const noPrice = await http.post(`/api/admin/companies/${A.id}/invoices`).set(auth(adminToken)).send({}).expect(400);
    expect(noPrice.body.messageAr).toBe('حدد سعر الموظف لهذه المنشأة أولاً');

    await http.patch(`/api/admin/companies/${A.id}`).set(auth(adminToken)).send({ plan: 'GROWTH' }).expect(200);
    A.token = (await login(A.email).expect(200)).body.accessToken;
    await http.post('/api/employees').set(auth(A.token)).send(employee(1)).expect(201);
    await http.post('/api/employees').set(auth(A.token)).send(employee(2)).expect(201);

    await http.post(`/api/admin/companies/${A.id}/invoices`).set(auth(adminToken)).send({ periodStart: '2026-13-01' }).expect(400);
    const res = await http.post(`/api/admin/companies/${A.id}/invoices`).set(auth(adminToken)).send({}).expect(201);
    expect(res.body).toMatchObject({
      companyId: A.id,
      companyName: A.name,
      status: 'ISSUED',
      overdue: false,
      plan: 'GROWTH',
      billingCycle: 'MONTHLY',
      periodStart: today,
      periodEnd: periodEndOf(today, 1),
      months: 1,
      employees: 2,
      unitPrice: 29,
      subtotal: 58,
      discountRate: 0,
      discount: 0,
      taxable: 58,
      vatRate: 0.15,
      vat: 8.7,
      total: 66.7,
      issueDate: today,
      dueDate: addDaysStr(today, 7),
      paidAt: null,
      paymentMethod: null,
      paymentRef: null,
      voidReason: null,
    });
    expect(res.body.number).toMatch(new RegExp(`^SH-${today.slice(0, 4)}-\\d{4}$`));
    expect(typeof res.body.createdByName).toBe('string');
    inv1 = res.body;

    // next invoice continues the period, explicit values, annual discount, no email
    const r2 = await http
      .post(`/api/admin/companies/${A.id}/invoices`)
      .set(auth(adminToken))
      .send({ employees: 10, unitPrice: 20, billingCycle: 'ANNUAL', notes: 'عقد سنوي', sendEmail: false })
      .expect(201);
    const start2 = addDaysStr(periodEndOf(today, 1), 1);
    expect(r2.body).toMatchObject({ periodStart: start2, periodEnd: periodEndOf(start2, 12), months: 12, subtotal: 2400, discountRate: 0.15, discount: 360, taxable: 2040, vat: 306, total: 2346, notes: 'عقد سنوي' });
    expect(Number(r2.body.number.slice(-4))).toBe(Number(inv1.number.slice(-4)) + 1);
    inv2 = r2.body;

    const emails = await http.get(`/api/admin/emails?companyId=${A.id}`).set(auth(adminToken)).expect(200);
    expect(emails.body.total).toBe(1);
    expect(emails.body.data[0]).toMatchObject({ type: 'INVOICE_ISSUED', status: 'LOGGED', to: A.email, companyId: A.id, companyName: A.name, error: null });
    expect(emails.body.data[0].body).toContain(inv1.number);
    expect(emails.body.data[0].body).toContain('+966 55 042 1235');
    expect(emails.body.data[0].body).toContain('SA0380000000608010167519');

    const events = await http.get(`/api/admin/events?companyId=${A.id}&type=INVOICE_ISSUED`).set(auth(adminToken)).expect(200);
    expect(events.body.total).toBe(2);
  });

  it('pay: concurrent double pay → one 200, one 409; TRIAL → ACTIVE with subscription through periodEnd', async () => {
    const pay = () => http.post(`/api/admin/invoices/${inv1.id}/pay`).set(auth(adminToken)).send({ paymentMethod: 'BANK_TRANSFER', paymentRef: 'TRX-1' });
    const results = await Promise.all([pay(), pay()]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const conflict = results.find((r) => r.status === 409)!;
    expect(conflict.body.messageAr).toBe('تمت معالجة هذه الفاتورة مسبقاً');
    const ok = results.find((r) => r.status === 200)!;
    expect(ok.body).toMatchObject({ status: 'PAID', paymentMethod: 'BANK_TRANSFER', paymentRef: 'TRX-1', overdue: false });
    expect(ok.body.paidAt).toBeTruthy();

    const c = await prisma.company.findUniqueOrThrow({ where: { id: A.id } });
    expect(c.status).toBe('ACTIVE');
    expect(c.activatedAt).toBeTruthy();
    expect(c.subscriptionEndsAt!.toISOString()).toBe(endOfDay(periodEndOf(today, 1)).toISOString());
    const events = await http.get(`/api/admin/events?companyId=${A.id}&type=INVOICE_PAID`).set(auth(adminToken)).expect(200);
    expect(events.body.data[0]).toMatchObject({ fromStatus: 'TRIAL', toStatus: 'ACTIVE' });
    const emails = await http.get(`/api/admin/emails?companyId=${A.id}&type=PAYMENT_RECEIVED`).set(auth(adminToken)).expect(200);
    expect(emails.body.total).toBe(1);

    await http.post(`/api/admin/invoices/${inv2.id}/pay`).set(auth(adminToken)).send({ paymentMethod: 'NOPE' }).expect(400);
  });

  it('void: reason required, ISSUED → VOID once; a void invoice cannot be paid', async () => {
    await http.post(`/api/admin/invoices/${inv2.id}/void`).set(auth(adminToken)).send({}).expect(400);
    const v = await http.post(`/api/admin/invoices/${inv2.id}/void`).set(auth(adminToken)).send({ reason: 'أصدرت بالخطأ' }).expect(200);
    expect(v.body).toMatchObject({ status: 'VOID', voidReason: 'أصدرت بالخطأ' });
    expect((await http.post(`/api/admin/invoices/${inv2.id}/void`).set(auth(adminToken)).send({ reason: 'x' }).expect(409)).body.messageAr).toBe('تمت معالجة هذه الفاتورة مسبقاً');
    await http.post(`/api/admin/invoices/${inv2.id}/pay`).set(auth(adminToken)).send({ paymentMethod: 'CASH' }).expect(409);
    await http.post(`/api/admin/invoices/${inv1.id}/void`).set(auth(adminToken)).send({ reason: 'x' }).expect(409);
    expect((await http.get(`/api/admin/events?companyId=${A.id}&type=INVOICE_VOIDED`).set(auth(adminToken)).expect(200)).body.total).toBe(1);
  });

  it('a SUSPENDED company stays suspended when paying (subscription still extended); paidAt date honoured', async () => {
    B.id = await register(B);
    await http.post(`/api/admin/companies/${B.id}/activate`).set(auth(adminToken)).send({ plan: 'ESSENTIALS', billingCycle: 'MONTHLY', mode: 'PAID' }).expect(200);
    B.token = (await login(B.email).expect(200)).body.accessToken;
    const created = await http.post(`/api/admin/companies/${B.id}/invoices`).set(auth(adminToken)).send({ periodStart: '2026-01-01' }).expect(201);
    expect(created.body).toMatchObject({ employees: 1, unitPrice: 19, periodEnd: '2026-01-31', total: 21.85 });
    await http.post(`/api/admin/companies/${B.id}/suspend`).set(auth(adminToken)).send({ reason: 'تأخر السداد' }).expect(200);
    const paid = await http.post(`/api/admin/invoices/${created.body.id}/pay`).set(auth(adminToken)).send({ paymentMethod: 'CASH', paidAt: '2026-02-03' }).expect(200);
    expect(paid.body.paidAt.slice(0, 10)).toBe('2026-02-03');
    const c = await prisma.company.findUniqueOrThrow({ where: { id: B.id } });
    expect(c.status).toBe('SUSPENDED');
    expect(c.subscriptionEndsAt!.toISOString()).toBe(endOfDay('2026-01-31').toISOString());
    await http.post(`/api/admin/companies/${B.id}/reactivate`).set(auth(adminToken)).send({}).expect(200);
    await prisma.company.update({ where: { id: B.id }, data: { subscriptionEndsAt: null } });
    B.token = (await login(B.email).expect(200)).body.accessToken;
    invB = (await http.post(`/api/admin/companies/${B.id}/invoices`).set(auth(adminToken)).send({ sendEmail: false }).expect(201)).body;
  });

  it('OWNER /billing: own company only; non-admins get 403 on /admin/invoices', async () => {
    const list = await http.get('/api/billing/invoices').set(auth(A.token)).expect(200);
    expect(list.body).toMatchObject({ total: 2, page: 1, pageSize: 20 });
    expect(list.body.data.map((i: { id: string }) => i.id).sort()).toEqual([inv1.id, inv2.id].sort());
    expect(list.body.data.find((i: { id: string }) => i.id === inv2.id).status).toBe('VOID');

    await http.get(`/api/billing/invoices/${invB.id}`).set(auth(A.token)).expect(404);
    const detail = await http.get(`/api/billing/invoices/${inv1.id}`).set(auth(A.token)).expect(200);
    expect(detail.body).toMatchObject({ id: inv1.id, status: 'PAID', company: { id: A.id, nameAr: A.name, ownerEmail: A.email }, seller: { sellerName: 'شؤون لتقنية المعلومات', iban: 'SA0380000000608010167519' } });

    const sub = await http.get('/api/billing/subscription').set(auth(A.token)).expect(200);
    expect(sub.body).toMatchObject({ status: 'ACTIVE', plan: 'GROWTH', billingCycle: 'MONTHLY', effectivePrice: 29, maxEmployees: null, activeEmployees: 2, trialEndsAt: null });
    expect(typeof sub.body.daysLeft).toBe('number');
    expect(sub.body.subscriptionEndsAt).toBeTruthy();

    await http.get('/api/admin/invoices').set(auth(A.token)).expect(403);
    await http.get('/api/admin/emails').set(auth(A.token)).expect(403);
    await http.post(`/api/admin/invoices/${invB.id}/pay`).set(auth(A.token)).send({ paymentMethod: 'CASH' }).expect(403);
    await http.get('/api/billing/invoices').set(auth(adminToken)).expect(403);
  });

  it('admin invoice list: filters, search, overdue flag and summary (ignores filters); detail', async () => {
    await prisma.invoice.update({ where: { id: invB.id }, data: { dueDate: day(addDaysStr(today, -1)) } });
    const all = await http.get('/api/admin/invoices').set(auth(adminToken)).expect(200);
    expect(all.body.total).toBe(4);
    expect(all.body.summary.outstanding).toEqual({ count: 1, amount: 21.85 }); // 1 × 19 × 1.15
    expect(all.body.summary.overdue).toEqual({ count: 1, amount: 21.85 });
    expect(all.body.summary.paidThisMonth).toEqual({ count: 1, amount: 66.7 }); // B's payment was dated 2026-02-03

    const overdue = await http.get('/api/admin/invoices?overdue=true').set(auth(adminToken)).expect(200);
    expect(overdue.body.data.map((i: { id: string }) => i.id)).toEqual([invB.id]);
    expect(overdue.body.data[0].overdue).toBe(true);
    expect(overdue.body.summary.paidThisMonth.count).toBe(1);

    expect((await http.get('/api/admin/invoices?status=VOID').set(auth(adminToken)).expect(200)).body.total).toBe(1);
    expect((await http.get(`/api/admin/invoices?companyId=${A.id}`).set(auth(adminToken)).expect(200)).body.total).toBe(2);
    expect((await http.get(`/api/admin/invoices?search=${inv1.number}`).set(auth(adminToken)).expect(200)).body.total).toBe(1);
    expect((await http.get(`/api/admin/invoices?search=${encodeURIComponent('أخرى')}`).set(auth(adminToken)).expect(200)).body.total).toBe(2);
    await http.get('/api/admin/invoices?status=NOPE').set(auth(adminToken)).expect(400);

    const d = await http.get(`/api/admin/invoices/${inv1.id}`).set(auth(adminToken)).expect(200);
    expect(d.body.company).toEqual({ id: A.id, nameAr: A.name, nameEn: null, crNumber: null, vatNumber: null, city: null, ownerName: 'مالك', ownerEmail: A.email, ownerPhone: '+966500000077' });
    expect(d.body.seller).toMatchObject({ sellerEmail: 'hello@shuoon.net', vatRate: 0.15 });
    await http.get('/api/admin/invoices/nope').set(auth(adminToken)).expect(404);
  });

  it('reminders run: due trial / subscription / overdue invoice reminders are sent once (dedupe)', async () => {
    C.id = await register(C);
    await http.post(`/api/admin/companies/${C.id}/activate`).set(auth(adminToken)).send({ plan: 'GROWTH', billingCycle: 'MONTHLY', mode: 'TRIAL' }).expect(200);
    await prisma.company.update({ where: { id: C.id }, data: { trialEndsAt: endOfDay(addDaysStr(today, 3)) } });
    await prisma.company.update({ where: { id: A.id }, data: { subscriptionEndsAt: endOfDay(addDaysStr(today, 7)) } });
    // B: open-ended subscription (no reminder), invoice 1 day overdue

    const r1 = await http.post('/api/admin/reminders/run').set(auth(adminToken)).expect(200);
    expect(r1.body).toEqual({ sent: 3 });
    const r2 = await http.post('/api/admin/reminders/run').set(auth(adminToken)).expect(200);
    expect(r2.body).toEqual({ sent: 0 });

    const trial = await http.get('/api/admin/emails?type=TRIAL_ENDING').set(auth(adminToken)).expect(200);
    expect(trial.body.total).toBe(1);
    expect(trial.body.data[0]).toMatchObject({ companyId: C.id, companyName: C.name, to: C.email, status: 'LOGGED' });
    expect(trial.body.data[0].dedupeKey).toBeUndefined();
    expect((await http.get('/api/admin/emails?type=SUBSCRIPTION_ENDING').set(auth(adminToken)).expect(200)).body.data[0]).toMatchObject({ companyId: A.id });
    const overdue = await http.get('/api/admin/emails?type=INVOICE_OVERDUE').set(auth(adminToken)).expect(200);
    expect(overdue.body.data[0]).toMatchObject({ companyId: B.id });
    expect(overdue.body.data[0].body).toContain(invB.number);
    expect(await prisma.emailLog.count({ where: { dedupeKey: `INVOICE_OVERDUE:${invB.id}:1` } })).toBe(1);

    const ev = await http.get(`/api/admin/events?companyId=${A.id}&type=REMINDER_SENT`).set(auth(adminToken)).expect(200);
    expect(ev.body.data[0].data).toEqual({ type: 'SUBSCRIPTION_ENDING', daysLeft: 7 });
    const notes = await http.get('/api/notifications').set(auth(A.token)).expect(200);
    expect(JSON.stringify(notes.body)).toContain('اشتراك');

    const page = await http.get('/api/admin/emails?pageSize=2').set(auth(adminToken)).expect(200);
    expect(page.body).toMatchObject({ page: 1, pageSize: 2 });
    expect(page.body.data).toHaveLength(2);
    expect(new Date(page.body.data[0].createdAt).getTime()).toBeGreaterThanOrEqual(new Date(page.body.data[1].createdAt).getTime());
    expect((await http.get('/api/admin/emails?status=LOGGED').set(auth(adminToken)).expect(200)).body.total).toBe(page.body.total);
  });

  it('expiry sends one EXPIRED email (notifyOnExpiry), even when expiry is re-detected', async () => {
    await prisma.company.update({ where: { id: C.id }, data: { trialEndsAt: new Date(Date.now() - 60000) } });
    expect(await app.get(PlatformService).expireDue()).toBe(1);
    const res = await http.get(`/api/admin/emails?type=EXPIRED&companyId=${C.id}`).set(auth(adminToken)).expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].to).toBe(C.email);
    await http.post('/api/admin/reminders/run').set(auth(adminToken)).expect(200);
    expect((await http.get(`/api/admin/emails?type=EXPIRED`).set(auth(adminToken)).expect(200)).body.total).toBe(1);
  });

  it('manual reminder; company detail includes invoices & emails', async () => {
    const r = await http.post(`/api/admin/companies/${A.id}/remind`).set(auth(adminToken)).send({ message: 'نرجو التواصل لتجديد الاشتراك' }).expect(201);
    expect(r.body).toMatchObject({ type: 'MANUAL_REMINDER', status: 'LOGGED', to: A.email, companyId: A.id });
    expect(r.body.body).toContain('نرجو التواصل لتجديد الاشتراك');
    expect(r.body.body).toContain('hello@shuoon.net');
    expect(r.body.body).toContain('www.shuoon.net');

    const d = await http.get(`/api/admin/companies/${A.id}`).set(auth(adminToken)).expect(200);
    expect(d.body.invoices.map((i: { id: string }) => i.id).sort()).toEqual([inv1.id, inv2.id].sort());
    expect(d.body.invoices[0]).toHaveProperty('overdue');
    expect(d.body.emails.map((e: { type: string }) => e.type)).toEqual(expect.arrayContaining(['INVOICE_ISSUED', 'PAYMENT_RECEIVED', 'SUBSCRIPTION_ENDING', 'MANUAL_REMINDER']));
  });

  it('reminders disabled → nothing sent', async () => {
    await http.patch('/api/admin/settings').set(auth(adminToken)).send({ reminders: { enabled: false } }).expect(200);
    await prisma.company.update({ where: { id: A.id }, data: { subscriptionEndsAt: endOfDay(addDaysStr(today, 1)) } });
    expect((await http.post('/api/admin/reminders/run').set(auth(adminToken)).expect(200)).body).toEqual({ sent: 0 });
    await http.patch('/api/admin/settings').set(auth(adminToken)).send({ reminders: { enabled: true } }).expect(200);
  });

  it('hard delete still works: invoices cascade, email log is kept', async () => {
    const before = await prisma.emailLog.count({ where: { companyId: A.id } });
    expect(before).toBeGreaterThan(0);
    await http.delete(`/api/admin/companies/${A.id}`).set(auth(adminToken)).send({ confirmName: A.name }).expect(200, { ok: true });
    expect(await prisma.invoice.count({ where: { companyId: A.id } })).toBe(0);
    expect(await prisma.emailLog.count({ where: { companyId: A.id } })).toBe(before);
    const emails = await http.get(`/api/admin/emails?companyId=${A.id}`).set(auth(adminToken)).expect(200);
    expect(emails.body.total).toBe(before);
    expect(emails.body.data[0].companyName).toBeNull();
  });
});
