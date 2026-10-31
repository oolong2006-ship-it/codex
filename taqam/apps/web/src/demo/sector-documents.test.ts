import { beforeEach, describe, expect, it } from 'vitest';
import { demoFetch, resetDemoData } from './client';
import { DB_VERSION } from './db';
import { addDays, todayStr } from './dates';

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const call = async (method: string, path: string, token: string | null, body?: unknown, query?: Record<string, unknown>) =>
  (await demoFetch(method, path, { token, body, query })) as { status: number; data: Body };
const login = async (email: string) => (await call('POST', '/auth/login', null, { email, password: 'Shuoon@2026' })).data;
const compliance = async (token: string) => {
  const r = await call('GET', '/documents/compliance', token);
  expect(r.status).toBe(200);
  return r.data as { items: Body[]; counts: Record<string, number> };
};

/** Sector documents compliance — mock parity with the API (spec §4). */
describe('demo mock: sector documents compliance', () => {
  beforeEach(() => resetDemoData());

  it('bumps the demo DB version for Employee.docExemptions and the new document types', () => {
    expect(DB_VERSION).toBeGreaterThanOrEqual(11);
  });

  it('restaurant demo: missing and expiring health certificates; office staff exempted; counts match items', async () => {
    const owner = await login('owner@shuoon.demo');
    const { items, counts } = await compliance(owner.accessToken);
    const hc = items.filter((i) => i.type === 'HEALTH_CERTIFICATE');
    expect(hc.filter((i) => i.status === 'MISSING')).toHaveLength(3);
    for (const s of ['EXPIRED', 'CRITICAL', 'WARNING']) expect(hc.some((i) => i.status === s)).toBe(true);
    expect(Object.keys(counts).sort()).toEqual(['CRITICAL', 'EXPIRED', 'MISSING', 'WARNING']);
    for (const s of Object.keys(counts)) expect(counts[s]).toBe(items.filter((i) => i.status === s).length);
    for (const i of items) {
      expect(typeof i.employeeId).toBe('string');
      expect(typeof i.employeeName).toBe('string');
      expect('branchName' in i).toBe(true);
    }
    // worst first
    const rank = { MISSING: 0, EXPIRED: 1, CRITICAL: 2, WARNING: 3 } as Record<string, number>;
    expect(items.map((i) => rank[i.status])).toEqual([...items.map((i) => rank[i.status])].sort((a, b) => a - b));

    const emps = (await call('GET', '/employees', owner.accessToken, undefined, { pageSize: 100 })).data.data as Body[];
    expect(emps.every((e) => Array.isArray(e.docExemptions))).toBe(true);
    const exempt = emps.filter((e) => e.docExemptions.includes('HEALTH_CERTIFICATE'));
    expect(exempt.length).toBeGreaterThan(0);
    const listed = new Set(items.filter((i) => i.type === 'HEALTH_CERTIFICATE').map((i) => i.employeeId));
    expect(exempt.some((e) => listed.has(e.id))).toBe(false);
    const terminated = emps.filter((e) => e.status === 'TERMINATED').map((e) => e.id);
    expect(items.some((i) => terminated.includes(i.employeeId))).toBe(false);
  });

  it('BRANCH_MANAGER sees only own branch; PAYROLL and EMPLOYEE get 403', async () => {
    const owner = await login('owner@shuoon.demo');
    const mgr = await login('manager@shuoon.demo');
    const all = await compliance(owner.accessToken);
    const mine = await compliance(mgr.accessToken);
    expect(mine.items.length).toBeGreaterThan(0);
    expect(mine.items.length).toBeLessThan(all.items.length);
    expect(new Set(mine.items.map((i) => i.branchName)).size).toBe(1);
    expect(mine.items.some((i) => i.type === 'HEALTH_CERTIFICATE' && i.status === 'MISSING')).toBe(true);
    for (const email of ['payroll@shuoon.demo', 'employee@shuoon.demo']) {
      const u = await login(email);
      expect((await call('GET', '/documents/compliance', u.accessToken)).status).toBe(403);
    }
  });

  it('adding a HEALTH_CERTIFICATE clears the missing item; all four new types are accepted', async () => {
    const owner = await login('owner@shuoon.demo');
    const before = await compliance(owner.accessToken);
    const missing = before.items.find((i) => i.type === 'HEALTH_CERTIFICATE' && i.status === 'MISSING')!;
    const res = await call('POST', `/employees/${missing.employeeId}/documents`, owner.accessToken, { type: 'HEALTH_CERTIFICATE', number: 'HC-9', expiryDate: addDays(todayStr(), 200) });
    expect(res.status).toBe(201);
    expect(res.data).toMatchObject({ type: 'HEALTH_CERTIFICATE', status: 'OK' });
    const after = await compliance(owner.accessToken);
    expect(after.items.some((i) => i.employeeId === missing.employeeId && i.type === 'HEALTH_CERTIFICATE')).toBe(false);
    expect(after.counts.MISSING).toBe(before.counts.MISSING - 1);
    for (const type of ['PROFESSIONAL_LICENSE', 'DRIVER_CARD', 'DRIVING_LICENSE']) {
      expect((await call('POST', `/employees/${missing.employeeId}/documents`, owner.accessToken, { type })).status).toBe(201);
    }
    expect((await call('POST', `/employees/${missing.employeeId}/documents`, owner.accessToken, { type: 'NOPE' })).status).toBe(400);
  });

  it('PATCH /employees/:id docExemptions: validated, removes the requirement, round-trips on detail', async () => {
    const owner = await login('owner@shuoon.demo');
    const before = await compliance(owner.accessToken);
    const missing = before.items.find((i) => i.type === 'HEALTH_CERTIFICATE' && i.status === 'MISSING')!;
    expect((await call('PATCH', `/employees/${missing.employeeId}`, owner.accessToken, { docExemptions: ['NOT_A_TYPE'] })).status).toBe(400);
    expect((await call('PATCH', `/employees/${missing.employeeId}`, owner.accessToken, { docExemptions: null })).status).toBe(400);
    const res = await call('PATCH', `/employees/${missing.employeeId}`, owner.accessToken, { docExemptions: ['HEALTH_CERTIFICATE', 'HEALTH_CERTIFICATE'] });
    expect(res.status).toBe(200);
    expect(res.data.docExemptions).toEqual(['HEALTH_CERTIFICATE']);
    const after = await compliance(owner.accessToken);
    expect(after.items.some((i) => i.employeeId === missing.employeeId && i.type === 'HEALTH_CERTIFICATE')).toBe(false);
    const detail = await call('GET', `/employees/${missing.employeeId}`, owner.accessToken);
    expect(detail.data.docExemptions).toEqual(['HEALTH_CERTIFICATE']);
  });

  it('an expat onboarded through the form (idExpiry on the profile, no IQAMA document) is not reported missing an iqama', async () => {
    const owner = await login('owner@shuoon.demo');
    const res = await call('POST', '/employees', owner.accessToken, {
      firstNameAr: 'وافد', lastNameAr: 'النموذج', nationality: 'IN', gender: 'MALE', nationalId: '2098765432', hireDate: todayStr(), basicSalary: 3000,
      idExpiry: addDays(todayStr(), 200),
    });
    expect(res.status).toBe(201);
    const id = res.data.id as string;
    expect((await compliance(owner.accessToken)).items.some((i) => i.employeeId === id && i.type === 'IQAMA')).toBe(false);
    expect((await call('PATCH', `/employees/${id}`, owner.accessToken, { idExpiry: addDays(todayStr(), 10) })).status).toBe(200);
    expect((await compliance(owner.accessToken)).items).toContainEqual(expect.objectContaining({ employeeId: id, type: 'IQAMA', status: 'CRITICAL' }));
  });

  it('a newly created employee starts with no exemptions (and appears as missing a health certificate)', async () => {
    const owner = await login('owner@shuoon.demo');
    const res = await call('POST', '/employees', owner.accessToken, {
      firstNameAr: 'جديد', lastNameAr: 'المطبخ', nationality: 'SA', gender: 'MALE', nationalId: '1098765432', hireDate: todayStr(), basicSalary: 4000,
    });
    expect(res.status).toBe(201);
    expect(res.data.docExemptions).toEqual([]);
    const { items } = await compliance(owner.accessToken);
    expect(items).toContainEqual(expect.objectContaining({ employeeId: res.data.id, type: 'HEALTH_CERTIFICATE', status: 'MISSING' }));
  });
});
