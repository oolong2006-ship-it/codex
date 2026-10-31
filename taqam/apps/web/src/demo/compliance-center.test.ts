import { beforeEach, describe, expect, it } from 'vitest';
import { complianceDocCounts } from '@taqam/core';
import { demoFetch, resetDemoData } from './client';
import { DB_VERSION } from './db';
import { addMonths, periodRange, todayStr } from './dates';

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const call = async (method: string, path: string, token: string | null, body?: unknown, query?: Record<string, unknown>) =>
  (await demoFetch(method, path, { token, body, query })) as { status: number; data: Body };
const login = async (email: string) => (await call('POST', '/auth/login', null, { email, password: 'Shuoon@2026' })).data.accessToken as string;
const get = async (path: string, token: string, query?: Record<string, unknown>) => {
  const r = await call('GET', path, token, undefined, query);
  expect(r.status).toBe(200);
  return r.data;
};
const today = todayStr();
const thisPeriod = today.slice(0, 7);
const prevPeriod = addMonths(thisPeriod, -1);
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Compliance center — mock parity with the API (spec §5). */
describe('demo mock: compliance center', () => {
  beforeEach(() => resetDemoData());

  it('bumps the demo DB version for Company.expatLevyMonthly / iqamaFeeAnnual', () => {
    expect(DB_VERSION).toBeGreaterThanOrEqual(12);
  });

  it('overview: risk built from saudization, WPS and documents; iqamas not double counted', async () => {
    const owner = await login('owner@shuoon.demo');
    const o = await get('/compliance/overview', owner);
    expect(Object.keys(o).sort()).toEqual(['documents', 'risk', 'saudization', 'scope', 'wps']);
    expect(o.scope).toBe('COMPANY');
    const items = o.risk.items as Body[];
    const rank = { HIGH: 2, MEDIUM: 1, LOW: 0 } as Record<string, number>;
    expect(o.risk.level).toBe(items.length ? items[0].level : 'LOW');
    expect(items.map((i) => rank[i.level])).toEqual([...items.map((i) => rank[i.level])].sort((a, b) => b - a));
    // meaningful demo: undocumented Saudis (MEDIUM) and missing health certificates (MEDIUM)
    expect(o.saudization.undocumentedSaudis).toBeGreaterThan(0);
    expect(items.find((i) => i.key === 'UNDOCUMENTED_SAUDIS')).toMatchObject({ level: 'MEDIUM', count: o.saudization.undocumentedSaudis, href: '/app/saudization' });
    expect(items.find((i) => i.key === 'DOCS_MISSING')).toMatchObject({ level: 'MEDIUM' });
    // documents = Task 4 counts + the split the risk uses (same rows)
    const docs = await get('/documents/compliance', owner);
    expect(o.documents).toEqual({ ...docs.counts, ...complianceDocCounts(docs.items) });
    expect(o.documents.EXPIRED).toBe(o.documents.expiredIqamas + o.documents.docsExpired);
    for (const i of items) expect(typeof i.titleAr).toBe('string');
  });

  it('WPS: previous month not exported is HIGH from the 10th; exporting clears it', async () => {
    const owner = await login('owner@shuoon.demo');
    let o = await get('/compliance/overview', owner);
    expect(o.wps).toMatchObject({ prevPeriod, due: true, exported: false, exportedAt: null, latestRunPeriod: prevPeriod });
    const check = await get(`/payroll/runs/${o.wps.latestRunId}/wps-check`, owner);
    expect(o.wps.errors).toBe(check.errors);
    const wpsItem = (o.risk.items as Body[]).find((i) => i.key === 'WPS_NOT_EXPORTED');
    if (Number(today.slice(8, 10)) >= 10) expect(wpsItem).toMatchObject({ level: 'HIGH', count: 1, href: '/app/payroll' });
    else expect(wpsItem).toBeUndefined();
    await get(`/payroll/runs/${o.wps.latestRunId}/wps`, owner);
    o = await get('/compliance/overview', owner);
    expect(o.wps.exported).toBe(true);
    expect((o.risk.items as Body[]).some((i) => i.key === 'WPS_NOT_EXPORTED')).toBe(false);
  });

  it('branch costs: payslips of the period run (estimated:false), else contract salaries; totals add up', async () => {
    const owner = await login('owner@shuoon.demo');
    const c = await get('/compliance/branch-costs', owner, { period: prevPeriod });
    expect(c).toMatchObject({ period: prevPeriod, estimated: false, fees: { expatLevyMonthly: 800, iqamaFeeAnnual: 650 } });
    const runs = (await get('/payroll/runs', owner)) as Body[];
    const run = await get(`/payroll/runs/${runs.find((r) => r.period === prevPeriod)!.id}`, owner);
    expect(c.runId).toBe(run.id);
    expect(c.totals.headcount).toBe(run.payslips.length);
    expect(c.totals.gross).toBe(r2((run.payslips as Body[]).reduce((s, p) => s + p.gross, 0)));
    expect(c.totals.gosiEmployer).toBe(r2((run.payslips as Body[]).reduce((s, p) => s + p.gosiEmployer, 0)));
    expect(c.branches.length).toBeGreaterThan(1);
    for (const b of c.branches as Body[]) {
      expect(typeof b.branchName).toBe('string');
      expect(b.total).toBe(r2(b.gross + b.gosiEmployer + b.govFees));
      expect(Number.isFinite(b.perEmployee)).toBe(true);
    }
    expect(c.totals.total).toBe(r2((c.branches as Body[]).reduce((s, b) => s + b.total, 0)));

    // the current month has no run: estimated from contracts; staff terminated before the period excluded
    const est = await get('/compliance/branch-costs', owner, { period: thisPeriod });
    expect(est).toMatchObject({ period: thisPeriod, estimated: true, runId: null });
    const { start, end } = periodRange(thisPeriod);
    const emps = (await get('/employees', owner, { pageSize: 500, status: 'ALL' })).data as Body[];
    const employed = emps.filter((e) => e.hireDate <= end && (e.terminationDate ? e.terminationDate >= start : e.status !== 'TERMINATED'));
    expect(est.totals.headcount).toBe(employed.length);
    expect(est.totals.saudis).toBe(employed.filter((e) => e.isSaudi).length);
    // no period → the current month
    expect((await get('/compliance/branch-costs', owner)).period).toBe(thisPeriod);
    expect((await call('GET', '/compliance/branch-costs', owner, undefined, { period: '2026-13' })).status).toBe(400);
  });

  it('fees are company settings (PATCH /company, validated)', async () => {
    const owner = await login('owner@shuoon.demo');
    expect((await call('PATCH', '/company', owner, { expatLevyMonthly: -1 })).status).toBe(400);
    // more than 2 decimals is refused like the API (@IsNumber({ maxDecimalPlaces: 2 }))
    expect((await call('PATCH', '/company', owner, { iqamaFeeAnnual: 650.123 })).status).toBe(400);
    expect((await call('PATCH', '/company', owner, { iqamaFeeAnnual: 650.12 })).status).toBe(200);
    const res = await call('PATCH', '/company', owner, { expatLevyMonthly: 1000, iqamaFeeAnnual: 1200 });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ expatLevyMonthly: 1000, iqamaFeeAnnual: 1200 });
    const c = await get('/compliance/branch-costs', owner, { period: prevPeriod });
    expect(c.fees).toEqual({ expatLevyMonthly: 1000, iqamaFeeAnnual: 1200 });
    const expats = c.totals.headcount - c.totals.saudis;
    expect(c.totals.govFees).toBe(r2(expats * 1100));
  });

  it('BRANCH_MANAGER: own branch only and no WPS; PAYROLL reads; EMPLOYEE 403', async () => {
    const mgr = await login('manager@shuoon.demo');
    const c = await get('/compliance/branch-costs', mgr, { period: prevPeriod });
    expect(c.branches).toHaveLength(1);
    const o = await get('/compliance/overview', mgr);
    expect(o.wps).toBeNull();
    expect(o.scope).toBe('BRANCH');
    expect((o.risk.items as Body[]).some((i) => i.key.startsWith('WPS'))).toBe(false);
    const payroll = await login('payroll@shuoon.demo');
    await get('/compliance/overview', payroll);
    expect((await get('/compliance/branch-costs', payroll)).branches.length).toBeGreaterThan(1);
    const emp = await login('employee@shuoon.demo');
    expect((await call('GET', '/compliance/overview', emp)).status).toBe(403);
    expect((await call('GET', '/compliance/branch-costs', emp)).status).toBe(403);
  });

  it('a company registered this month owes no WPS file for last month (even with staff hired earlier)', async () => {
    const admin = await login('admin@shuoon.demo');
    expect((await call('PATCH', '/admin/settings', admin, { requireApproval: false })).status).toBe(200);
    const reg = await call('POST', '/auth/register', null, { companyNameAr: 'شركة جديدة', sector: 'RETAIL', ownerName: 'مالك جديد', email: 'new-cc@test.sa', password: 'Passw0rd!' });
    expect(reg.status).toBeLessThan(300);
    const token = reg.data.accessToken as string;
    const emp = await call('POST', '/employees', token, { firstNameAr: 'سالم', lastNameAr: 'الجديد', gender: 'MALE', nationality: 'SA', nationalId: '1098765432', hireDate: '2024-01-01', basicSalary: 5000 });
    expect(emp.status).toBe(201);
    const o = await get('/compliance/overview', token);
    expect(o.wps).toMatchObject({ prevPeriod, due: false, exported: false });
    expect((o.risk.items as Body[]).some((i) => i.key === 'WPS_NOT_EXPORTED')).toBe(false);
  });
});
