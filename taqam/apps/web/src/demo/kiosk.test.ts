import { beforeEach, describe, expect, it } from 'vitest';
import { demoFetch, demoStateForTests, resetDemoData } from './client';
import { DB_VERSION } from './db';
import { todayStr } from './dates';
import { currentBranchCode, sha256 } from '@/lib/hmac';
import { DEMO_KIOSK_EMPLOYEE_NUMBER, DEMO_KIOSK_PIN, DEMO_KIOSK_TOKEN } from '@/lib/kiosk';

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const call = async (method: string, path: string, token: string | null, body?: unknown, headers: Record<string, string> = {}) =>
  (await demoFetch(method, path, { token, body, headers })) as { status: number; data: Body };
const login = async (email: string) => (await call('POST', '/auth/login', null, { email, password: 'Shuoon@2026' })).data.accessToken as string;
const kiosk = (token: string, method: string, path: string, body?: unknown) => call(method, path, null, body, { 'X-Kiosk-Token': token });
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

const MSG = {
  invalid: 'رقم الموظف أو الرمز غير صحيح',
  locked: 'تم إيقاف الرمز مؤقتاً لكثرة المحاولات، حاول بعد 15 دقيقة',
  needKiosk: 'اربط جهاز حضور في الفرع أولاً ليظهر الرمز للموظفين',
};

/** Branch kiosk — mock parity with apps/api/test/kiosk.e2e-spec.ts (spec §6). Never uses the camera. */
describe('demo mock: branch kiosk', () => {
  let owner = '';
  let employee = '';
  const empId = () => demoStateForTests().users.find((u) => u.email === 'employee@shuoon.demo')!.employeeId!;
  const emp = () => demoStateForTests().employees.find((e) => e.id === empId())!;
  const punch = (employeeNumber: string, pin: string, token = DEMO_KIOSK_TOKEN) => kiosk(token, 'POST', '/kiosk/punch', { employeeNumber, pin });

  beforeEach(async () => {
    resetDemoData();
    owner = await login('owner@shuoon.demo');
    employee = await login('employee@shuoon.demo');
    const db = demoStateForTests();
    db.attendance = db.attendance.filter((r) => !(r.employeeId === empId() && r.date >= todayStr(new Date(Date.now() - 2 * 86400_000))));
  });

  it('bumps the DB version and seeds a paired kiosk for «فرع العليا» with PIN 1234 for demo employees', async () => {
    expect(DB_VERSION).toBeGreaterThanOrEqual(14);
    const db = demoStateForTests();
    const k = db.kioskDevices.find((x) => x.branchId === 'br-olaya')!;
    expect(k.tokenHash).toBe(hex(sha256(new TextEncoder().encode(DEMO_KIOSK_TOKEN))));
    expect(JSON.stringify(db.kioskDevices)).not.toContain(DEMO_KIOSK_TOKEN);
    expect(DEMO_KIOSK_PIN).toBe('1234');
    expect(emp().employeeNumber.replace(/\D/g, '').replace(/^0+/, '')).toBe(DEMO_KIOSK_EMPLOYEE_NUMBER);
    // PINs are never stored in clear
    expect(JSON.stringify(db.kioskPins)).not.toContain('"1234"');
    const me = await kiosk(DEMO_KIOSK_TOKEN, 'GET', '/kiosk/me');
    expect(me.status).toBe(200);
    expect(Object.keys(me.data).sort()).toEqual(['branchCode', 'branchName', 'codeExpiresInSeconds', 'companyName']);
    expect(me.data.branchName).toBe('فرع العليا');
    const secret = db.branches.find((b) => b.id === 'br-olaya')!.codeSecret;
    expect([currentBranchCode(secret).code, currentBranchCode(secret, new Date(Date.now() - 30_000)).code]).toContain(me.data.branchCode);
    expect((await call('GET', '/company', owner)).data.activeKiosks).toBe(1);
  });

  it('pair → token works; list hides the token; revoke → 401; EMPLOYEE cannot pair', async () => {
    const paired = await call('POST', '/branches/br-olaya/kiosks', owner, { name: 'جهاز الكاشير' });
    expect(paired.status).toBe(201);
    expect(Object.keys(paired.data).sort()).toEqual(['id', 'name', 'token']);
    expect(paired.data.token).toMatch(/^[0-9a-f]{64}$/);
    expect((await kiosk(paired.data.token, 'GET', '/kiosk/me')).status).toBe(200);
    const list = await call('GET', '/branches/br-olaya/kiosks', owner);
    expect(JSON.stringify(list.data)).not.toContain(paired.data.token);
    expect(list.data.find((k: Body) => k.id === paired.data.id)).toMatchObject({ name: 'جهاز الكاشير', revokedAt: null, branchId: 'br-olaya' });
    expect(list.data[0].tokenHash).toBeUndefined();
    expect((await call('POST', '/branches/br-olaya/kiosks', employee, { name: 'x' })).status).toBe(403);
    expect((await call('POST', '/branches/br-olaya/kiosks', owner, { name: ' ' })).status).toBe(400);

    const revoked = await call('DELETE', `/kiosks/${paired.data.id}`, owner);
    expect(revoked).toMatchObject({ status: 200, data: { ok: true, requireBranchCodeDisabled: false } });
    const after = await kiosk(paired.data.token, 'GET', '/kiosk/me');
    expect(after.status).toBe(401);
    expect(after.data.code).toBe('KIOSK_TOKEN_INVALID');
    expect((await kiosk('f'.repeat(64), 'POST', '/kiosk/punch', { employeeNumber: '5', pin: '1234' })).status).toBe(401);
    expect((await call('GET', '/kiosk/me', null)).status).toBe(401);
  });

  it('branch manager pairs only their own branch', async () => {
    const mgr = await login('manager@shuoon.demo');
    const own = demoStateForTests().users.find((u) => u.email === 'manager@shuoon.demo')!;
    const ownBranch = demoStateForTests().employees.find((e) => e.id === own.employeeId)!.branchId!;
    const other = demoStateForTests().branches.find((b) => b.id !== ownBranch)!.id;
    expect((await call('POST', `/branches/${other}/kiosks`, mgr, { name: 'x' })).status).toBe(403);
    expect((await call('POST', `/branches/${ownBranch}/kiosks`, mgr, { name: 'x' })).status).toBe(201);
  });

  it('punch IN then OUT (source KIOSK, flag KIOSK, no device binding); a double tap is refused', async () => {
    const inRes = await punch(DEMO_KIOSK_EMPLOYEE_NUMBER, '١٢٣٤');
    expect(inRes.status).toBe(200);
    expect(inRes.data).toEqual({ action: 'IN', employeeName: 'سعود الدوسري', time: expect.any(String), lateMinutes: expect.any(Number) });
    const rec = demoStateForTests().attendance.find((r) => r.employeeId === empId() && r.date === todayStr())!;
    expect(rec).toMatchObject({ source: 'KIOSK', flags: ['KIOSK'] });
    expect(demoStateForTests().employeeDevices.some((d) => d.employeeId === empId())).toBe(false);
    expect((await punch(DEMO_KIOSK_EMPLOYEE_NUMBER, '1234')).status).toBe(409);
    rec.checkIn = new Date(Date.now() - 2 * 3600_000).toISOString();
    const out = await punch(emp().employeeNumber, '1234');
    expect(out.data).toMatchObject({ action: 'OUT', employeeName: 'سعود الدوسري' });
    expect(rec.checkOut).toBe(out.data.time);
    expect((await punch(DEMO_KIOSK_EMPLOYEE_NUMBER, '1234')).data.messageAr).toBe('تم تسجيل الانصراف مسبقاً اليوم');
  });

  it('PIN lockout: 5 wrong → 423 on the 6th even with the right PIN; unlocks after 15 minutes', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await punch(DEMO_KIOSK_EMPLOYEE_NUMBER, '0000');
      expect(r.status).toBe(401);
      expect(r.data.messageAr).toBe(MSG.invalid);
    }
    const locked = await punch(DEMO_KIOSK_EMPLOYEE_NUMBER, '1234');
    expect(locked.status).toBe(423);
    expect(locked.data.messageAr).toBe(MSG.locked);
    expect((await call('GET', `/employees/${empId()}/kiosk-pin`, owner)).data.lockedUntil).toBeTruthy();
    const pin = demoStateForTests().kioskPins.find((p) => p.employeeId === empId())!;
    pin.lockedUntil = new Date(Date.now() - 1000).toISOString();
    pin.firstFailAt = new Date(Date.now() - 16 * 60_000).toISOString();
    expect((await punch(DEMO_KIOSK_EMPLOYEE_NUMBER, '1234')).status).toBe(200);
    expect(demoStateForTests().kioskPins.find((p) => p.employeeId === empId())).toMatchObject({ failCount: 0, firstFailAt: null, lockedUntil: null });
  });

  it('unknown number, another branch or no PIN → the same 401, never locked', async () => {
    const ref = await punch(DEMO_KIOSK_EMPLOYEE_NUMBER, '0001');
    for (let i = 0; i < 7; i++) expect(await punch('EMP-9999', '1234')).toEqual(ref);
    const otherBranch = demoStateForTests().employees.find((e) => e.branchId !== 'br-olaya' && e.status !== 'TERMINATED')!;
    for (let i = 0; i < 6; i++) expect(await punch(otherBranch.employeeNumber, '1234')).toEqual(ref);
    expect(demoStateForTests().kioskPins.find((p) => p.employeeId === otherBranch.id)?.failCount ?? 0).toBe(0);
  });

  it('PIN: employee sets their own (4–6 digits, Arabic-Indic ok); HR sets one and clears the lock', async () => {
    expect((await call('GET', '/me/kiosk-pin', employee)).data).toEqual({ hasPin: true });
    expect((await call('POST', '/me/kiosk-pin', employee, { pin: '12' })).status).toBe(400);
    expect((await call('POST', '/me/kiosk-pin', employee, { pin: '٩٨٧٦' })).status).toBe(200);
    expect((await punch(DEMO_KIOSK_EMPLOYEE_NUMBER, '1234')).status).toBe(401);
    for (let i = 0; i < 4; i++) await punch(DEMO_KIOSK_EMPLOYEE_NUMBER, '0000');
    expect((await punch(DEMO_KIOSK_EMPLOYEE_NUMBER, '9876')).status).toBe(423);
    expect((await call('POST', `/employees/${empId()}/kiosk-pin`, employee, { pin: '1111' })).status).toBe(403);
    expect((await call('POST', `/employees/${empId()}/kiosk-pin`, owner, { pin: '1111' })).status).toBe(200);
    expect((await punch(DEMO_KIOSK_EMPLOYEE_NUMBER, '1111')).status).toBe(200);
    // never exposed by the employee views
    expect(JSON.stringify((await call('GET', `/employees/${empId()}`, owner)).data)).not.toMatch(/pinHash|kioskPin/i);
  });

  it('require branch code only with an active kiosk; revoking the last kiosk turns it off', async () => {
    const db = demoStateForTests();
    db.kioskDevices.forEach((k) => { k.revokedAt = new Date().toISOString(); });
    expect((await call('GET', '/company', owner)).data.activeKiosks).toBe(0);
    const denied = await call('PATCH', '/company', owner, { requireBranchCode: true });
    expect(denied.status).toBe(400);
    expect(denied.data.messageAr).toBe(MSG.needKiosk);
    const k = await call('POST', '/branches/br-olaya/kiosks', owner, { name: 'جهاز' });
    expect((await call('PATCH', '/company', owner, { requireBranchCode: true })).data.requireBranchCode).toBe(true);
    expect((await call('DELETE', `/kiosks/${k.data.id}`, owner)).data).toEqual({ ok: true, requireBranchCodeDisabled: true });
    expect((await call('GET', '/company', owner)).data).toMatchObject({ requireBranchCode: false, activeKiosks: 0 });
  });
});
