import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { calculateGosi, gosiRatesFor } from '@taqam/core';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { todayStr } from '../src/common/dates';

/** GOSI two regimes (new Social Insurance Law) — spec §3. */
describe('GOSI two regimes (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const stamp = Date.now();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  let ownerToken = '';
  let newRegimeId = '';
  let legacyId = '';

  const employee = (n: number, extra: Record<string, unknown>) => ({
    firstNameAr: `موظف${n}`,
    lastNameAr: 'السعودي',
    nationality: 'SA',
    gender: 'MALE',
    nationalId: `10${String(stamp).slice(-6)}${n}`,
    hireDate: '2020-01-01',
    basicSalary: 10000,
    housingAllowance: 2500,
    ...extra,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication(), { swagger: false });
    await app.init();
    http = request(app.getHttpServer());
    await app.get(PrismaService).platformSettings.upsert({ where: { id: 1 }, update: { requireApproval: false }, create: { id: 1, requireApproval: false } });

    const reg = await http
      .post('/api/auth/register')
      .send({ companyNameAr: 'شركة التأمينات', sector: 'RETAIL', ownerName: 'مالك', email: `gosiowner${stamp}@test.sa`, password: 'Passw0rd!' })
      .expect(201);
    ownerToken = reg.body.accessToken;
  });

  afterAll(async () => {
    await app.get(PrismaService).$disconnect();
    await app.close();
  });

  it('stores gosiFirstRegisteredAt on create, clears it with null, and rejects a non-date', async () => {
    const created = await http.post('/api/employees').set(auth(ownerToken)).send(employee(1, { gosiFirstRegisteredAt: '2025-01-10' })).expect(201);
    newRegimeId = created.body.id;
    expect(String(created.body.gosiFirstRegisteredAt).slice(0, 10)).toBe('2025-01-10');

    const legacy = await http.post('/api/employees').set(auth(ownerToken)).send(employee(2, {})).expect(201);
    legacyId = legacy.body.id;
    expect(legacy.body.gosiFirstRegisteredAt).toBeNull();

    const detail = await http.get(`/api/employees/${newRegimeId}`).set(auth(ownerToken)).expect(200);
    expect(String(detail.body.gosiFirstRegisteredAt).slice(0, 10)).toBe('2025-01-10');

    await http.patch(`/api/employees/${legacyId}`).set(auth(ownerToken)).send({ gosiFirstRegisteredAt: 'not-a-date' }).expect(400);
    const set = await http.patch(`/api/employees/${legacyId}`).set(auth(ownerToken)).send({ gosiFirstRegisteredAt: '2024-07-02' }).expect(200);
    expect(String(set.body.gosiFirstRegisteredAt).slice(0, 10)).toBe('2024-07-02');
    const cleared = await http.patch(`/api/employees/${legacyId}`).set(auth(ownerToken)).send({ gosiFirstRegisteredAt: null }).expect(200);
    expect(cleared.body.gosiFirstRegisteredAt).toBeNull();
  });

  it('payroll 2026-07: NEW regime pays 10.75% / 12.75%, LEGACY keeps 9.75% / 11.75%', async () => {
    const run = await http.post('/api/payroll/runs').set(auth(ownerToken)).send({ period: '2026-07' }).expect(201);
    const calc = await http.post(`/api/payroll/runs/${run.body.id}/calculate`).set(auth(ownerToken)).expect(200);
    const slip = (id: string) => calc.body.payslips.find((p: { employee: { id: string } }) => p.employee.id === id);
    expect(Number(slip(newRegimeId).gosiEmployee)).toBe(1343.75);
    expect(Number(slip(newRegimeId).gosiEmployer)).toBe(1593.75);
    expect(Number(slip(legacyId).gosiEmployee)).toBe(1218.75);
    expect(Number(slip(legacyId).gosiEmployer)).toBe(1468.75);
  });

  it('dashboard payroll-cost estimate uses each employee\'s regime for the current period', async () => {
    const res = await http.get('/api/dashboard').set(auth(ownerToken)).expect(200);
    expect(res.body.monthlyPayrollCostSource).toBe('ESTIMATE');
    const period = todayStr().slice(0, 7);
    const employer = (firstRegisteredAt: string | null) =>
      calculateGosi({ basic: 10000, housing: 2500, isSaudi: true }, gosiRatesFor({ isSaudi: true, firstRegisteredAt }, period)).employer;
    expect(res.body.monthlyPayrollCost).toBeCloseTo(12500 * 2 + employer('2025-01-10') + employer(null), 2);
  });
});
