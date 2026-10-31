import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { addDays, dayStr, todayStr } from '../src/common/dates';

type Item = { employeeId: string; type: string; status: string; employeeName: string; branchName: string | null };

/** Sector documents compliance — spec §4 (Baladi health certificate, SCFHS licence, TGA driver card). */
describe('Sector documents compliance (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const stamp = Date.now();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const inDays = (n: number) => dayStr(addDays(todayStr(), n))!;
  let ownerToken = '';
  let managerToken = '';
  let payrollToken = '';
  let otherToken = '';
  let branchA = '';
  let branchB = '';
  const emp: Record<string, string> = {};

  const employee = (n: number, extra: Record<string, unknown>) => ({
    firstNameAr: `موظف${n}`,
    lastNameAr: 'الامتثال',
    gender: 'MALE',
    nationality: 'SA',
    nationalId: `1${String(stamp).slice(-7)}${String(n).padStart(2, '0')}`,
    hireDate: '2024-01-01',
    basicSalary: 5000,
    ...extra,
  });
  const create = async (key: string, n: number, extra: Record<string, unknown>, token = ownerToken) => {
    emp[key] = (await http.post('/api/employees').set(auth(token)).send(employee(n, extra)).expect(201)).body.id;
  };
  const register = async (prefix: string, sector: string) =>
    (await http
      .post('/api/auth/register')
      .send({ companyNameAr: `شركة ${prefix}`, sector, ownerName: 'مالك', email: `${prefix}${stamp}@test.sa`, password: 'Passw0rd!' })
      .expect(201)).body.accessToken as string;
  const compliance = async (token = ownerToken) =>
    (await http.get('/api/documents/compliance').set(auth(token)).expect(200)).body as { items: Item[]; counts: Record<string, number> };
  const ordered = (items: Item[]) => items.map((i) => `${Object.keys(emp).find((k) => emp[k] === i.employeeId) ?? i.employeeId}:${i.type}:${i.status}`);
  const rows = (items: Item[]) => ordered(items).sort();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication(), { swagger: false });
    await app.init();
    http = request(app.getHttpServer());
    await app.get(PrismaService).platformSettings.upsert({ where: { id: 1 }, update: { requireApproval: false }, create: { id: 1, requireApproval: false } });

    ownerToken = await register('docsowner', 'RESTAURANTS');
    otherToken = await register('docsother', 'RETAIL');
    branchA = (await http.post('/api/branches').set(auth(ownerToken)).send({ nameAr: 'فرع العليا', city: 'الرياض', lat: 24.7, lng: 46.7 }).expect(201)).body.id;
    branchB = (await http.post('/api/branches').set(auth(ownerToken)).send({ nameAr: 'فرع جدة', city: 'جدة', lat: 21.5, lng: 39.2 }).expect(201)).body.id;

    await create('a1', 1, { branchId: branchA });
    await create('a2', 2, { branchId: branchA, nationality: 'EG', nationalId: `2${String(stamp).slice(-7)}02` });
    await http.post(`/api/employees/${emp.a2}/documents`).set(auth(ownerToken)).send({ type: 'IQAMA', number: '2000000002', expiryDate: inDays(60) }).expect(201);
    await create('b1', 3, { branchId: branchB });
    await create('exempt', 4, { branchId: branchA, docExemptions: ['HEALTH_CERTIFICATE'] });
    await create('gone', 5, { branchId: branchA });
    // expat onboarded through the employee form: iqama expiry on the profile, no IQAMA document record
    await create('formExpat', 7, { branchId: branchB, nationality: 'IN', nationalId: `2${String(stamp).slice(-7)}07`, idExpiry: inDays(200), docExemptions: ['HEALTH_CERTIFICATE'] });
    await http.post(`/api/employees/${emp.gone}/terminate`).set(auth(ownerToken)).send({ terminationDate: todayStr(), reason: 'RESIGNATION' }).expect(201);

    await http.post('/api/users').set(auth(ownerToken))
      .send({ name: 'مدير العليا', email: `docsmgr${stamp}@test.sa`, password: 'Passw0rd!', role: 'BRANCH_MANAGER', employeeId: emp.a1 }).expect(201);
    managerToken = (await http.post('/api/auth/login').send({ email: `docsmgr${stamp}@test.sa`, password: 'Passw0rd!' }).expect(200)).body.accessToken;
    await http.post('/api/users').set(auth(ownerToken))
      .send({ name: 'الرواتب', email: `docspay${stamp}@test.sa`, password: 'Passw0rd!', role: 'PAYROLL' }).expect(201);
    payrollToken = (await http.post('/api/auth/login').send({ email: `docspay${stamp}@test.sa`, password: 'Passw0rd!' }).expect(200)).body.accessToken;
  });

  afterAll(async () => {
    await app.get(PrismaService).$disconnect();
    await app.close();
  });

  it('restaurant: lists missing health certificates and the expiring iqama; terminated and exempted staff excluded', async () => {
    const body = await compliance();
    expect(rows(body.items)).toEqual(['a1:HEALTH_CERTIFICATE:MISSING', 'a2:HEALTH_CERTIFICATE:MISSING', 'a2:IQAMA:WARNING', 'b1:HEALTH_CERTIFICATE:MISSING']);
    expect(body.counts).toEqual({ MISSING: 3, EXPIRED: 0, CRITICAL: 0, WARNING: 1 });
    const a1 = body.items.find((i) => i.employeeId === emp.a1)!;
    expect(a1).toMatchObject({ employeeName: 'موظف1 الامتثال', branchName: 'فرع العليا' });
    // worst first (MISSING → EXPIRED → CRITICAL → WARNING), then by employee number
    expect(ordered(body.items)).toEqual(['a1:HEALTH_CERTIFICATE:MISSING', 'a2:HEALTH_CERTIFICATE:MISSING', 'b1:HEALTH_CERTIFICATE:MISSING', 'a2:IQAMA:WARNING']);
  });

  it('adding a HEALTH_CERTIFICATE clears it; one expiring in 10 days is CRITICAL', async () => {
    const doc = await http.post(`/api/employees/${emp.a1}/documents`).set(auth(ownerToken)).send({ type: 'HEALTH_CERTIFICATE', number: 'HC-1', expiryDate: inDays(200) }).expect(201);
    expect(doc.body).toMatchObject({ type: 'HEALTH_CERTIFICATE', status: 'OK' });
    await http.post(`/api/employees/${emp.b1}/documents`).set(auth(ownerToken)).send({ type: 'HEALTH_CERTIFICATE', expiryDate: inDays(10) }).expect(201);
    const body = await compliance();
    expect(ordered(body.items)).toEqual(['a2:HEALTH_CERTIFICATE:MISSING', 'b1:HEALTH_CERTIFICATE:CRITICAL', 'a2:IQAMA:WARNING']);
    expect(body.counts).toEqual({ MISSING: 1, EXPIRED: 0, CRITICAL: 1, WARNING: 1 });
  });

  it('an expat with the iqama expiry on the profile (Employee.idExpiry) and no IQAMA document is not listed', async () => {
    const body = await compliance();
    expect(body.items.some((i) => i.employeeId === emp.formExpat)).toBe(false);
    // editing the profile expiry to 10 days out makes it CRITICAL (latest copy wins), then back
    await http.patch(`/api/employees/${emp.formExpat}`).set(auth(ownerToken)).send({ idExpiry: inDays(10) }).expect(200);
    expect(rows((await compliance()).items).filter((r) => r.startsWith('formExpat'))).toEqual(['formExpat:IQAMA:CRITICAL']);
    await http.patch(`/api/employees/${emp.formExpat}`).set(auth(ownerToken)).send({ idExpiry: inDays(200) }).expect(200);
    expect((await compliance()).items.some((i) => i.employeeId === emp.formExpat)).toBe(false);
  });

  it('BRANCH_MANAGER sees only own branch', async () => {
    const body = await compliance(managerToken);
    expect(rows(body.items)).toEqual(['a2:HEALTH_CERTIFICATE:MISSING', 'a2:IQAMA:WARNING']);
    expect(body.counts).toEqual({ MISSING: 1, EXPIRED: 0, CRITICAL: 0, WARNING: 1 });
  });

  it('PAYROLL and EMPLOYEE roles are refused', async () => {
    await http.get('/api/documents/compliance').set(auth(payrollToken)).expect(403);
    await create('selfService', 6, { branchId: branchB, docExemptions: ['HEALTH_CERTIFICATE'], createUser: { email: `docsemp${stamp}@test.sa`, password: 'Passw0rd!' } });
    const employeeToken = (await http.post('/api/auth/login').send({ email: `docsemp${stamp}@test.sa`, password: 'Passw0rd!' }).expect(200)).body.accessToken;
    await http.get('/api/documents/compliance').set(auth(employeeToken)).expect(403);
  });

  it('PATCH /employees/:id accepts docExemptions (validated against DocumentType) and the requirement disappears', async () => {
    await http.patch(`/api/employees/${emp.a2}`).set(auth(ownerToken)).send({ docExemptions: ['NOT_A_TYPE'] }).expect(400);
    await http.patch(`/api/employees/${emp.a2}`).set(auth(ownerToken)).send({ docExemptions: null }).expect(400);
    const res = await http.patch(`/api/employees/${emp.a2}`).set(auth(ownerToken)).send({ docExemptions: ['HEALTH_CERTIFICATE', 'HEALTH_CERTIFICATE'] }).expect(200);
    expect(res.body.docExemptions).toEqual(['HEALTH_CERTIFICATE']);
    expect(rows((await compliance()).items)).toEqual(['a2:IQAMA:WARNING', 'b1:HEALTH_CERTIFICATE:CRITICAL']);
    const detail = await http.get(`/api/employees/${emp.exempt}`).set(auth(ownerToken)).expect(200);
    expect(detail.body.docExemptions).toEqual(['HEALTH_CERTIFICATE']);
    const cleared = await http.patch(`/api/employees/${emp.a2}`).set(auth(ownerToken)).send({ docExemptions: [] }).expect(200);
    expect(cleared.body.docExemptions).toEqual([]);
  });

  it('all four new document types are accepted; existing types keep working', async () => {
    for (const type of ['PROFESSIONAL_LICENSE', 'DRIVER_CARD', 'DRIVING_LICENSE', 'CERTIFICATE', 'PASSPORT']) {
      await http.post(`/api/employees/${emp.exempt}/documents`).set(auth(ownerToken)).send({ type, expiryDate: inDays(400) }).expect(201);
    }
    const docs = (await http.get(`/api/employees/${emp.exempt}/documents`).set(auth(ownerToken)).expect(200)).body;
    expect(docs.map((d: { type: string }) => d.type).sort()).toEqual(['CERTIFICATE', 'DRIVER_CARD', 'DRIVING_LICENSE', 'PASSPORT', 'PROFESSIONAL_LICENSE']);
  });

  it('tenant isolation: another (retail) company sees only its own non-Saudi without an iqama', async () => {
    await create('otherSaudi', 20, {}, otherToken);
    await create('otherExpat', 21, { nationality: 'IN', nationalId: `2${String(stamp).slice(-7)}21` }, otherToken);
    const body = await compliance(otherToken);
    expect(rows(body.items)).toEqual(['otherExpat:IQAMA:MISSING']);
  });
});
