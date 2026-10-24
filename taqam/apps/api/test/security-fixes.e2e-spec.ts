import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { PrismaService } from '../src/prisma/prisma.service';

/** Review fixes #2 #7 #11 #12 #16: loan approval authority, atomic decisions, EOSB/status validation, token revocation. */
describe('Review fixes: requests, employees, auth (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  const stamp = Date.now();
  const PASSWORD = 'Passw0rd!';
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = (email: string, password = PASSWORD) => http.post('/api/auth/login').send({ email, password });

  let ownerToken = '';
  let ownerEmail = '';
  let companyId = '';
  let branchId = '';
  let employeeId = '';
  let employeeToken = '';
  let managerToken = '';
  let hrToken = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication(), { swagger: false });
    await app.init();
    http = request(app.getHttpServer());
    prisma = app.get(PrismaService);
    await prisma.platformSettings.upsert({ where: { id: 1 }, update: { requireApproval: false }, create: { id: 1, requireApproval: false } });

    ownerEmail = `sec-owner${stamp}@test.sa`;
    const reg = await http
      .post('/api/auth/register')
      .send({ companyNameAr: 'منشأة الإصلاحات', sector: 'RETAIL', ownerName: 'مالك', email: ownerEmail, password: PASSWORD })
      .expect(201);
    ownerToken = reg.body.accessToken;
    companyId = reg.body.company.id;
    branchId = (await http.post('/api/branches').set(auth(ownerToken)).send({ nameAr: 'فرع الاختبار', city: 'الرياض', lat: 24.7, lng: 46.7 }).expect(201)).body.id;

    const base = { lastNameAr: 'الاختبار', gender: 'MALE', hireDate: '2021-05-01', basicSalary: 4000, branchId };
    const emp = await http
      .post('/api/employees')
      .set(auth(ownerToken))
      .send({ ...base, firstNameAr: 'موظف', nationality: 'SA', nationalId: '1055550001', createUser: { email: `sec-emp${stamp}@test.sa`, password: PASSWORD } })
      .expect(201);
    employeeId = emp.body.id;
    employeeToken = (await login(`sec-emp${stamp}@test.sa`).expect(200)).body.accessToken;

    const mgrEmp = await http.post('/api/employees').set(auth(ownerToken)).send({ ...base, firstNameAr: 'مدير', nationality: 'SA', nationalId: '1055550002' }).expect(201);
    await http
      .post('/api/users')
      .set(auth(ownerToken))
      .send({ email: `sec-mgr${stamp}@test.sa`, name: 'مدير الفرع', role: 'BRANCH_MANAGER', password: PASSWORD, employeeId: mgrEmp.body.id })
      .expect(201);
    managerToken = (await login(`sec-mgr${stamp}@test.sa`).expect(200)).body.accessToken;

    await http.post('/api/users').set(auth(ownerToken)).send({ email: `sec-hr${stamp}@test.sa`, name: 'الموارد البشرية', role: 'HR_ADMIN', password: PASSWORD }).expect(201);
    hrToken = (await login(`sec-hr${stamp}@test.sa`).expect(200)).body.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  const loanRequest = async () =>
    (await http.post('/api/me/requests').set(auth(employeeToken)).send({ type: 'LOAN', title: 'سلفة', amount: 1200, payload: { months: 4 } }).expect(201)).body.id as string;

  // ---------- Task 5 (review #11) ----------
  it('BRANCH_MANAGER approving a LOAN request → 403 (HR/payroll authority)', async () => {
    const id = await loanRequest();
    const res = await http.post(`/api/requests/${id}/approve`).set(auth(managerToken)).send({ comment: 'ok' }).expect(403);
    expect(res.body.messageAr).toBe('اعتماد السلف من صلاحية الموارد البشرية أو الرواتب');
    expect(await prisma.loan.count({ where: { requestId: id } })).toBe(0);
    expect((await prisma.employeeRequest.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING');
    // a manager may still reject it, and still approves non-loan requests
    await http.post(`/api/requests/${id}/reject`).set(auth(managerToken)).send({ comment: 'لا' }).expect(200);
    const letter = await http.post('/api/me/requests').set(auth(employeeToken)).send({ type: 'LETTER', title: 'خطاب' }).expect(201);
    await http.post(`/api/requests/${letter.body.id}/approve`).set(auth(managerToken)).send({}).expect(200);
  });

  it('HR concurrent double-approve of a LOAN request → one 200, one 409, exactly one Loan row', async () => {
    const id = await loanRequest();
    const results = await Promise.all([
      http.post(`/api/requests/${id}/approve`).set(auth(hrToken)).send({}),
      http.post(`/api/requests/${id}/approve`).set(auth(hrToken)).send({}),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)!.body.messageAr).toBe('تمت معالجة هذا الطلب مسبقاً');
    expect(await prisma.loan.count({ where: { requestId: id } })).toBe(1);
  });

  // ---------- Task 7 (review #7, #12) ----------
  it('EOSB query validation: lowercase reason → 400, bad endDate → 400, valid → 200', async () => {
    await http.get(`/api/employees/${employeeId}/eosb?reason=resignation`).set(auth(ownerToken)).expect(400);
    await http.get(`/api/employees/${employeeId}/eosb?endDate=abc`).set(auth(ownerToken)).expect(400);
    const ok = await http.get(`/api/employees/${employeeId}/eosb?reason=RESIGNATION&endDate=2026-05-01`).set(auth(ownerToken)).expect(200);
    expect(ok.body.factor).toBeCloseTo(2 / 3);
  });

  it('PATCH employee status TERMINATED → 400; terminationDate is ignored', async () => {
    const res = await http.patch(`/api/employees/${employeeId}`).set(auth(ownerToken)).send({ status: 'TERMINATED' }).expect(400);
    expect(res.body.messageAr).toBe('استخدم إجراء إنهاء الخدمة');
    await http.patch(`/api/employees/${employeeId}`).set(auth(ownerToken)).send({ jobTitle: 'كاشير', terminationDate: '2026-01-01' }).expect(200);
    const e = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
    expect(e).toMatchObject({ status: 'ACTIVE', terminationDate: null, jobTitle: 'كاشير' });
  });

  // ---------- Task 9 (review #2) ----------
  it('change-password revokes the old token', async () => {
    const before = (await login(`sec-hr${stamp}@test.sa`).expect(200)).body.accessToken;
    await http.get('/api/auth/me').set(auth(before)).expect(200);
    const res = await http.post('/api/auth/change-password').set(auth(before)).send({ currentPassword: PASSWORD, newPassword: 'N3wPassw0rd!' }).expect(200);
    await http.get('/api/auth/me').set(auth(before)).expect(401);
    await http.get('/api/auth/me').set(auth(hrToken)).expect(401);
    // the response carries a fresh token so the user stays signed in
    await http.get('/api/auth/me').set(auth(res.body.accessToken)).expect(200);
    await login(`sec-hr${stamp}@test.sa`, 'N3wPassw0rd!').expect(200);
  });

  it('admin reset-password revokes the old token', async () => {
    const admin = (await login('platform@test.sa', 'Admin@2026!').expect(200)).body.accessToken;
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: ownerEmail } });
    await http.get('/api/employees').set(auth(ownerToken)).expect(200);
    const reset = await http.post(`/api/admin/companies/${companyId}/users/${owner.id}/reset-password`).set(auth(admin)).expect(200);
    await http.get('/api/employees').set(auth(ownerToken)).expect(401);
    const fresh = (await login(ownerEmail, reset.body.temporaryPassword).expect(200)).body.accessToken;
    await http.get('/api/employees').set(auth(fresh)).expect(200);
  });
});
