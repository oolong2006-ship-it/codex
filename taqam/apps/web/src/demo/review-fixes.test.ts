import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoFetch } from './client';
import { addDays, addMonths, riyadhDateTime, todayStr } from './dates';
import { toCsv } from './routes-more';

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const call = async (method: string, path: string, token: string | null, body?: unknown) =>
  (await demoFetch(method, path, { token, body })) as { status: number; data: Body };
const login = async (email: string) => (await call('POST', '/auth/login', null, { email, password: 'Shuoon@2026' })).data;

/** Fake only the clock; real setTimeout keeps demoFetch's latency sleep working. */
const freezeClock = (at: Date) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(at);
};

afterEach(() => vi.useRealTimers());

describe('demo mock mirrors the 2026-10-24 review fixes', () => {
  it('overnight shift: check-out after midnight closes the previous day record', async () => {
    const D = addDays(todayStr(), 2);
    const D1 = addDays(D, 1);
    const owner = await login('owner@shuoon.demo');
    const emp = await login('employee@shuoon.demo');
    const branchId = emp.user.branchId as string;
    const shift = await call('POST', '/shifts', owner.accessToken, { branchId, name: 'ليلية', startTime: '22:00', endTime: '06:00', breakMinutes: 0, graceMinutes: 10, days: [0, 1, 2, 3, 4, 5, 6] });
    expect(shift.status).toBe(201);
    expect((await call('PUT', '/roster', owner.accessToken, { assignments: [{ employeeId: emp.user.employeeId, shiftId: shift.data.id, date: D }] })).status).toBe(200);
    const home = await call('GET', '/me/home', emp.accessToken);
    const loc = { lat: home.data.branch.lat, lng: home.data.branch.lng };

    freezeClock(riyadhDateTime(D, '21:55'));
    const inRes = await call('POST', '/me/attendance/check-in', emp.accessToken, loc);
    expect(inRes.status).toBe(200);
    expect(inRes.data.date).toBe(D);

    freezeClock(riyadhDateTime(D1, '06:05'));
    const out = await call('POST', '/me/attendance/check-out', emp.accessToken, loc);
    expect(out.data).toMatchObject({ id: inRes.data.id, date: D, checkOut: riyadhDateTime(D1, '06:05').toISOString(), workedMinutes: 490 });
    expect(out.status).toBe(200);
  });

  it('PATCH {note} on an ABSENT attendance record keeps it ABSENT', async () => {
    const owner = await login('owner@shuoon.demo');
    const emp = await login('employee@shuoon.demo');
    const rec = await call('POST', '/attendance/manual', owner.accessToken, { employeeId: emp.user.employeeId, date: addDays(todayStr(), 5), status: 'ABSENT' });
    expect(rec.data.status).toBe('ABSENT');
    const res = await call('PATCH', `/attendance/${rec.data.id}`, owner.accessToken, { note: 'غياب بعذر طبي' });
    expect(res.data).toMatchObject({ status: 'ABSENT', note: 'غياب بعذر طبي', checkIn: null, checkOut: null });
    expect(res.status).toBe(200);
  });

  it('payroll approve only from CALCULATED; a second approve → 409', async () => {
    const payroll = await login('payroll@shuoon.demo');
    const run = await call('POST', '/payroll/runs', payroll.accessToken, { period: addMonths(todayStr().slice(0, 7), 3) });
    expect(run.status).toBe(201);
    expect((await call('POST', `/payroll/runs/${run.data.id}/approve`, payroll.accessToken)).status).toBe(400);
    expect((await call('POST', `/payroll/runs/${run.data.id}/calculate`, payroll.accessToken)).status).toBe(200);
    expect((await call('POST', `/payroll/runs/${run.data.id}/approve`, payroll.accessToken)).status).toBe(200);
    const again = await call('POST', `/payroll/runs/${run.data.id}/approve`, payroll.accessToken);
    expect(again.data.messageAr).toBe('تمت معالجة هذا الطلب مسبقاً');
    expect(again.status).toBe(409);
  });

  it('LOAN approval only by OWNER/HR_ADMIN/PAYROLL', async () => {
    const emp = await login('employee@shuoon.demo');
    const manager = await login('manager@shuoon.demo');
    const hr = await login('hr@shuoon.demo');
    const req = await call('POST', '/me/requests', emp.accessToken, { type: 'LOAN', title: 'سلفة طارئة', amount: 1200, payload: { months: 3 } });
    expect(req.status).toBe(201);
    const denied = await call('POST', `/requests/${req.data.id}/approve`, manager.accessToken);
    expect(denied.data.messageAr).toBe('اعتماد السلف من صلاحية الموارد البشرية أو الرواتب');
    expect(denied.status).toBe(403);
    const ok = await call('POST', `/requests/${req.data.id}/approve`, hr.accessToken);
    expect(ok.status).toBe(200);
    expect(ok.data.loanId).toBeTruthy();
  });

  it('CSV export neutralises formula cells', () => {
    const csv = toCsv([{ a: '=HYPERLINK("x")', b: '+1', c: '-2', d: '@SUM(A1)', e: 'safe', f: -5 }]);
    const row = csv.trim().split('\n')[1];
    expect(row).toBe(`"'=HYPERLINK(""x"")",'+1,'-2,'@SUM(A1),safe,-5`);
  });
});
