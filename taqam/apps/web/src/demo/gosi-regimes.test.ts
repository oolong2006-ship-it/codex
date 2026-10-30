import { describe, expect, it } from 'vitest';
import { demoFetch } from './client';
import { DB_VERSION } from './db';

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const call = async (method: string, path: string, token: string | null, body?: unknown) =>
  (await demoFetch(method, path, { token, body })) as { status: number; data: Body };
const login = async (email: string) => (await call('POST', '/auth/login', null, { email, password: 'Shuoon@2026' })).data;

/** GOSI two regimes (new Social Insurance Law) — mock parity with the API (spec §3). */
describe('demo mock: GOSI two regimes', () => {
  it('bumps the demo DB version for the new employee field', () => {
    expect(DB_VERSION).toBe(8);
  });

  it('seeds 3 Saudi employees registered on/after 2024-07-03 (NEW regime); the rest stay LEGACY', async () => {
    const owner = await login('owner@shuoon.demo');
    const list = (await demoFetch('GET', '/employees', { token: owner.accessToken, query: { pageSize: 100 } })) as { data: Body };
    const rows = list.data.data as Body[];
    expect(rows.length).toBe(list.data.total);
    expect(rows.every((e) => 'gosiFirstRegisteredAt' in e)).toBe(true);
    const fresh = rows.filter((e) => e.gosiFirstRegisteredAt && e.gosiFirstRegisteredAt >= '2024-07-03');
    expect(fresh).toHaveLength(3);
    expect(fresh.every((e) => e.isSaudi)).toBe(true);
  });

  it('employee create/patch: stores the date, null clears it, a non-date → 400', async () => {
    const owner = await login('owner@shuoon.demo');
    const created = await call('POST', '/employees', owner.accessToken, {
      firstNameAr: 'خالد', lastNameAr: 'التأمينات', nationality: 'SA', gender: 'MALE', nationalId: '1012345678', hireDate: '2025-02-01',
      basicSalary: 10000, housingAllowance: 2500, gosiFirstRegisteredAt: '2025-01-10',
    });
    expect(created.status).toBe(201);
    expect(created.data.gosiFirstRegisteredAt).toBe('2025-01-10');
    const plain = await call('POST', '/employees', owner.accessToken, {
      firstNameAr: 'سالم', lastNameAr: 'القديم', nationality: 'SA', gender: 'MALE', nationalId: '1012345679', hireDate: '2020-02-01', basicSalary: 5000,
    });
    expect(plain.data.gosiFirstRegisteredAt).toBeNull();
    expect((await call('PATCH', `/employees/${plain.data.id}`, owner.accessToken, { gosiFirstRegisteredAt: 'not-a-date' })).status).toBe(400);
    const set = await call('PATCH', `/employees/${plain.data.id}`, owner.accessToken, { gosiFirstRegisteredAt: '2024-07-02' });
    expect(set.data.gosiFirstRegisteredAt).toBe('2024-07-02');
    const cleared = await call('PATCH', `/employees/${plain.data.id}`, owner.accessToken, { gosiFirstRegisteredAt: null });
    expect(cleared.data.gosiFirstRegisteredAt).toBeNull();
    const detail = await call('GET', `/employees/${created.data.id}`, owner.accessToken);
    expect(detail.data.gosiFirstRegisteredAt).toBe('2025-01-10');
  });

  it('mock payroll uses gosiRatesFor: NEW regime from 2028-07 pays 11.75% / 13.75%, LEGACY keeps 9.75% / 11.75%', async () => {
    const owner = await login('owner@shuoon.demo');
    const mk = async (nationalId: string, gosiFirstRegisteredAt: string | null) =>
      (await call('POST', '/employees', owner.accessToken, {
        firstNameAr: 'موظف', lastNameAr: 'الرواتب', nationality: 'SA', gender: 'MALE', nationalId, hireDate: '2020-01-01',
        basicSalary: 10000, housingAllowance: 2500, gosiFirstRegisteredAt,
      })).data.id as string;
    const newId = await mk('1023456781', '2025-01-10');
    const legacyId = await mk('1023456782', null);
    // a far-future period is never part of the (today-relative) seeded runs
    const run = await call('POST', '/payroll/runs', owner.accessToken, { period: '2030-07' });
    expect(run.status).toBe(201);
    const calc = await call('POST', `/payroll/runs/${run.data.id}/calculate`, owner.accessToken);
    expect(calc.status).toBe(200);
    const slip = (id: string) => (calc.data.payslips as Body[]).find((p) => p.employee.id === id)!;
    expect(slip(newId)).toMatchObject({ gosiEmployee: 1468.75, gosiEmployer: 1718.75 }); // 12,500 × 11.75% / 13.75%
    expect(slip(legacyId)).toMatchObject({ gosiEmployee: 1218.75, gosiEmployer: 1468.75 });
  });
});
