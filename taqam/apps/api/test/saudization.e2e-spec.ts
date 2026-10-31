import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { PrismaService } from '../src/prisma/prisma.service';

/** Qiwa-documented Saudization — spec §1 (since 15 Apr 2026 only documented Saudis count for Nitaqat). */
describe('Qiwa-documented Saudization (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const stamp = Date.now();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  let ownerToken = '';
  let managerToken = '';
  let otherToken = '';
  let branchId = '';
  const ids: string[] = [];
  let otherEmployeeId = '';

  const employee = (n: number, extra: Record<string, unknown>) => ({
    firstNameAr: `موظف${n}`,
    lastNameAr: 'الاختبار',
    gender: 'MALE',
    nationalId: `2${String(stamp).slice(-7)}${String(n).padStart(2, '0')}`,
    hireDate: '2024-01-01',
    basicSalary: 6000,
    ...extra,
  });

  const register = async (prefix: string) =>
    (await http
      .post('/api/auth/register')
      .send({ companyNameAr: `شركة ${prefix}`, sector: 'RETAIL', ownerName: 'مالك', email: `${prefix}${stamp}@test.sa`, password: 'Passw0rd!' })
      .expect(201)).body.accessToken as string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication(), { swagger: false });
    await app.init();
    http = request(app.getHttpServer());
    await app.get(PrismaService).platformSettings.upsert({ where: { id: 1 }, update: { requireApproval: false }, create: { id: 1, requireApproval: false } });

    ownerToken = await register('qiwaowner');
    otherToken = await register('qiwaother');

    branchId = (await http.post('/api/branches').set(auth(ownerToken)).send({ nameAr: 'فرع قوى', city: 'الرياض', lat: 24.7, lng: 46.7 }).expect(201)).body.id;
    // 7 non-Saudis, 2 documented Saudis, 1 undocumented Saudi
    for (let i = 0; i < 7; i++) {
      ids.push((await http.post('/api/employees').set(auth(ownerToken)).send(employee(i, { nationality: 'EG', branchId })).expect(201)).body.id);
    }
    for (let i = 7; i < 9; i++) {
      const res = await http.post('/api/employees').set(auth(ownerToken)).send(employee(i, { nationality: 'SA', branchId, qiwaDocumented: true })).expect(201);
      expect(res.body.qiwaDocumented).toBe(true);
      expect(res.body.qiwaDocumentedAt).toBeTruthy();
      ids.push(res.body.id);
    }
    const third = await http.post('/api/employees').set(auth(ownerToken)).send(employee(9, { nationality: 'SA', branchId })).expect(201);
    expect(third.body.qiwaDocumented).toBe(false);
    expect(third.body.qiwaDocumentedAt).toBeNull();
    ids.push(third.body.id);

    const mgrEmp = ids[0];
    await http.post('/api/users').set(auth(ownerToken))
      .send({ name: 'مدير الفرع', email: `qiwamgr${stamp}@test.sa`, password: 'Passw0rd!', role: 'BRANCH_MANAGER', employeeId: mgrEmp })
      .expect(201);
    managerToken = (await http.post('/api/auth/login').send({ email: `qiwamgr${stamp}@test.sa`, password: 'Passw0rd!' }).expect(200)).body.accessToken;

    otherEmployeeId = (await http.post('/api/employees').set(auth(otherToken)).send(employee(50, { nationality: 'SA' })).expect(201)).body.id;
  });

  afterAll(async () => {
    await app.get(PrismaService).$disconnect();
    await app.close();
  });

  it('GET /saudization: official rate counts only documented Saudis; band uses it; alert raised', async () => {
    const res = await http.get('/api/saudization').set(auth(ownerToken)).expect(200);
    expect(res.body.company).toMatchObject({
      total: 10, saudis: 3, documentedSaudis: 2, undocumentedSaudis: 1,
      officialRate: 20, internalRate: 30, rate: 20, band: 'MID_GREEN', marginToDrop: 0, alert: true,
    });
    const b = res.body.branches.find((x: { branchId: string }) => x.branchId === branchId);
    expect(b).toMatchObject({ total: 10, officialRate: 20, internalRate: 30, rate: 20, band: 'MID_GREEN', documentedSaudis: 2, undocumentedSaudis: 1, marginToDrop: 0, alert: true });
    expect(res.body.undocumented.map((e: { id: string }) => e.id)).toEqual([ids[9]]);
  });

  it('dashboard and branches use the same official rate and band as /saudization (internal kept as a secondary figure)', async () => {
    const sz = (await http.get('/api/saudization').set(auth(ownerToken)).expect(200)).body;
    const dash = (await http.get('/api/dashboard').set(auth(ownerToken)).expect(200)).body;
    expect(dash).toMatchObject({ saudizationRate: 20, nitaqatBand: 'MID_GREEN', documentedSaudis: 2, internalSaudizationRate: 30, saudis: 3 });
    expect(dash.nitaqatBand).toBe(sz.company.band);
    expect(dash.saudizationRate).toBe(sz.company.officialRate);
    const dashBranch = dash.headcountByBranch.find((x: { branchId: string }) => x.branchId === branchId);
    expect(dashBranch).toMatchObject({ count: 10, saudis: 3, documentedSaudis: 2, saudizationRate: 20, internalSaudizationRate: 30 });

    const branches = (await http.get('/api/branches').set(auth(ownerToken)).expect(200)).body;
    const b = branches.find((x: { id: string }) => x.id === branchId);
    const szb = sz.branches.find((x: { branchId: string }) => x.branchId === branchId);
    expect(b).toMatchObject({ employeesCount: 10, saudis: 3, documentedSaudis: 2, saudizationRate: 20, internalSaudizationRate: 30, nitaqatBand: 'MID_GREEN' });
    expect(b.nitaqatBand).toBe(szb.band);
  });

  it('PATCH qiwaDocumented: null is a 400, not a 500', async () => {
    // rejected by DTO validation (not by Prisma's generic «Invalid input»)
    const patch = await http.patch(`/api/employees/${ids[9]}`).set(auth(ownerToken)).send({ qiwaDocumented: null }).expect(400);
    expect(patch.body.message).toContain('qiwaDocumented must be a boolean value');
    const post = await http.post('/api/employees').set(auth(ownerToken)).send(employee(60, { nationality: 'SA', qiwaDocumented: null })).expect(400);
    expect(post.body.message).toContain('qiwaDocumented must be a boolean value');
  });

  it('POST /employees/qiwa-documented: BRANCH_MANAGER → 403', async () => {
    await http.post('/api/employees/qiwa-documented').set(auth(managerToken)).send({ employeeIds: [ids[9]], documented: true }).expect(403);
  });

  it('rejects an invalid body with 400', async () => {
    await http.post('/api/employees/qiwa-documented').set(auth(ownerToken)).send({ employeeIds: 'x', documented: 'yes' }).expect(400);
    await http.post('/api/employees/qiwa-documented').set(auth(ownerToken)).send({ employeeIds: [], documented: true }).expect(400);
  });

  it('OWNER confirms the third Saudi → official rate 30; ids of another company are ignored', async () => {
    const res = await http.post('/api/employees/qiwa-documented').set(auth(ownerToken))
      .send({ employeeIds: [ids[9], otherEmployeeId], documented: true }).expect(201);
    expect(res.body).toEqual({ updated: 1 });

    const other = await http.get(`/api/employees/${otherEmployeeId}`).set(auth(otherToken)).expect(200);
    expect(other.body.qiwaDocumented).toBe(false);
    const mine = await http.get(`/api/employees/${ids[9]}`).set(auth(ownerToken)).expect(200);
    expect(mine.body.qiwaDocumented).toBe(true);
    expect(mine.body.qiwaDocumentedAt).toBeTruthy();

    const s = await http.get('/api/saudization').set(auth(ownerToken)).expect(200);
    expect(s.body.company).toMatchObject({ officialRate: 30, internalRate: 30, band: 'HIGH_GREEN', documentedSaudis: 3, undocumentedSaudis: 0 });
    expect(s.body.undocumented).toEqual([]);
  });

  it('re-confirming keeps the original documentation date; un-documenting clears it', async () => {
    const before = (await http.get(`/api/employees/${ids[7]}`).set(auth(ownerToken)).expect(200)).body.qiwaDocumentedAt;
    expect((await http.post('/api/employees/qiwa-documented').set(auth(ownerToken)).send({ employeeIds: [ids[7]], documented: true }).expect(201)).body).toEqual({ updated: 0 });
    await http.patch(`/api/employees/${ids[7]}`).set(auth(ownerToken)).send({ qiwaDocumented: true }).expect(200);
    expect((await http.get(`/api/employees/${ids[7]}`).set(auth(ownerToken)).expect(200)).body.qiwaDocumentedAt).toBe(before);

    const off = await http.patch(`/api/employees/${ids[7]}`).set(auth(ownerToken)).send({ qiwaDocumented: false }).expect(200);
    expect(off.body).toMatchObject({ qiwaDocumented: false, qiwaDocumentedAt: null });
    const s = await http.get('/api/saudization').set(auth(ownerToken)).expect(200);
    expect(s.body.company).toMatchObject({ officialRate: 20, internalRate: 30, undocumentedSaudis: 1 });
  });

  it('GET /employees?qiwaDocumented=false lists Saudis whose contracts are not documented', async () => {
    const res = await http.get('/api/employees').query({ qiwaDocumented: 'false' }).set(auth(ownerToken)).expect(200);
    expect(res.body.data.map((e: { id: string }) => e.id)).toEqual([ids[7]]);
  });

  it('a branch with zero staff and a company with zero documented Saudis: zeros, never NaN', async () => {
    const empty = await http.post('/api/branches').set(auth(otherToken)).send({ nameAr: 'فرع فارغ', city: 'جدة', lat: 21.5, lng: 39.2 }).expect(201);
    const res = await http.get('/api/saudization').set(auth(otherToken)).expect(200);
    const b = res.body.branches.find((x: { branchId: string }) => x.branchId === empty.body.id);
    expect(b).toEqual(expect.objectContaining({ total: 0, officialRate: 0, internalRate: 0, rate: 0, band: 'RED', marginToDrop: 0, alert: false }));
    // the other company: one undocumented Saudi → official 0%, internal 100%
    expect(res.body.company).toMatchObject({ total: 1, officialRate: 0, internalRate: 100, band: 'RED', marginToDrop: 0, alert: true });
  });

  it('qiwaDocumented filter implies Saudis: combined with NON_SA it is empty', async () => {
    const res = await http.get('/api/employees').query({ qiwaDocumented: 'false', nationality: 'NON_SA' }).set(auth(ownerToken)).expect(200);
    expect(res.body).toMatchObject({ data: [], total: 0 });
  });

  it('BRANCH_MANAGER sees their own branch figures and only their branch\'s undocumented Saudis', async () => {
    const b2 = (await http.post('/api/branches').set(auth(ownerToken)).send({ nameAr: 'فرع آخر', city: 'جدة', lat: 21.5, lng: 39.2 }).expect(201)).body.id;
    const elsewhere = (await http.post('/api/employees').set(auth(ownerToken)).send(employee(70, { nationality: 'SA', branchId: b2 })).expect(201)).body.id;

    const owner = (await http.get('/api/saudization').set(auth(ownerToken)).expect(200)).body;
    expect(owner.scope).toBe('COMPANY');
    expect(owner.company).toMatchObject({ total: 11, undocumentedSaudis: 2 });
    expect(owner.undocumented.map((e: { id: string }) => e.id).sort()).toEqual([ids[7], elsewhere].sort());

    const mgr = (await http.get('/api/saudization').set(auth(managerToken)).expect(200)).body;
    expect(mgr.scope).toBe('BRANCH');
    expect(mgr.company).toMatchObject({ total: 10, saudis: 3, documentedSaudis: 2, undocumentedSaudis: 1, officialRate: 20 });
    expect(mgr.branches.map((b: { branchId: string }) => b.branchId)).toEqual([branchId]);
    expect(mgr.undocumented.map((e: { id: string }) => e.id)).toEqual([ids[7]]);
    const dash = (await http.get('/api/dashboard').set(auth(managerToken)).expect(200)).body;
    expect(dash).toMatchObject({ saudizationRate: mgr.company.officialRate, nitaqatBand: mgr.company.band });
    const sim = (await http.get('/api/saudization/simulate').set(auth(managerToken)).expect(200)).body;
    expect(sim.before).toMatchObject({ total: 10, saudis: 2 });
  });
});
