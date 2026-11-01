import { beforeEach, describe, expect, it } from 'vitest';
import { demoFetch, demoStateForTests, resetDemoData } from './client';
import { DB_VERSION } from './db';
import { todayStr } from './dates';
import { currentBranchCode } from '@/lib/hmac';

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const call = async (method: string, path: string, token: string | null, body?: unknown, opts: { query?: Record<string, unknown>; device?: string } = {}) =>
  (await demoFetch(method, path, { token, body, query: opts.query, headers: opts.device ? { 'X-Device-Id': opts.device } : {} })) as { status: number; data: Body };
const login = async (email: string) => (await call('POST', '/auth/login', null, { email, password: 'Shuoon@2026' })).data.accessToken as string;

const MSG = {
  device: 'هذا الجهاز غير مسجل لحسابك. اطلب من الموارد البشرية اعتماد الجهاز الجديد',
  codeMissing: 'أدخل رمز الفرع الظاهر على شاشة الحضور',
  codeWrong: 'رمز الفرع غير صحيح أو منتهي',
  window: 'وقت التسجيل خارج المدة المسموحة (12 ساعة)',
};

/** Device binding, rotating branch code and offline punches — mock parity with the API (spec §6). */
describe('demo mock: anti-tamper attendance', () => {
  let employee = '';
  let hr = '';
  let at: { lat: number; lng: number } = { lat: 0, lng: 0 };
  const empId = () => demoStateForTests().users.find((u) => u.email === 'employee@shuoon.demo')!.employeeId!;

  beforeEach(async () => {
    resetDemoData();
    employee = await login('employee@shuoon.demo');
    hr = await login('hr@shuoon.demo');
    const home = await call('GET', '/me/home', employee);
    at = { lat: home.data.branch.lat, lng: home.data.branch.lng };
    // start clean for the demo employee (yesterday too: an offline punch 3h ago may fall on it)
    const db = demoStateForTests();
    const since = todayStr(new Date(Date.now() - 2 * 86400_000));
    db.attendance = db.attendance.filter((r) => !(r.employeeId === empId() && r.date >= since));
  });

  it('bumps the demo DB version and exposes the company settings (no branch secrets)', async () => {
    expect(DB_VERSION).toBeGreaterThanOrEqual(13);
    const c = await call('GET', '/company', hr);
    expect(c.data).toMatchObject({ deviceBinding: true, requireBranchCode: false });
    const branches = await call('GET', '/branches', hr);
    for (const b of branches.data as Body[]) expect(b.codeSecret).toBeUndefined();
    for (const b of demoStateForTests().branches) expect(b.codeSecret).toMatch(/^[0-9a-f]{64}$/);
    const home = await call('GET', '/me/home', employee);
    expect(home.data.attendancePolicy).toEqual({ requireBranchCode: false, deviceBinding: true });
  });

  it('seeds realistic data: a pending device request and offline-flagged punches', async () => {
    const pending = await call('GET', '/devices', hr, undefined, { query: { status: 'PENDING' } });
    expect(pending.status).toBe(200);
    expect((pending.data as Body[]).length).toBeGreaterThan(0);
    expect(pending.data[0]).toMatchObject({ status: 'PENDING', employeeName: expect.any(String), branchName: expect.any(String) });
    expect(demoStateForTests().attendance.some((r) => r.flags.includes('OFFLINE'))).toBe(true);
    // the demo employee's own browser is never pre-bound (any visitor can punch)
    expect(demoStateForTests().employeeDevices.some((d) => d.employeeId === empId())).toBe(false);
  });

  it('first punch binds; another device → 403 + one PENDING; HR approves → swap; reset rebinds', async () => {
    expect((await call('POST', '/me/attendance/check-in', employee, at, { device: 'browser-A-0001' })).status).toBe(200);
    const denied = await call('POST', '/me/attendance/check-out', employee, at, { device: 'browser-B-0002' });
    expect(denied.status).toBe(403);
    expect(denied.data.messageAr).toBe(MSG.device);
    await call('POST', '/me/attendance/check-out', employee, at, { device: 'browser-B-0002' });
    const mine = demoStateForTests().employeeDevices.filter((d) => d.employeeId === empId());
    expect(mine.filter((d) => d.status === 'PENDING')).toHaveLength(1);

    expect((await call('GET', '/devices', employee)).status).toBe(403);
    const list = await call('GET', '/devices', hr, undefined, { query: { status: 'PENDING' } });
    const req = (list.data as Body[]).find((d) => d.employeeId === empId())!;
    expect(req.deviceId).toBeUndefined();
    expect(req.deviceIdSuffix).toBe('B-0002');
    const ok = await call('POST', `/devices/${req.id}/approve`, hr);
    expect(ok.status).toBe(200);
    expect(ok.data.status).toBe('ACTIVE');
    expect((await call('POST', `/devices/${req.id}/approve`, hr)).status).toBe(409);
    expect(demoStateForTests().employeeDevices.find((d) => d.employeeId === empId() && d.deviceId === 'browser-A-0001')!.status).toBe('REVOKED');

    const out = await call('POST', '/me/attendance/check-out', employee, at, { device: 'browser-B-0002' });
    expect(out.status).toBe(200);
    expect(out.data.flags).toContain('NEW_DEVICE_APPROVED');
    const board = await call('GET', '/attendance', hr);
    expect((board.data as Body[]).find((r) => r.employeeId === empId())!.flags).toContain('NEW_DEVICE_APPROVED');

    const reset = await call('DELETE', `/employees/${empId()}/devices`, hr);
    expect(reset.status).toBe(200);
    expect(reset.data.removed).toBeGreaterThanOrEqual(2);
    expect(demoStateForTests().employeeDevices.some((d) => d.employeeId === empId())).toBe(false);
  });

  it('reject keeps the device out; missing device id → 400', async () => {
    expect((await call('POST', '/me/attendance/check-in', employee, at)).status).toBe(400);
    await call('POST', '/me/attendance/check-in', employee, at, { device: 'browser-A-0001' });
    await call('POST', '/me/attendance/check-out', employee, at, { device: 'browser-C-0003' });
    const req = demoStateForTests().employeeDevices.find((d) => d.employeeId === empId() && d.status === 'PENDING')!;
    const r = await call('POST', `/devices/${req.id}/reject`, hr);
    expect(r.data.status).toBe('REJECTED');
    expect((await call('POST', '/me/attendance/check-out', employee, at, { device: 'browser-C-0003' })).status).toBe(403);
  });

  it('branch code required: missing 400, wrong 400, current 200', async () => {
    const owner = await login('owner@shuoon.demo');
    expect((await call('PATCH', '/company', owner, { requireBranchCode: true })).data.requireBranchCode).toBe(true);
    const missing = await call('POST', '/me/attendance/check-in', employee, at, { device: 'browser-A-0001' });
    expect(missing.status).toBe(400);
    expect(missing.data.messageAr).toBe(MSG.codeMissing);
    const e = demoStateForTests().employees.find((x) => x.id === empId())!;
    const secret = demoStateForTests().branches.find((b) => b.id === e.branchId)!.codeSecret;
    const { code } = currentBranchCode(secret);
    const wrong = String((Number(code) + 500000) % 1000000).padStart(6, '0');
    const bad = await call('POST', '/me/attendance/check-in', employee, { ...at, branchCode: wrong }, { device: 'browser-A-0001' });
    expect(bad.data.messageAr).toBe(MSG.codeWrong);
    const good = await call('POST', '/me/attendance/check-in', employee, { ...at, branchCode: currentBranchCode(secret).code }, { device: 'browser-A-0001' });
    expect(good.status).toBe(200);
  });

  it('offline: capturedAt 3h ago is the punch time + OFFLINE; replay twice is idempotent; 13h → 400', async () => {
    const owner = await login('owner@shuoon.demo');
    await call('PATCH', '/company', owner, { requireBranchCode: true }); // offline replays need no code
    const capturedAt = new Date(Date.now() - 3 * 3600_000).toISOString();
    const a = await call('POST', '/me/attendance/check-in', employee, { ...at, capturedAt }, { device: 'browser-A-0001' });
    expect(a.status).toBe(200);
    expect(a.data.checkIn).toBe(capturedAt);
    expect(a.data.date).toBe(todayStr(new Date(capturedAt)));
    expect(a.data.flags).toEqual(['OFFLINE', 'NO_BRANCH_CODE']); // accepted without a code, flagged
    const b = await call('POST', '/me/attendance/check-in', employee, { ...at, capturedAt }, { device: 'browser-A-0001' });
    expect(b.status).toBe(200);
    expect(b.data.id).toBe(a.data.id);
    expect(demoStateForTests().attendance.filter((r) => r.employeeId === empId() && r.date === a.data.date)).toHaveLength(1);
    const other = await call('POST', '/me/attendance/check-in', employee, { ...at, capturedAt: new Date(Date.now() - 2 * 3600_000).toISOString() }, { device: 'browser-A-0001' });
    expect(other.status).toBe(409);

    const outAt = new Date(Date.now() - 3600_000).toISOString();
    const o1 = await call('POST', '/me/attendance/check-out', employee, { ...at, capturedAt: outAt }, { device: 'browser-A-0001' });
    const o2 = await call('POST', '/me/attendance/check-out', employee, { ...at, capturedAt: outAt }, { device: 'browser-A-0001' });
    expect([o1.status, o2.status]).toEqual([200, 200]);
    expect(o2.data.checkOut).toBe(outAt);

    const old = await call('POST', '/me/attendance/check-in', employee, { ...at, capturedAt: new Date(Date.now() - 13 * 3600_000).toISOString() }, { device: 'browser-A-0001' });
    expect(old.status).toBe(400);
    expect(old.data.messageAr).toBe(MSG.window);
    const future = await call('POST', '/me/attendance/check-in', employee, { ...at, capturedAt: new Date(Date.now() + 5 * 60_000).toISOString() }, { device: 'browser-A-0001' });
    expect(future.data.messageAr).toBe(MSG.window);
  });

  it('binding off: any browser can punch', async () => {
    const owner = await login('owner@shuoon.demo');
    await call('PATCH', '/company', owner, { deviceBinding: false });
    expect((await call('POST', '/me/attendance/check-in', employee, at)).status).toBe(200);
    expect(demoStateForTests().employeeDevices.some((d) => d.employeeId === empId())).toBe(false);
  });

  describe('review fixes', () => {
    const FAR = { lat: 21.5, lng: 39.2 };
    const notes = () => demoStateForTests().notifications.filter((n) => n.userId === 'usr-owner' && n.link === '/attendance/devices').length;

    it('a punch failing the geofence or branch code never binds or files a request', async () => {
      expect((await call('POST', '/me/attendance/check-in', employee, FAR, { device: 'browser-A-0001' })).status).toBe(400);
      const owner = await login('owner@shuoon.demo');
      await call('PATCH', '/company', owner, { requireBranchCode: true });
      expect((await call('POST', '/me/attendance/check-in', employee, { ...at, branchCode: '000000' }, { device: 'browser-A-0001' })).status).toBe(400);
      expect(demoStateForTests().employeeDevices.some((d) => d.employeeId === empId())).toBe(false);
    });

    it('binding stores the user agent; a new request notifies owners/HR once', async () => {
      const before = notes();
      await call('POST', '/me/attendance/check-in', employee, at, { device: 'browser-A-0001' });
      const bound = demoStateForTests().employeeDevices.find((d) => d.employeeId === empId())!;
      expect(bound.userAgent).toBeTruthy();
      await call('POST', '/me/attendance/check-out', employee, at, { device: 'browser-B-0002' });
      await call('POST', '/me/attendance/check-out', employee, at, { device: 'browser-B-0002' });
      expect(notes()).toBe(before + 1);
    });

    it('branch manager: own device → 400, other branch invisible/undecidable', async () => {
      const mgr = await login('manager@shuoon.demo');
      const home = await call('GET', '/me/home', mgr);
      const here = { lat: home.data.branch.lat, lng: home.data.branch.lng };
      const mgrEmp = demoStateForTests().users.find((u) => u.email === 'manager@shuoon.demo')!.employeeId!;
      const db = demoStateForTests();
      db.attendance = db.attendance.filter((r) => !(r.employeeId === mgrEmp && r.date >= todayStr(new Date(Date.now() - 2 * 86400_000))));
      expect((await call('POST', '/me/attendance/check-in', mgr, here, { device: 'mgr-new-phone' })).status).toBe(403);
      const own = demoStateForTests().employeeDevices.find((d) => d.employeeId === mgrEmp && d.status === 'PENDING')!;
      for (const [m, path] of [['POST', `/devices/${own.id}/approve`], ['POST', `/devices/${own.id}/reject`], ['DELETE', `/employees/${mgrEmp}/devices`]]) {
        const r = await call(m, path, mgr);
        expect(r.status).toBe(400);
        expect(r.data.messageAr).toBe('لا يمكنك اعتماد طلبك بنفسك');
      }
      const list = await call('GET', '/devices', mgr, undefined, { query: { status: 'PENDING' } });
      const olaya = demoStateForTests().employees.find((e) => e.id === mgrEmp)!.branchId;
      expect((list.data as Body[]).every((d) => d.branchId === olaya)).toBe(true);
      const elsewhere = demoStateForTests().employeeDevices.find((d) => d.status === 'PENDING' && demoStateForTests().employees.find((e) => e.id === d.employeeId)!.branchId !== olaya)!;
      expect((await call('POST', `/devices/${elsewhere.id}/approve`, mgr)).status).toBe(404);
      expect((await call('POST', `/devices/${own.id}/approve`, hr)).status).toBe(200);
    });

    it('offline check-out captured before the check-in → 400', async () => {
      await call('POST', '/me/attendance/check-in', employee, { ...at, capturedAt: new Date(Date.now() - 3600_000).toISOString() }, { device: 'browser-A-0001' });
      const r = await call('POST', '/me/attendance/check-out', employee, { ...at, capturedAt: new Date(Date.now() - 2 * 3600_000).toISOString() }, { device: 'browser-A-0001' });
      expect(r.status).toBe(400);
      expect(r.data.messageAr).toBe('وقت الانصراف يجب أن يكون بعد وقت الحضور');
    });

    it('a replay captured slightly in the future is idempotent', async () => {
      const capturedAt = new Date(Date.now() + 60_000).toISOString();
      const a = await call('POST', '/me/attendance/check-in', employee, { ...at, capturedAt }, { device: 'browser-A-0001' });
      const b = await call('POST', '/me/attendance/check-in', employee, { ...at, capturedAt }, { device: 'browser-A-0001' });
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(b.data.id).toBe(a.data.id);
    });

    it('offline branch code is verified against capturedAt; the board shows when it was received', async () => {
      const owner = await login('owner@shuoon.demo');
      await call('PATCH', '/company', owner, { requireBranchCode: true });
      const e = demoStateForTests().employees.find((x) => x.id === empId())!;
      const secret = demoStateForTests().branches.find((b) => b.id === e.branchId)!.codeSecret;
      const capturedAt = new Date(Date.now() - 3 * 3600_000);
      const r = await call('POST', '/me/attendance/check-in', employee, { ...at, capturedAt: capturedAt.toISOString(), branchCode: currentBranchCode(secret, capturedAt).code }, { device: 'browser-A-0001' });
      expect(r.data.flags).toEqual(['OFFLINE']);
      const board = await call('GET', '/attendance', hr, undefined, { query: { date: todayStr(capturedAt) } });
      const row = (board.data as Body[]).find((x) => x.employeeId === empId())!;
      expect(Date.parse(row.checkIn)).toBe(capturedAt.getTime());
      expect(Date.parse(row.checkInReceivedAt)).toBeGreaterThan(capturedAt.getTime() + 2 * 3600_000);
      expect(row.checkOutReceivedAt).toBeNull();
    });

    it('HR correcting a punch time clears its receive time; a note-only edit keeps it', async () => {
      const capturedAt = new Date(Date.now() - 2 * 3600_000);
      const rec = await call('POST', '/me/attendance/check-in', employee, { ...at, capturedAt: capturedAt.toISOString() }, { device: 'browser-A-0001' });
      const row = async () => ((await call('GET', '/attendance', hr, undefined, { query: { date: todayStr(capturedAt) } })).data as Body[]).find((x) => x.employeeId === empId())!;
      expect((await call('PATCH', `/attendance/${rec.data.id}`, hr, { note: 'تمت المراجعة' })).status).toBe(200);
      expect((await row()).checkInReceivedAt).not.toBeNull();
      expect((await call('PATCH', `/attendance/${rec.data.id}`, hr, { checkIn: new Date(capturedAt.getTime() - 5 * 60_000).toISOString() })).status).toBe(200);
      expect((await row()).checkInReceivedAt).toBeNull();
    });
  });
});
