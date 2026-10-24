import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { addDays, dayStr, todayStr } from '../src/common/dates';

/** Valid Saudi IBAN for a bank code + 18-digit account (mod-97). */
function iban(bank: string, account: string) {
  const bban = bank + account;
  let rem = 0;
  for (const ch of bban + '281000') rem = (rem * 10 + Number(ch)) % 97;
  return `SA${String(98 - rem).padStart(2, '0')}${bban}`;
}

const ALREADY_PROCESSED_AR = 'تمت معالجة هذا الطلب مسبقاً';

describe('Payroll & leave review fixes (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const stamp = Date.now();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  let ownerToken = '';
  let employeeId = '';
  let employeeToken = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication(), { swagger: false });
    await app.init();
    http = request(app.getHttpServer());
    await app.get(PrismaService).platformSettings.upsert({ where: { id: 1 }, update: { requireApproval: false }, create: { id: 1, requireApproval: false } });

    const reg = await http
      .post('/api/auth/register')
      .send({ companyNameAr: 'شركة الرواتب', sector: 'RESTAURANTS', ownerName: 'مالك', email: `payowner${stamp}@test.sa`, password: 'Passw0rd!' })
      .expect(201);
    ownerToken = reg.body.accessToken;
    const branch = await http.post('/api/branches').set(auth(ownerToken)).send({ nameAr: 'الفرع الرئيسي', city: 'الرياض', lat: 24.7, lng: 46.7, radiusMeters: 150 }).expect(201);
    const emp = await http
      .post('/api/employees')
      .set(auth(ownerToken))
      .send({
        firstNameAr: 'فهد',
        lastNameAr: 'العتيبي',
        nationality: 'SA',
        gender: 'MALE',
        nationalId: '1098765432',
        branchId: branch.body.id,
        jobTitle: 'محاسب',
        hireDate: '2022-01-01',
        basicSalary: 6000,
        housingAllowance: 1500,
        iban: iban('10', '998877665544332211'),
        createUser: { email: `payemp${stamp}@test.sa`, password: 'Passw0rd!' },
      })
      .expect(201);
    employeeId = emp.body.id;
    const login = await http.post('/api/auth/login').send({ email: `payemp${stamp}@test.sa`, password: 'Passw0rd!' }).expect(200);
    employeeToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app.get(PrismaService).$disconnect();
    await app.close();
  });

  it('concurrent payroll approvals: exactly one succeeds and the loan installment is deducted once (review #1)', async () => {
    const period = '2026-09';
    await http.post('/api/loans').set(auth(ownerToken)).send({ employeeId, amount: 3000, monthlyDeduction: 500, startPeriod: period }).expect(201);
    const run = await http.post('/api/payroll/runs').set(auth(ownerToken)).send({ period }).expect(201);
    await http.post(`/api/payroll/runs/${run.body.id}/calculate`).set(auth(ownerToken)).expect(200);

    const results = await Promise.all([
      http.post(`/api/payroll/runs/${run.body.id}/approve`).set(auth(ownerToken)),
      http.post(`/api/payroll/runs/${run.body.id}/approve`).set(auth(ownerToken)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)!.body.messageAr).toBe(ALREADY_PROCESSED_AR);

    const loans = await http.get('/api/loans').set(auth(ownerToken)).expect(200);
    const loan = loans.body.find((l: { employeeId: string }) => l.employeeId === employeeId);
    expect(loan.remaining).toBe(2500);

    // a recalculation after approval is still refused
    await http.post(`/api/payroll/runs/${run.body.id}/calculate`).set(auth(ownerToken)).expect(400);
  });

  it('concurrent leave approvals: exactly one decision takes effect (review #11, leaves part)', async () => {
    const types = await http.get('/api/leave-types').set(auth(ownerToken)).expect(200);
    const sick = types.body.find((t: { code: string }) => t.code === 'SICK');
    const start = addDays(todayStr(), 30);
    const leave = await http
      .post('/api/leaves')
      .set(auth(ownerToken))
      .send({ employeeId, leaveTypeId: sick.id, startDate: dayStr(start), endDate: dayStr(addDays(start, 2)) })
      .expect(201);
    expect(leave.body.days).toBe(3);

    const before = await http.get('/api/notifications').set(auth(employeeToken)).expect(200);
    const results = await Promise.all([
      http.post(`/api/leaves/${leave.body.id}/approve`).set(auth(ownerToken)).send({ comment: 'أ' }),
      http.post(`/api/leaves/${leave.body.id}/approve`).set(auth(ownerToken)).send({ comment: 'ب' }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses[0]).toBe(200);
    expect([400, 409]).toContain(statuses[1]);

    const after = await http.get('/api/notifications').set(auth(employeeToken)).expect(200);
    expect(after.body.length - before.body.length).toBe(1);
  });
});
