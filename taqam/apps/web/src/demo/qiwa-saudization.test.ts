import { describe, expect, it } from 'vitest';
import { demoFetch } from './client';
import { DB_VERSION } from './db';

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const call = async (method: string, path: string, token: string | null, body?: unknown, query?: Record<string, unknown>) =>
  (await demoFetch(method, path, { token, body, query })) as { status: number; data: Body };
const login = async (email: string) => (await call('POST', '/auth/login', null, { email, password: 'Shuoon@2026' })).data;

/** Qiwa-documented Saudization — mock parity with the API (spec §1). */
describe('demo mock: Qiwa-documented Saudization', () => {
  it('bumps the demo DB version for the new employee fields', () => {
    expect(DB_VERSION).toBeGreaterThanOrEqual(9);
  });

  it('seeds 2 undocumented active Saudis (others documented) so the demo shows the alert', async () => {
    const owner = await login('owner@shuoon.demo');
    const list = await call('GET', '/employees', owner.accessToken, undefined, { pageSize: 100 });
    const rows = list.data.data as Body[];
    expect(rows.every((e) => typeof e.qiwaDocumented === 'boolean' && 'qiwaDocumentedAt' in e)).toBe(true);
    const undocumented = rows.filter((e) => e.isSaudi && e.status !== 'TERMINATED' && !e.qiwaDocumented);
    expect(undocumented).toHaveLength(2);
    expect(undocumented.every((e) => e.qiwaDocumentedAt === null)).toBe(true);

    const s = await call('GET', '/saudization', owner.accessToken);
    expect(s.status).toBe(200);
    const c = s.data.company;
    expect(c.undocumentedSaudis).toBe(2);
    expect(c.documentedSaudis).toBe(c.saudis - 2);
    expect(c.officialRate).toBeLessThan(c.internalRate);
    expect(c.rate).toBe(c.officialRate);
    expect(c.alert).toBe(true);
    expect(typeof c.marginToDrop).toBe('number');
    expect((s.data.undocumented as Body[]).map((e) => e.id).sort()).toEqual(undocumented.map((e) => e.id).sort());
    for (const b of s.data.branches as Body[]) {
      for (const k of ['officialRate', 'internalRate', 'documentedSaudis', 'undocumentedSaudis', 'marginToDrop', 'rate']) expect(Number.isFinite(b[k])).toBe(true);
      expect(typeof b.alert).toBe('boolean');
      expect(b.rate).toBe(b.officialRate);
    }
  });

  it('dashboard and branches use the same official rate and band as /saudization', async () => {
    const owner = await login('owner@shuoon.demo');
    const sz = (await call('GET', '/saudization', owner.accessToken)).data;
    const dash = (await call('GET', '/dashboard', owner.accessToken)).data;
    expect(dash).toMatchObject({
      saudizationRate: sz.company.officialRate, internalSaudizationRate: sz.company.internalRate, nitaqatBand: sz.company.band,
      documentedSaudis: sz.company.documentedSaudis, saudis: sz.company.saudis,
    });
    const branches = (await call('GET', '/branches', owner.accessToken)).data as Body[];
    for (const b of sz.branches as Body[]) {
      const br = branches.find((x) => x.id === b.branchId)!;
      expect(br).toMatchObject({ saudizationRate: b.officialRate, internalSaudizationRate: b.internalRate, nitaqatBand: b.band, documentedSaudis: b.documentedSaudis, saudis: b.saudis });
      const hb = (dash.headcountByBranch as Body[]).find((x) => x.branchId === b.branchId)!;
      expect(hb).toMatchObject({ saudizationRate: b.officialRate, internalSaudizationRate: b.internalRate, documentedSaudis: b.documentedSaudis });
    }
    // at least one seeded branch differs between internal and official, so the test can tell them apart
    expect((sz.branches as Body[]).some((b) => b.officialRate !== b.internalRate)).toBe(true);
  });

  it('BRANCH_MANAGER sees their own branch figures and only their branch\'s undocumented Saudis', async () => {
    const owner = await login('owner@shuoon.demo');
    const all = (await call('GET', '/saudization', owner.accessToken)).data;
    expect(all.scope).toBe('COMPANY');
    const mgr = await login('manager@shuoon.demo');
    const s = (await call('GET', '/saudization', mgr.accessToken)).data;
    expect(s.scope).toBe('BRANCH');
    expect(s.branches).toHaveLength(1);
    const own = (all.branches as Body[]).find((b) => b.branchId === s.branches[0].branchId)!;
    expect(s.company).toMatchObject({ total: own.total, saudis: own.saudis, documentedSaudis: own.documentedSaudis, officialRate: own.officialRate, band: own.band });
    expect((s.undocumented as Body[]).length).toBeGreaterThan(0);
    expect((s.undocumented as Body[]).every((e) => e.branchId === own.branchId)).toBe(true);
    expect((s.undocumented as Body[]).length).toBeLessThan((all.undocumented as Body[]).length);
    const dash = (await call('GET', '/dashboard', mgr.accessToken)).data;
    expect(dash).toMatchObject({ saudizationRate: s.company.officialRate, nitaqatBand: s.company.band });
    const sim = (await call('GET', '/saudization/simulate', mgr.accessToken, undefined, { addSaudis: 0 })).data;
    expect(sim.before).toMatchObject({ total: own.total, saudis: own.documentedSaudis });
  });

  it('PATCH qiwaDocumented null → 400; qiwaDocumented filter implies Saudis (NON_SA ⇒ empty)', async () => {
    const owner = await login('owner@shuoon.demo');
    const any = (await call('GET', '/employees', owner.accessToken, undefined, { pageSize: 1 })).data.data[0];
    const r = await call('PATCH', `/employees/${any.id}`, owner.accessToken, { qiwaDocumented: null });
    expect(r.status).toBe(400);
    const empty = await call('GET', '/employees', owner.accessToken, undefined, { qiwaDocumented: 'false', nationality: 'NON_SA' });
    expect(empty.data).toMatchObject({ data: [], total: 0 });
  });

  it('POST /employees/qiwa-documented: BRANCH_MANAGER → 403, bad body → 400, OWNER flips own ids only', async () => {
    const owner = await login('owner@shuoon.demo');
    const before = (await call('GET', '/saudization', owner.accessToken)).data;
    const ids = (before.undocumented as Body[]).map((e) => e.id);

    const mgr = await login('manager@shuoon.demo');
    expect((await call('POST', '/employees/qiwa-documented', mgr.accessToken, { employeeIds: ids, documented: true })).status).toBe(403);
    expect((await call('POST', '/employees/qiwa-documented', owner.accessToken, { employeeIds: 'x', documented: 'yes' })).status).toBe(400);
    expect((await call('POST', '/employees/qiwa-documented', owner.accessToken, { employeeIds: [], documented: true })).status).toBe(400);

    const res = await call('POST', '/employees/qiwa-documented', owner.accessToken, { employeeIds: [...ids, 'emp-of-another-company'], documented: true });
    expect(res.status).toBe(201);
    expect(res.data).toEqual({ updated: 2 });
    const after = (await call('GET', '/saudization', owner.accessToken)).data;
    expect(after.company).toMatchObject({ undocumentedSaudis: 0, officialRate: before.company.internalRate, internalRate: before.company.internalRate });
    expect(after.undocumented).toEqual([]);
    const d = await call('GET', `/employees/${ids[0]}`, owner.accessToken);
    expect(d.data.qiwaDocumented).toBe(true);
    expect(d.data.qiwaDocumentedAt).toBeTruthy();

    // re-confirming changes nothing; undoing clears the date
    expect((await call('POST', '/employees/qiwa-documented', owner.accessToken, { employeeIds: [ids[0]], documented: true })).data).toEqual({ updated: 0 });
    expect((await call('POST', '/employees/qiwa-documented', owner.accessToken, { employeeIds: [ids[0]], documented: false })).data).toEqual({ updated: 1 });
    expect((await call('GET', `/employees/${ids[0]}`, owner.accessToken)).data).toMatchObject({ qiwaDocumented: false, qiwaDocumentedAt: null });
  });

  it('employee create/patch: qiwaDocumented sets the date server-side; re-confirm keeps it; false clears it; GET ?qiwaDocumented=false filters', async () => {
    const owner = await login('owner@shuoon.demo');
    const created = await call('POST', '/employees', owner.accessToken, {
      firstNameAr: 'فيصل', lastNameAr: 'قوى', nationality: 'SA', gender: 'MALE', nationalId: '1034567890', hireDate: '2026-05-01', basicSalary: 6000, qiwaDocumented: true,
    });
    expect(created.status).toBe(201);
    expect(created.data.qiwaDocumented).toBe(true);
    const at = created.data.qiwaDocumentedAt;
    expect(at).toBeTruthy();
    const plain = await call('POST', '/employees', owner.accessToken, {
      firstNameAr: 'سعد', lastNameAr: 'قوى', nationality: 'SA', gender: 'MALE', nationalId: '1034567891', hireDate: '2026-05-01', basicSalary: 6000,
    });
    expect(plain.data).toMatchObject({ qiwaDocumented: false, qiwaDocumentedAt: null });
    expect((await call('PATCH', `/employees/${plain.data.id}`, owner.accessToken, { qiwaDocumented: 'yes' })).status).toBe(400);

    const again = await call('PATCH', `/employees/${created.data.id}`, owner.accessToken, { qiwaDocumented: true });
    expect(again.data.qiwaDocumentedAt).toBe(at);
    const off = await call('PATCH', `/employees/${created.data.id}`, owner.accessToken, { qiwaDocumented: false });
    expect(off.data).toMatchObject({ qiwaDocumented: false, qiwaDocumentedAt: null });

    const filtered = await call('GET', '/employees', owner.accessToken, undefined, { qiwaDocumented: 'false', pageSize: 100 });
    const rows = filtered.data.data as Body[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((e) => e.isSaudi && !e.qiwaDocumented)).toBe(true);
    expect(rows.map((e) => e.id)).toEqual(expect.arrayContaining([created.data.id, plain.data.id]));
  });

  it('the simulator starts from the official (documented) count', async () => {
    const owner = await login('owner@shuoon.demo');
    const s = (await call('GET', '/saudization', owner.accessToken)).data;
    const sim = await call('GET', '/saudization/simulate', owner.accessToken, undefined, { addSaudis: 0, addNonSaudis: 0 });
    expect(sim.data.before).toMatchObject({ total: s.company.total, saudis: s.company.documentedSaudis, rate: s.company.officialRate, band: s.company.band });
  });
});
