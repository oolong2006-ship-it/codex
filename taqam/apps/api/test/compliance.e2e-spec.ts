import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { addDays, addMonths, dayStr, todayStr } from '../src/common/dates';

/** Valid Saudi IBAN for a bank code + 18-digit account (mod-97). */
function iban(bank: string, account: string) {
  const bban = bank + account;
  let rem = 0;
  for (const ch of bban + '281000') rem = (rem * 10 + Number(ch)) % 97;
  return `SA${String(98 - rem).padStart(2, '0')}${bban}`;
}

type RiskItem = { key: string; level: string; count: number; titleAr: string; href: string };
type Overview = {
  scope: 'COMPANY' | 'BRANCH';
  risk: { level: string; items: RiskItem[] };
  saudization: { total: number; saudis: number; documentedSaudis: number; undocumentedSaudis: number; officialRate: number; band: string; marginToDrop: number };
  wps: { prevPeriod: string; due: boolean; exported: boolean; exportedAt: string | null; latestRunId: string | null; latestRunPeriod: string | null; errors: number } | null;
  documents: Record<string, number>;
};
type BranchRow = { branchId: string | null; branchName: string | null; headcount: number; saudis: number; gross: number; gosiEmployer: number; govFees: number; total: number; perEmployee: number };
type Costs = { period: string; estimated: boolean; runId: string | null; fees: { expatLevyMonthly: number; iqamaFeeAnnual: number }; branches: BranchRow[]; totals: Omit<BranchRow, 'branchId' | 'branchName'> };

/** Compliance center — spec §5 (government-services risk + true labor cost per branch). */
describe('Compliance center (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const stamp = Date.now();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const today = todayStr();
  const dayOfMonth = Number(today.slice(8, 10));
  const thisPeriod = today.slice(0, 7);
  const prevPeriod = addMonths(thisPeriod, -1);
  const inDays = (n: number) => dayStr(addDays(today, n))!;
  let ownerToken = '';
  let managerToken = '';
  let payrollToken = '';
  let employeeToken = '';
  let emptyToken = '';
  let branchA = '';
  let branchB = '';
  let runId = '';
  const emp: Record<string, string> = {};

  const create = async (key: string, n: number, extra: Record<string, unknown>) => {
    emp[key] = (
      await http
        .post('/api/employees')
        .set(auth(ownerToken))
        .send({
          firstNameAr: `موظف${n}`,
          lastNameAr: 'الامتثال',
          gender: 'MALE',
          nationality: 'SA',
          nationalId: `1${String(stamp).slice(-7)}${String(n).padStart(2, '0')}`,
          hireDate: '2024-01-01',
          iban: iban('10', `${String(stamp).slice(-6)}0000000000${String(n).padStart(2, '0')}`),
          docExemptions: ['HEALTH_CERTIFICATE'],
          ...extra,
        })
        .expect(201)
    ).body.id;
  };
  const overview = async (token = ownerToken) => (await http.get('/api/compliance/overview').set(auth(token)).expect(200)).body as Overview;
  const costs = async (period: string, token = ownerToken) =>
    (await http.get(`/api/compliance/branch-costs?period=${period}`).set(auth(token)).expect(200)).body as Costs;
  const item = (o: Overview, key: string) => o.risk.items.find((i) => i.key === key);
  const login = async (email: string) => (await http.post('/api/auth/login').send({ email, password: 'Passw0rd!' }).expect(200)).body.accessToken as string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication(), { swagger: false });
    await app.init();
    http = request(app.getHttpServer());
    await app.get(PrismaService).platformSettings.upsert({ where: { id: 1 }, update: { requireApproval: false }, create: { id: 1, requireApproval: false } });

    const register = async (prefix: string) =>
      (await http
        .post('/api/auth/register')
        .send({ companyNameAr: `شركة ${prefix}`, sector: 'RESTAURANTS', ownerName: 'مالك', email: `${prefix}${stamp}@test.sa`, password: 'Passw0rd!' })
        .expect(201)).body.accessToken as string;
    ownerToken = await register('ccowner');
    emptyToken = await register('ccempty');
    // the main company has existed for a long time (a company registered this month owes no WPS file for last month)
    const companyId = (await http.get('/api/company').set(auth(ownerToken)).expect(200)).body.id;
    await app.get(PrismaService).company.update({ where: { id: companyId }, data: { createdAt: new Date('2024-01-01T00:00:00Z') } });
    branchA = (await http.post('/api/branches').set(auth(ownerToken)).send({ nameAr: 'فرع العليا', city: 'الرياض', lat: 24.7, lng: 46.7 }).expect(201)).body.id;
    branchB = (await http.post('/api/branches').set(auth(ownerToken)).send({ nameAr: 'فرع جدة', city: 'جدة', lat: 21.5, lng: 39.2 }).expect(201)).body.id;

    // branch A: undocumented Saudi, documented Saudi, expat whose iqama expired; branch B: expat without IBAN (WPS error)
    await create('undoc', 1, { branchId: branchA, basicSalary: 8000, housingAllowance: 2000 });
    await create('doc', 2, { branchId: branchA, basicSalary: 6000, housingAllowance: 1500, qiwaDocumented: true });
    await create('expatA', 3, { branchId: branchA, nationality: 'EG', nationalId: `2${String(stamp).slice(-7)}03`, basicSalary: 3000, idExpiry: inDays(-5) });
    await create('expatB', 4, { branchId: branchB, nationality: 'IN', nationalId: `2${String(stamp).slice(-7)}04`, basicSalary: 2500, idExpiry: inDays(200), iban: null });
    // one restaurant worker without the health certificate (a missing sector document)
    await create('cook', 5, { branchId: branchB, basicSalary: 4000, docExemptions: [], qiwaDocumented: true });
    // terminated before both periods: excluded from headcount, cost and saudization
    await create('gone', 6, { branchId: branchA, basicSalary: 9000 });
    await http.post(`/api/employees/${emp.gone}/terminate`).set(auth(ownerToken)).send({ terminationDate: dayStr(addDays(`${prevPeriod}-01`, -20)), reason: 'RESIGNATION' }).expect(201);

    await http.post('/api/users').set(auth(ownerToken))
      .send({ name: 'مدير العليا', email: `ccmgr${stamp}@test.sa`, password: 'Passw0rd!', role: 'BRANCH_MANAGER', employeeId: emp.doc }).expect(201);
    managerToken = await login(`ccmgr${stamp}@test.sa`);
    await http.post('/api/users').set(auth(ownerToken))
      .send({ name: 'الرواتب', email: `ccpay${stamp}@test.sa`, password: 'Passw0rd!', role: 'PAYROLL' }).expect(201);
    payrollToken = await login(`ccpay${stamp}@test.sa`);
    await http.post('/api/users').set(auth(ownerToken))
      .send({ name: 'موظف', email: `ccemp${stamp}@test.sa`, password: 'Passw0rd!', role: 'EMPLOYEE', employeeId: emp.cook }).expect(201);
    employeeToken = await login(`ccemp${stamp}@test.sa`);
  });

  afterAll(async () => {
    await app.get(PrismaService).$disconnect();
    await app.close();
  });

  it('overview reflects the undocumented Saudi and the expired iqama; the iqama is not also counted as an expired document', async () => {
    const o = await overview();
    expect(o.scope).toBe('COMPANY');
    expect(o.saudization).toMatchObject({ total: 5, saudis: 3, documentedSaudis: 2, undocumentedSaudis: 1, officialRate: 40, band: 'PLATINUM' });
    expect(item(o, 'UNDOCUMENTED_SAUDIS')).toMatchObject({ level: 'MEDIUM', count: 1, titleAr: 'سعوديون غير موثقة عقودهم في قوى', href: '/app/saudization' });
    expect(item(o, 'IQAMA_EXPIRED')).toMatchObject({ level: 'HIGH', count: 1, href: '/app/documents' });
    expect(item(o, 'DOCS_EXPIRED')).toBeUndefined();
    expect(item(o, 'DOCS_MISSING')).toMatchObject({ level: 'MEDIUM', count: 1 });
    // Task 4 counts (iqama included) next to the split used by the risk
    expect(o.documents).toEqual({ MISSING: 1, EXPIRED: 1, CRITICAL: 0, WARNING: 0, expiredIqamas: 1, iqamasExpiring30: 0, docsExpired: 0, docsMissing: 1 });
    expect(o.risk.level).toBe('HIGH');
    expect(o.risk.items[0].level).toBe('HIGH');
  });

  it('previous month without an exported WPS file is HIGH from the 10th; no run yet → no WPS errors', async () => {
    const o = await overview();
    expect(o.wps).toEqual({ prevPeriod, due: true, exported: false, exportedAt: null, latestRunId: null, latestRunPeriod: null, errors: 0 });
    if (dayOfMonth >= 10) expect(item(o, 'WPS_NOT_EXPORTED')).toMatchObject({ level: 'HIGH', count: 1, href: '/app/payroll' });
    else expect(item(o, 'WPS_NOT_EXPORTED')).toBeUndefined();
    expect(item(o, 'WPS_ERRORS')).toBeUndefined();
  });

  it('branch costs without a run are estimated from contract salaries; the terminated employee is excluded', async () => {
    const c = await costs(prevPeriod);
    expect(c).toMatchObject({ period: prevPeriod, estimated: true, runId: null, fees: { expatLevyMonthly: 800, iqamaFeeAnnual: 650 } });
    // A: 8000+2000, 6000+1500, 3000 · GOSI employer 11.75% Saudis (legacy), 2% expat · 1 expat × (800 + 650/12)
    expect(c.branches).toEqual([
      { branchId: branchA, branchName: 'فرع العليا', headcount: 3, saudis: 2, gross: 20500, gosiEmployer: 2116.25, govFees: 854.17, total: 23470.42, perEmployee: 7823.47 },
      { branchId: branchB, branchName: 'فرع جدة', headcount: 2, saudis: 1, gross: 6500, gosiEmployer: 520, govFees: 854.17, total: 7874.17, perEmployee: 3937.09 },
    ]);
    expect(c.totals).toEqual({ headcount: 5, saudis: 3, gross: 27000, gosiEmployer: 2636.25, govFees: 1708.34, total: 31344.59, perEmployee: 6268.92 });
  });

  it('fees come from company settings (PATCH /company, admins only)', async () => {
    await http.patch('/api/company').set(auth(ownerToken)).send({ expatLevyMonthly: -1 }).expect(400);
    await http.patch('/api/company').set(auth(payrollToken)).send({ expatLevyMonthly: 1000 }).expect(403);
    const res = await http.patch('/api/company').set(auth(ownerToken)).send({ expatLevyMonthly: 1000, iqamaFeeAnnual: 1200 }).expect(200);
    expect(res.body).toMatchObject({ expatLevyMonthly: 1000, iqamaFeeAnnual: 1200 });
    const c = await costs(prevPeriod);
    expect(c.fees).toEqual({ expatLevyMonthly: 1000, iqamaFeeAnnual: 1200 });
    expect(c.totals.govFees).toBe(2200);
    await http.patch('/api/company').set(auth(ownerToken)).send({ expatLevyMonthly: 800, iqamaFeeAnnual: 650 }).expect(200);
  });

  it('with the period run, branch costs come from its payslips (estimated:false)', async () => {
    runId = (await http.post('/api/payroll/runs').set(auth(ownerToken)).send({ period: prevPeriod }).expect(201)).body.id;
    // a DRAFT run has no payslips yet → still estimated
    expect((await costs(prevPeriod)).estimated).toBe(true);
    const run = (await http.post(`/api/payroll/runs/${runId}/calculate`).set(auth(ownerToken)).expect(200)).body as {
      payslips: { employee: { id: string; branchName: string | null }; gross: string | number; gosiEmployer: string | number }[];
    };
    expect(run.payslips.map((p) => p.employee.id)).not.toContain(emp.gone);
    // make one payslip differ from the contract so the source is visible
    await app.get(PrismaService).payslip.updateMany({ where: { payrollRunId: runId, employeeId: emp.cook }, data: { gross: 3900, gosiEmployer: 50 } });
    const c = await costs(prevPeriod);
    expect(c).toMatchObject({ estimated: false, runId });
    const sum = (branch: string, f: 'gross' | 'gosiEmployer') =>
      Math.round(run.payslips.filter((p) => p.employee.branchName === branch && p.employee.id !== emp.cook).reduce((s, p) => s + Number(p[f]), 0) * 100) / 100;
    const a = c.branches.find((b) => b.branchId === branchA)!;
    const b = c.branches.find((x) => x.branchId === branchB)!;
    expect(a).toMatchObject({ headcount: 3, saudis: 2, gross: sum('فرع العليا', 'gross'), gosiEmployer: sum('فرع العليا', 'gosiEmployer'), govFees: 854.17 });
    expect(b).toMatchObject({ headcount: 2, saudis: 1, gross: Math.round((sum('فرع جدة', 'gross') + 3900) * 100) / 100, gosiEmployer: Math.round((sum('فرع جدة', 'gosiEmployer') + 50) * 100) / 100 });
    expect(c.totals.headcount).toBe(5);
    // another period (no run) stays estimated
    expect((await costs(thisPeriod)).estimated).toBe(true);
  });

  it('latest run WPS errors are MEDIUM; exporting the previous month clears the HIGH item', async () => {
    const check = (await http.get(`/api/payroll/runs/${runId}/wps-check`).set(auth(ownerToken)).expect(200)).body as { errors: number };
    expect(check.errors).toBeGreaterThan(0);
    let o = await overview();
    expect(o.wps).toMatchObject({ prevPeriod, exported: false, latestRunId: runId, latestRunPeriod: prevPeriod, errors: check.errors });
    expect(item(o, 'WPS_ERRORS')).toMatchObject({ level: 'MEDIUM', count: check.errors });
    await http.get(`/api/payroll/runs/${runId}/wps`).set(auth(ownerToken)).expect(200);
    o = await overview();
    expect(o.wps).toMatchObject({ exported: true });
    expect(o.wps!.exportedAt).not.toBeNull();
    expect(item(o, 'WPS_NOT_EXPORTED')).toBeUndefined();
  });

  it('BRANCH_MANAGER gets only own branch (costs and overview); WPS is not shown to them', async () => {
    const c = await costs(prevPeriod, managerToken);
    expect(c.branches.map((b) => b.branchId)).toEqual([branchA]);
    expect(c.totals).toMatchObject({ headcount: 3, saudis: 2 });
    const o = await overview(managerToken);
    expect(o.saudization).toMatchObject({ total: 3, undocumentedSaudis: 1 });
    expect(o.documents).toMatchObject({ expiredIqamas: 1, docsMissing: 0 });
    expect(o.wps).toBeNull();
    expect(o.scope).toBe('BRANCH');
    expect(o.risk.items.some((i) => i.key.startsWith('WPS'))).toBe(false);
  });

  it('PAYROLL reads both; EMPLOYEE is refused; a bad period is 400', async () => {
    await overview(payrollToken);
    expect((await costs(prevPeriod, payrollToken)).branches).toHaveLength(2);
    await http.get('/api/compliance/overview').set(auth(employeeToken)).expect(403);
    await http.get(`/api/compliance/branch-costs?period=${prevPeriod}`).set(auth(employeeToken)).expect(403);
    await http.get('/api/compliance/branch-costs?period=2026-13').set(auth(ownerToken)).expect(400);
    await http.get('/api/compliance/branch-costs?period=abc').set(auth(ownerToken)).expect(400);
    // no period → the current month
    expect((await http.get('/api/compliance/branch-costs').set(auth(ownerToken)).expect(200)).body.period).toBe(thisPeriod);
  });

  it('a company with zero staff: LOW risk, no branches, zeros (never NaN)', async () => {
    const o = await overview(emptyToken);
    expect(o.risk).toEqual({ level: 'LOW', items: [] });
    expect(o.saudization).toMatchObject({ total: 0, officialRate: 0, marginToDrop: 0 });
    expect(o.wps).toMatchObject({ due: false, exported: false });
    const c = await costs(prevPeriod, emptyToken);
    expect(c).toMatchObject({ estimated: true, branches: [] });
    expect(c.totals).toEqual({ headcount: 0, saudis: 0, gross: 0, gosiEmployer: 0, govFees: 0, total: 0, perEmployee: 0 });
  });

  it('a company registered this month owes no WPS file for last month, even with staff hired earlier', async () => {
    await http
      .post('/api/employees')
      .set(auth(emptyToken))
      .send({ firstNameAr: 'سالم', lastNameAr: 'الجديد', gender: 'MALE', nationality: 'SA', nationalId: `1${String(stamp).slice(-7)}99`, hireDate: '2024-01-01', basicSalary: 5000 })
      .expect(201);
    const o = await overview(emptyToken);
    expect(o.wps).toMatchObject({ prevPeriod, due: false, exported: false });
    expect(item(o, 'WPS_NOT_EXPORTED')).toBeUndefined();
    expect(o.saudization.total).toBe(1);
  });
});
