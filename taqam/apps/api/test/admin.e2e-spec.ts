import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { PlatformService } from '../src/platform/platform.service';

/** Platform admin portal (docs/ADMIN_PORTAL.md): SUPER_ADMIN, company lifecycle, MRR, impersonation. */
describe('Platform admin portal (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  const stamp = Date.now();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const PASSWORD = 'Passw0rd!';

  let adminToken = '';
  let adminId = '';
  let ownerToken = '';
  let companyId = '';
  const ownerEmail = `owner${stamp}@lifecycle.sa`;
  const companyName = 'منشأة دورة الحياة';

  const login = (email: string, password = PASSWORD) => http.post('/api/auth/login').send({ email, password });
  const employee = (n: number) => ({
    firstNameAr: `موظف${n}`,
    lastNameAr: 'الاختبار',
    nationality: 'SA',
    gender: 'MALE',
    nationalId: `10${String(stamp).slice(-6)}${n}${n}`.slice(0, 10),
    hireDate: '2024-01-01',
    basicSalary: 5000,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication(), { swagger: false });
    await app.init();
    http = request(app.getHttpServer());
    prisma = app.get(PrismaService);
    // Start from an empty platform so overview numbers are exact (files run in band).
    await prisma.company.deleteMany({});
    await prisma.companyEvent.deleteMany({});
    await prisma.lead.deleteMany({});
    await prisma.platformSettings.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('bootstraps PLATFORM_ADMIN_EMAIL on boot; SUPER_ADMIN login + /auth/me', async () => {
    const res = await login('platform@test.sa', 'Admin@2026!').expect(200);
    adminToken = res.body.accessToken;
    adminId = res.body.user.id;
    expect(res.body.user).toMatchObject({ role: 'SUPER_ADMIN', companyId: null, employeeId: null, branchId: null });
    expect(res.body.company).toBeNull();
    const me = await http.get('/api/auth/me').set(auth(adminToken)).expect(200);
    expect(me.body).toMatchObject({ email: 'platform@test.sa', role: 'SUPER_ADMIN', companyId: null, employeeId: null, branchId: null, company: null });
  });

  it('settings default to approval required, 14 trial days, list prices', async () => {
    const s = await http.get('/api/admin/settings').set(auth(adminToken)).expect(200);
    expect(s.body).toEqual({ requireApproval: true, trialDays: 14, prices: { ESSENTIALS: 19, GROWTH: 29, ENTERPRISE: null }, annualDiscount: 0.15 });
    await http.patch('/api/admin/settings').set(auth(adminToken)).send({ annualDiscount: 2 }).expect(400);
  });

  it('register → PENDING; login 403 COMPANY_PENDING → admin activates (TRIAL) → login OK', async () => {
    const reg = await http
      .post('/api/auth/register')
      .send({ companyNameAr: companyName, sector: 'RETAIL', ownerName: 'مالك المنشأة', email: ownerEmail, phone: '+966500000001', password: PASSWORD })
      .expect(201);
    expect(reg.body.company.status).toBe('PENDING');
    companyId = reg.body.company.id;

    const denied = await login(ownerEmail).expect(403);
    expect(denied.body).toMatchObject({ statusCode: 403, code: 'COMPANY_PENDING', messageAr: 'حساب منشأتك قيد المراجعة، وسيتم تفعيله قريباً' });
    // the token handed out at registration is blocked too (central guard)
    const blocked = await http.get('/api/auth/me').set(auth(reg.body.accessToken)).expect(403);
    expect(blocked.body.code).toBe('COMPANY_PENDING');
    // wrong password still yields 401 (status is never leaked to strangers)
    await login(ownerEmail, 'wrong-password').expect(401);

    const pending = await http.get('/api/admin/companies?status=PENDING').set(auth(adminToken)).expect(200);
    expect(pending.body.data.map((c: { id: string }) => c.id)).toContain(companyId);

    const act = await http
      .post(`/api/admin/companies/${companyId}/activate`)
      .set(auth(adminToken))
      .send({ plan: 'GROWTH', billingCycle: 'MONTHLY', mode: 'TRIAL' })
      .expect(200);
    expect(act.body).toMatchObject({ id: companyId, status: 'TRIAL', plan: 'GROWTH', effectivePrice: 29, mrr: 0, daysLeft: 14, ownerEmail, ownerPhone: '+966500000001' });

    const ok = await login(ownerEmail).expect(200);
    ownerToken = ok.body.accessToken;
    expect(ok.body.company).toMatchObject({ id: companyId, status: 'TRIAL' });
    await http.get('/api/employees').set(auth(ownerToken)).expect(200);
  });

  it('role walls: company OWNER → 403 on /admin/*, SUPER_ADMIN → 403 on tenant endpoints', async () => {
    await http.get('/api/admin/overview').set(auth(ownerToken)).expect(403);
    await http.get('/api/admin/companies').set(auth(ownerToken)).expect(403);
    await http.get('/api/employees').set(auth(adminToken)).expect(403);
    await http.get('/api/dashboard').set(auth(adminToken)).expect(403);
    await http.get('/api/company').set(auth(adminToken)).expect(403);
    await http.get('/api/me/profile').set(auth(adminToken)).expect(403);
    await http.get('/api/notifications').set(auth(adminToken)).expect(403);
    // company admins can never mint a SUPER_ADMIN
    await http.post('/api/users').set(auth(ownerToken)).send({ email: `x${stamp}@t.sa`, name: 'xx', role: 'SUPER_ADMIN', password: PASSWORD }).expect(400);
  });

  it('suspend → 403 COMPANY_SUSPENDED (login and live token) → reactivate', async () => {
    await http.post(`/api/admin/companies/${companyId}/suspend`).set(auth(adminToken)).send({}).expect(400);
    const sus = await http.post(`/api/admin/companies/${companyId}/suspend`).set(auth(adminToken)).send({ reason: 'تأخر السداد' }).expect(200);
    expect(sus.body).toMatchObject({ status: 'SUSPENDED', suspensionReason: 'تأخر السداد' });

    const live = await http.get('/api/employees').set(auth(ownerToken)).expect(403);
    expect(live.body).toMatchObject({ code: 'COMPANY_SUSPENDED', messageAr: 'تم إيقاف حساب منشأتك. تواصل مع الدعم' });
    expect((await login(ownerEmail).expect(403)).body.code).toBe('COMPANY_SUSPENDED');

    // impersonation is allowed while suspended (support use) and returns a working 1h OWNER token
    const imp = await http.post(`/api/admin/companies/${companyId}/impersonate`).set(auth(adminToken)).expect(200);
    expect(imp.body.user).toMatchObject({ role: 'OWNER', email: ownerEmail, companyId });
    const payload = JSON.parse(Buffer.from(imp.body.accessToken.split('.')[1], 'base64url').toString());
    expect(payload).toMatchObject({ sub: imp.body.user.id, role: 'OWNER', companyId, impersonatedBy: adminId });
    expect(payload.exp - payload.iat).toBe(3600);
    await http.get('/api/employees').set(auth(imp.body.accessToken)).expect(200);
    await http.get('/api/admin/overview').set(auth(imp.body.accessToken)).expect(403);

    const re = await http.post(`/api/admin/companies/${companyId}/reactivate`).set(auth(adminToken)).send({}).expect(200);
    expect(re.body).toMatchObject({ status: 'TRIAL', suspendedAt: null, suspensionReason: null }); // trial has not ended
    await http.get('/api/employees').set(auth(ownerToken)).expect(200);
    await http.post(`/api/admin/companies/${companyId}/reactivate`).set(auth(adminToken)).send({}).expect(400);
  });

  it('seat limit → 403 SEAT_LIMIT', async () => {
    await http.patch(`/api/admin/companies/${companyId}`).set(auth(adminToken)).send({ maxEmployees: 1 }).expect(200);
    await http.post('/api/employees').set(auth(ownerToken)).send(employee(1)).expect(201);
    const res = await http.post('/api/employees').set(auth(ownerToken)).send(employee(2)).expect(403);
    expect(res.body).toMatchObject({ code: 'SEAT_LIMIT', messageAr: 'وصلت إلى الحد الأقصى لعدد الموظفين في باقتك' });
    await http.patch(`/api/admin/companies/${companyId}`).set(auth(adminToken)).send({ maxEmployees: null }).expect(200);
    await http.post('/api/employees').set(auth(ownerToken)).send(employee(2)).expect(201);
  });

  it('trial expiry → EXPIRED (lazy on access + daily job) → extend → ACTIVE', async () => {
    await prisma.company.update({ where: { id: companyId }, data: { trialEndsAt: new Date(Date.now() - 60000) } });
    const res = await http.get('/api/employees').set(auth(ownerToken)).expect(403);
    expect(res.body).toMatchObject({ code: 'COMPANY_EXPIRED', messageAr: 'انتهى اشتراك منشأتك. تواصل معنا للتجديد' });
    expect((await prisma.company.findUniqueOrThrow({ where: { id: companyId } })).status).toBe('EXPIRED');
    expect((await login(ownerEmail).expect(403)).body.code).toBe('COMPANY_EXPIRED');

    const ext = await http.post(`/api/admin/companies/${companyId}/extend`).set(auth(adminToken)).send({ days: 30 }).expect(200);
    expect(ext.body).toMatchObject({ status: 'ACTIVE', daysLeft: 30 });
    await login(ownerEmail).expect(200);

    // the daily job expires an ACTIVE company whose subscription has ended
    await prisma.company.update({ where: { id: companyId }, data: { subscriptionEndsAt: new Date(Date.now() - 1000) } });
    expect(await app.get(PlatformService).expireDue()).toBe(1);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: companyId } })).status).toBe('EXPIRED');
    await http.post(`/api/admin/companies/${companyId}/extend`).set(auth(adminToken)).send({ days: 365 }).expect(200);

    const detail = await http.get(`/api/admin/companies/${companyId}`).set(auth(adminToken)).expect(200);
    const types = detail.body.events.map((e: { type: string }) => e.type);
    expect(types).toEqual(expect.arrayContaining(['REGISTERED', 'ACTIVATED', 'SUSPENDED', 'REACTIVATED', 'PLAN_CHANGED', 'EXPIRED', 'EXTENDED', 'IMPERSONATED']));
    expect(detail.body.owner).toMatchObject({ email: ownerEmail, phone: '+966500000001' });
    expect(detail.body.usage).toMatchObject({ employees: 2, activeEmployees: 2, branches: 0, users: 1, payrollRuns: 0, lastPayrollPeriod: null });
  });

  it('overview MRR: ACTIVE only, annual × (1 − 0.15), price overrides', async () => {
    // company 1: ACTIVE, GROWTH monthly with override 22 SAR × 2 employees = 44
    await http.patch(`/api/admin/companies/${companyId}`).set(auth(adminToken)).send({ pricePerEmployee: 22 }).expect(200);
    // company 2: ACTIVE, ESSENTIALS annual, 3 employees (1 terminated excluded) → 2 × 19 × 0.85 = 32.3
    const reg2 = await http.post('/api/auth/register').send({ companyNameAr: 'منشأة سنوية', sector: 'RETAIL', ownerName: 'مالك', email: `annual${stamp}@t.sa`, password: PASSWORD }).expect(201);
    const c2 = reg2.body.company.id;
    const a2 = await http.post(`/api/admin/companies/${c2}/activate`).set(auth(adminToken)).send({ plan: 'ESSENTIALS', billingCycle: 'ANNUAL', mode: 'PAID' }).expect(200);
    expect(a2.body).toMatchObject({ status: 'ACTIVE', subscriptionEndsAt: null, daysLeft: null });
    const t2 = (await login(`annual${stamp}@t.sa`).expect(200)).body.accessToken;
    const e1 = await http.post('/api/employees').set(auth(t2)).send(employee(3)).expect(201);
    await http.post('/api/employees').set(auth(t2)).send(employee(4)).expect(201);
    await http.post('/api/employees').set(auth(t2)).send(employee(5)).expect(201);
    await http.post(`/api/employees/${e1.body.id}/terminate`).set(auth(t2)).send({ terminationDate: '2026-01-31', reason: 'RESIGNATION' }).expect(201);
    // company 3: TRIAL with employees → contributes nothing
    await http.post('/api/auth/register').send({ companyNameAr: 'منشأة معلقة', sector: 'OTHER', ownerName: 'مالك', email: `pend${stamp}@t.sa`, password: PASSWORD }).expect(201);

    const ov = await http.get('/api/admin/overview').set(auth(adminToken)).expect(200);
    expect(ov.body.mrr).toBe(76.3);
    expect(ov.body.arr).toBe(915.6);
    expect(ov.body.companies).toEqual({ total: 3, pending: 1, trial: 0, active: 2, suspended: 0, expired: 0 });
    expect(ov.body.employees).toBe(4);
    expect(ov.body.users).toBe(3);
    expect(ov.body.signupsByMonth).toHaveLength(12);
    expect(ov.body.signupsByMonth[11].count).toBe(3);
    expect(ov.body.mrrByPlan).toEqual([
      { plan: 'ESSENTIALS', mrr: 32.3, companies: 1 },
      { plan: 'GROWTH', mrr: 44, companies: 1 },
      { plan: 'ENTERPRISE', mrr: 0, companies: 0 },
    ]);
    expect(ov.body.recentSignups).toHaveLength(3);
    expect(ov.body.recentSignups[0]).toMatchObject({ nameAr: 'منشأة معلقة', status: 'PENDING', mrr: 0 });

    const list = await http.get('/api/admin/companies?sort=employees').set(auth(adminToken)).expect(200);
    expect(list.body).toMatchObject({ total: 3, page: 1, pageSize: 20 });
    const annual = list.body.data.find((c: { id: string }) => c.id === c2);
    expect(annual).toMatchObject({ employeesCount: 3, activeEmployees: 2, effectivePrice: 19, mrr: 32.3, billingCycle: 'ANNUAL' });
    expect((await http.get('/api/admin/companies?search=سنوية').set(auth(adminToken)).expect(200)).body.total).toBe(1);
    await http.get('/api/admin/companies?status=NOPE').set(auth(adminToken)).expect(400);
  });

  it('reset password returns a working temporary password', async () => {
    const detail = await http.get(`/api/admin/companies/${companyId}`).set(auth(adminToken)).expect(200);
    const owner = detail.body.users[0];
    const res = await http.post(`/api/admin/companies/${companyId}/users/${owner.id}/reset-password`).set(auth(adminToken)).expect(200);
    expect(typeof res.body.temporaryPassword).toBe('string');
    await login(ownerEmail, res.body.temporaryPassword).expect(200);
    await login(ownerEmail).expect(401);
  });

  it('leads, admins, broadcast, events', async () => {
    await http.post('/api/public/leads').send({ name: 'عميل محتمل', company: 'شركة', email: `lead${stamp}@t.sa`, phone: '+966500000009' }).expect(201);
    const leads = await http.get('/api/admin/leads?status=NEW').set(auth(adminToken)).expect(200);
    expect(leads.body.total).toBe(1);
    const lead = await http.patch(`/api/admin/leads/${leads.body.data[0].id}`).set(auth(adminToken)).send({ status: 'CONTACTED', notes: 'تم الاتصال' }).expect(200);
    expect(lead.body).toMatchObject({ status: 'CONTACTED', notes: 'تم الاتصال' });
    expect((await http.get('/api/admin/overview').set(auth(adminToken)).expect(200)).body.newLeads).toBe(0);

    const created = await http.post('/api/admin/admins').set(auth(adminToken)).send({ name: 'مشرف ثانٍ', email: `Admin2${stamp}@t.sa`, password: PASSWORD }).expect(201);
    expect(created.body).toMatchObject({ email: `admin2${stamp}@t.sa`, isActive: true });
    expect(created.body.passwordHash).toBeUndefined();
    await http.patch(`/api/admin/admins/${adminId}`).set(auth(adminToken)).send({ isActive: false }).expect(400);
    await http.patch(`/api/admin/admins/${created.body.id}`).set(auth(adminToken)).send({ isActive: false }).expect(200);
    await login(`admin2${stamp}@t.sa`).expect(401);
    const admins = await http.get('/api/admin/admins').set(auth(adminToken)).expect(200);
    expect(admins.body).toHaveLength(2);

    const sent = await http.post('/api/admin/broadcast').set(auth(adminToken)).send({ title: 'صيانة مجدولة', body: 'الخدمة متوقفة ليلة الجمعة', target: 'ACTIVE' }).expect(200);
    expect(sent.body).toEqual({ sent: 2 });
    const notes = await http.get('/api/notifications').set(auth((await login(`annual${stamp}@t.sa`).expect(200)).body.accessToken)).expect(200);
    expect(notes.body.some((n: { title: string }) => n.title === 'صيانة مجدولة')).toBe(true);

    const events = await http.get(`/api/admin/events?companyId=${companyId}&type=SUSPENDED`).set(auth(adminToken)).expect(200);
    expect(events.body.total).toBe(1);
    expect(events.body.data[0]).toMatchObject({ type: 'SUSPENDED', fromStatus: 'TRIAL', toStatus: 'SUSPENDED', adminId, data: { reason: 'تأخر السداد' }, companyName });
  });

  it('delete: wrong name → 400; exact name → hard delete of all tenant rows', async () => {
    await http.delete(`/api/admin/companies/${companyId}`).set(auth(adminToken)).send({ confirmName: 'اسم خاطئ' }).expect(400);
    await http.delete(`/api/admin/companies/${companyId}`).set(auth(adminToken)).send({ confirmName: companyName }).expect(200, { ok: true });
    await http.get(`/api/admin/companies/${companyId}`).set(auth(adminToken)).expect(404);
    expect(await prisma.employee.count({ where: { companyId } })).toBe(0);
    expect(await prisma.user.count({ where: { companyId } })).toBe(0);
    expect(await prisma.leaveType.count({ where: { companyId } })).toBe(0);
    await login(ownerEmail).expect(401);
    const log = await http.get('/api/admin/events?type=DELETED').set(auth(adminToken)).expect(200);
    expect(log.body.data[0]).toMatchObject({ companyId, companyName, type: 'DELETED' });
  });
});
