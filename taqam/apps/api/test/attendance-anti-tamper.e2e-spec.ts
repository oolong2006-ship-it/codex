import { createHmac } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { branchCode } from '@taqam/core';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { dayStr, todayStr } from '../src/common/dates';

/** Valid Saudi IBAN for a bank code + 18-digit account (mod-97). */
function iban(bank: string, account: string) {
  const bban = bank + account;
  let rem = 0;
  for (const ch of bban + '281000') rem = (rem * 10 + Number(ch)) % 97;
  return `SA${String(98 - rem).padStart(2, '0')}${bban}`;
}

const sha256 = (keyHex: string, msg: Uint8Array) => new Uint8Array(createHmac('sha256', Buffer.from(keyHex, 'hex')).update(msg).digest());

const MSG = {
  device: 'هذا الجهاز غير مسجل لحسابك. اطلب من الموارد البشرية اعتماد الجهاز الجديد',
  codeMissing: 'أدخل رمز الفرع الظاهر على شاشة الحضور',
  codeWrong: 'رمز الفرع غير صحيح أو منتهي',
  window: 'وقت التسجيل خارج المدة المسموحة (12 ساعة)',
};

describe('Anti-tamper attendance: device binding, branch code, offline punches (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  const stamp = Date.now();
  const BRANCH = { lat: 24.7136, lng: 46.6753 };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const dev = (id: string) => ({ 'X-Device-Id': `${id}-${stamp}` });

  let ownerToken = '';
  let branchId = '';
  let n = 0;

  async function createEmployee(o: { branch?: string; owner?: string } = {}) {
    n += 1;
    const nid = `10${String(stamp).slice(-6)}${String(n).padStart(2, '0')}`;
    const emp = await http
      .post('/api/employees')
      .set(auth(o.owner ?? ownerToken))
      .send({
        firstNameAr: 'موظف',
        lastNameAr: `رقم ${n}`,
        nationality: 'SA',
        gender: 'FEMALE',
        nationalId: nid,
        branchId: o.branch ?? branchId,
        jobTitle: 'كاشير',
        hireDate: '2022-01-01',
        basicSalary: 5000,
        iban: iban('10', `1234567890123456${String(n).padStart(2, '0')}`),
        createUser: { email: `tamper${n}-${stamp}@test.sa`, password: 'Passw0rd!' },
      })
      .expect(201);
    const login = await http.post('/api/auth/login').send({ email: `tamper${n}-${stamp}@test.sa`, password: 'Passw0rd!' }).expect(200);
    return { id: emp.body.id as string, token: login.body.accessToken as string };
  }

  const checkIn = (token: string, device: string | null, body: Record<string, unknown> = {}) => {
    const r = http.post('/api/me/attendance/check-in').set(auth(token));
    if (device) r.set(dev(device));
    return r.send({ ...BRANCH, ...body });
  };
  const checkOut = (token: string, device: string | null, body: Record<string, unknown> = {}) => {
    const r = http.post('/api/me/attendance/check-out').set(auth(token));
    if (device) r.set(dev(device));
    return r.send({ ...BRANCH, ...body });
  };
  const setCompany = (data: Record<string, unknown>) => http.patch('/api/company').set(auth(ownerToken)).send(data).expect(200);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication(), { swagger: false });
    await app.init();
    http = request(app.getHttpServer());
    prisma = app.get(PrismaService);
    await prisma.platformSettings.upsert({ where: { id: 1 }, update: { requireApproval: false }, create: { id: 1, requireApproval: false } });

    const reg = await http
      .post('/api/auth/register')
      .send({ companyNameAr: 'شركة البصمة', sector: 'RETAIL', ownerName: 'مالك', email: `tamperowner${stamp}@test.sa`, password: 'Passw0rd!' })
      .expect(201);
    ownerToken = reg.body.accessToken;
    const branch = await http.post('/api/branches').set(auth(ownerToken)).send({ nameAr: 'فرع العليا', city: 'الرياض', ...BRANCH, radiusMeters: 200 }).expect(201);
    branchId = branch.body.id;
  });

  afterEach(async () => {
    await setCompany({ deviceBinding: true, requireBranchCode: false });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('settings and secrets', () => {
    it('company defaults: device binding on, branch code off', async () => {
      const c = await http.get('/api/company').set(auth(ownerToken)).expect(200);
      expect(c.body).toMatchObject({ deviceBinding: true, requireBranchCode: false });
    });

    it('every branch gets a random 32-byte secret that is never returned by the API', async () => {
      const b = await prisma.branch.findUniqueOrThrow({ where: { id: branchId } });
      expect(b.codeSecret).toMatch(/^[0-9a-f]{64}$/);
      const other = await http.post('/api/branches').set(auth(ownerToken)).send({ nameAr: 'فرع آخر', city: 'جدة', lat: 21.5, lng: 39.2 }).expect(201);
      expect(other.body.codeSecret).toBeUndefined();
      const otherRow = await prisma.branch.findUniqueOrThrow({ where: { id: other.body.id } });
      expect(otherRow.codeSecret).toMatch(/^[0-9a-f]{64}$/);
      expect(otherRow.codeSecret).not.toBe(b.codeSecret);
      const patched = await http.patch(`/api/branches/${other.body.id}`).set(auth(ownerToken)).send({ nameAr: 'فرع جدة' }).expect(200);
      expect(patched.body.codeSecret).toBeUndefined();
      const list = await http.get('/api/branches').set(auth(ownerToken)).expect(200);
      for (const row of list.body) expect(row.codeSecret).toBeUndefined();
      await http.delete(`/api/branches/${other.body.id}`).set(auth(ownerToken)).expect(200);
    });

    it('CORS preflight allows the X-Device-Id header', async () => {
      const res = await http
        .options('/api/me/attendance/check-in')
        .set('Origin', 'http://localhost:3100')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'authorization,content-type,x-device-id');
      expect(res.status).toBeLessThan(300);
      expect(String(res.headers['access-control-allow-headers']).toLowerCase()).toContain('x-device-id');
    });
  });

  describe('device binding', () => {
    it('first punch binds the device; a second device gets 403 and one PENDING request; HR approval swaps the binding', async () => {
      const emp = await createEmployee();
      await checkIn(emp.token, 'phone-A').expect(200);
      const bound = await prisma.employeeDevice.findMany({ where: { employeeId: emp.id } });
      expect(bound).toHaveLength(1);
      expect(bound[0]).toMatchObject({ deviceId: `phone-A-${stamp}`, status: 'ACTIVE' });

      const denied = await checkOut(emp.token, 'phone-B').expect(403);
      expect(denied.body.messageAr).toBe(MSG.device);
      await checkOut(emp.token, 'phone-B').expect(403);
      const pending = await prisma.employeeDevice.findMany({ where: { employeeId: emp.id, status: 'PENDING' } });
      expect(pending).toHaveLength(1);
      expect(pending[0].deviceId).toBe(`phone-B-${stamp}`);

      // a third device replaces the request: still one PENDING
      await checkOut(emp.token, 'phone-C').expect(403);
      expect(await prisma.employeeDevice.count({ where: { employeeId: emp.id, status: 'PENDING' } })).toBe(1);
      await checkOut(emp.token, 'phone-B').expect(403);
      const req = await prisma.employeeDevice.findFirstOrThrow({ where: { employeeId: emp.id, status: 'PENDING' } });
      expect(req.deviceId).toBe(`phone-B-${stamp}`);

      // employees cannot see or decide device requests
      await http.get('/api/devices').set(auth(emp.token)).expect(403);
      await http.post(`/api/devices/${req.id}/approve`).set(auth(emp.token)).expect(403);

      const list = await http.get('/api/devices').query({ status: 'PENDING' }).set(auth(ownerToken)).expect(200);
      const row = list.body.find((d: { id: string }) => d.id === req.id);
      expect(row).toMatchObject({ status: 'PENDING', employeeId: emp.id, employeeName: expect.stringContaining('موظف'), branchName: 'فرع العليا' });
      // only a suffix of the device id leaves the server
      expect(row.deviceId).toBeUndefined();
      expect(row.deviceIdSuffix).toBe(`phone-B-${stamp}`.slice(-6));
      expect(list.body.every((d: { status: string }) => d.status === 'PENDING')).toBe(true);

      const approved = await http.post(`/api/devices/${req.id}/approve`).set(auth(ownerToken)).expect(200);
      expect(approved.body).toMatchObject({ id: req.id, status: 'ACTIVE' });
      // deciding twice is a conflict
      await http.post(`/api/devices/${req.id}/approve`).set(auth(ownerToken)).expect(409);

      const old = await prisma.employeeDevice.findFirstOrThrow({ where: { employeeId: emp.id, deviceId: `phone-A-${stamp}` } });
      expect(old.status).toBe('REVOKED');

      const out = await checkOut(emp.token, 'phone-B').expect(200);
      expect(out.body.flags).toContain('NEW_DEVICE_APPROVED');
      const again = await checkOut(emp.token, 'phone-A').expect(403);
      expect(again.body.messageAr).toBe(MSG.device);

      const board = await http.get('/api/attendance').set(auth(ownerToken)).expect(200);
      expect(board.body.find((r: { employeeId: string }) => r.employeeId === emp.id).flags).toContain('NEW_DEVICE_APPROVED');
    });

    it('HR can reject a request; reset clears the binding so the next punch binds again', async () => {
      const emp = await createEmployee();
      await checkIn(emp.token, 'old-phone').expect(200);
      await checkOut(emp.token, 'new-phone').expect(403);
      const req = await prisma.employeeDevice.findFirstOrThrow({ where: { employeeId: emp.id, status: 'PENDING' } });
      const rejected = await http.post(`/api/devices/${req.id}/reject`).set(auth(ownerToken)).expect(200);
      expect(rejected.body.status).toBe('REJECTED');
      await checkOut(emp.token, 'new-phone').expect(403);

      await http.delete(`/api/employees/${emp.id}/devices`).set(auth(emp.token)).expect(403);
      const reset = await http.delete(`/api/employees/${emp.id}/devices`).set(auth(ownerToken)).expect(200);
      expect(reset.body.removed).toBeGreaterThanOrEqual(2);
      expect(await prisma.employeeDevice.count({ where: { employeeId: emp.id } })).toBe(0);

      await checkOut(emp.token, 'new-phone').expect(200);
      const bound = await prisma.employeeDevice.findMany({ where: { employeeId: emp.id } });
      expect(bound).toEqual([expect.objectContaining({ deviceId: `new-phone-${stamp}`, status: 'ACTIVE' })]);
    });

    it('a punch without a device id is refused while binding is on', async () => {
      const emp = await createEmployee();
      const res = await checkIn(emp.token, null).expect(400);
      expect(res.body.messageAr).toBeTruthy();
      expect(await prisma.attendanceRecord.count({ where: { employeeId: emp.id } })).toBe(0);
    });

    it('binding off: any device (or none) can punch and nothing is bound', async () => {
      await setCompany({ deviceBinding: false });
      const emp = await createEmployee();
      await checkIn(emp.token, 'tablet-1').expect(200);
      await checkOut(emp.token, null).expect(200);
      expect(await prisma.employeeDevice.count({ where: { employeeId: emp.id } })).toBe(0);
    });

    it('device ids from another company never block or leak', async () => {
      const emp = await createEmployee();
      await http.post('/api/devices/00000000-0000-0000-0000-000000000000/approve').set(auth(ownerToken)).expect(404);
      await http.delete('/api/employees/00000000-0000-0000-0000-000000000000/devices').set(auth(ownerToken)).expect(404);
      await checkIn(emp.token, 'shared-id').expect(200);
    });
  });

  describe('rotating branch code', () => {
    it('required: missing → 400, wrong → 400, current code → 200', async () => {
      await setCompany({ requireBranchCode: true });
      const emp = await createEmployee();
      const home = await http.get('/api/me/home').set(auth(emp.token)).expect(200);
      expect(home.body.attendancePolicy).toEqual({ requireBranchCode: true, deviceBinding: true });

      const missing = await checkIn(emp.token, 'p1').expect(400);
      expect(missing.body.messageAr).toBe(MSG.codeMissing);
      const { codeSecret } = await prisma.branch.findUniqueOrThrow({ where: { id: branchId } });
      const current = branchCode(codeSecret, new Date(), sha256);
      const wrong = String((Number(current) + 500000) % 1000000).padStart(6, '0');
      const bad = await checkIn(emp.token, 'p1', { branchCode: wrong }).expect(400);
      expect(bad.body.messageAr).toBe(MSG.codeWrong);
      const stale = branchCode(codeSecret, new Date(Date.now() - 5 * 60_000), sha256);
      if (stale !== current) expect((await checkIn(emp.token, 'p1', { branchCode: stale }).expect(400)).body.messageAr).toBe(MSG.codeWrong);
      expect(await prisma.attendanceRecord.count({ where: { employeeId: emp.id } })).toBe(0);

      const ok = await checkIn(emp.token, 'p1', { branchCode: branchCode(codeSecret, new Date(), sha256) }).expect(200);
      expect(ok.body.checkIn).toBeTruthy();
    });

    it('not required by default: punches work without a code', async () => {
      const emp = await createEmployee();
      const home = await http.get('/api/me/home').set(auth(emp.token)).expect(200);
      expect(home.body.attendancePolicy).toEqual({ requireBranchCode: false, deviceBinding: true });
      await checkIn(emp.token, 'p2').expect(200);
    });
  });

  describe('offline punches', () => {
    it('capturedAt 3h ago is used as the check-in time and flagged OFFLINE (accepted without a branch code)', async () => {
      await setCompany({ requireBranchCode: true });
      const emp = await createEmployee();
      const capturedAt = new Date(Date.now() - 3 * 3600_000);
      capturedAt.setMilliseconds(0);
      const res = await checkIn(emp.token, 'off-1', { capturedAt: capturedAt.toISOString() }).expect(200);
      expect(res.body.checkIn).toBe(capturedAt.toISOString());
      expect(dayStr(res.body.date)).toBe(todayStr(capturedAt));
      // accepted without a code, but managers see it was not verified
      expect(res.body.flags).toEqual(['OFFLINE', 'NO_BRANCH_CODE']);

      const rows = await http.get('/api/attendance').query({ date: todayStr(capturedAt) }).set(auth(ownerToken)).expect(200);
      expect(rows.body.find((r: { employeeId: string }) => r.employeeId === emp.id).flags).toEqual(['OFFLINE', 'NO_BRANCH_CODE']);
      const mine = await http.get('/api/me/attendance').query({ month: todayStr(capturedAt).slice(0, 7) }).set(auth(emp.token)).expect(200);
      expect(mine.body[0].flags).toEqual(['OFFLINE', 'NO_BRANCH_CODE']);
    });

    it('capturedAt older than 12 hours or in the future → 400', async () => {
      const emp = await createEmployee();
      const old = await checkIn(emp.token, 'off-2', { capturedAt: new Date(Date.now() - 13 * 3600_000).toISOString() }).expect(400);
      expect(old.body.messageAr).toBe(MSG.window);
      const future = await checkIn(emp.token, 'off-2', { capturedAt: new Date(Date.now() + 5 * 60_000).toISOString() }).expect(400);
      expect(future.body.messageAr).toBe(MSG.window);
      // a minute of clock skew is tolerated
      await checkIn(emp.token, 'off-2', { capturedAt: new Date(Date.now() + 60_000).toISOString() }).expect(200);
      await checkIn(emp.token, 'off-2', { capturedAt: 'yesterday' }).expect(400);
    });

    it('the same replay sent twice is idempotent (one record, 200 with the existing record)', async () => {
      const emp = await createEmployee();
      const inAt = new Date(Date.now() - 2 * 3600_000).toISOString();
      const outAt = new Date(Date.now() - 60 * 60_000).toISOString();
      const first = await checkIn(emp.token, 'off-3', { capturedAt: inAt }).expect(200);
      const second = await checkIn(emp.token, 'off-3', { capturedAt: inAt }).expect(200);
      expect(second.body.id).toBe(first.body.id);
      expect(second.body.checkIn).toBe(first.body.checkIn);
      expect(second.body.flags).toEqual(['OFFLINE']);

      const o1 = await checkOut(emp.token, 'off-3', { capturedAt: outAt }).expect(200);
      const o2 = await checkOut(emp.token, 'off-3', { capturedAt: outAt }).expect(200);
      expect(o2.body.id).toBe(o1.body.id);
      expect(o2.body.checkOut).toBe(o1.body.checkOut);
      expect(o1.body.checkOut).toBe(outAt);
      expect(o1.body.workedMinutes).toBeGreaterThanOrEqual(59);
      expect(await prisma.attendanceRecord.count({ where: { employeeId: emp.id } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { entityId: first.body.id, action: 'CHECK_IN' } })).toBe(1);

      // a different time for the same day/kind is still a conflict
      await checkIn(emp.token, 'off-3', { capturedAt: new Date(Date.now() - 90 * 60_000).toISOString() }).expect(409);
      await checkOut(emp.token, 'off-3', { capturedAt: new Date(Date.now() - 30 * 60_000).toISOString() }).expect(409);
    });

    it('concurrent duplicate replays still produce a single record', async () => {
      const emp = await createEmployee();
      await checkIn(emp.token, 'off-4').expect(200); // bind the device first
      await prisma.attendanceRecord.deleteMany({ where: { employeeId: emp.id } });
      const at = new Date(Date.now() - 30 * 60_000).toISOString();
      const [a, b] = await Promise.all([checkIn(emp.token, 'off-4', { capturedAt: at }), checkIn(emp.token, 'off-4', { capturedAt: at })]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(a.body.id).toBe(b.body.id);
      expect(await prisma.attendanceRecord.count({ where: { employeeId: emp.id } })).toBe(1);
    });

    it('geofence and device binding still apply to offline punches', async () => {
      const emp = await createEmployee();
      await checkIn(emp.token, 'off-5').expect(200);
      const at = new Date(Date.now() - 10 * 60_000).toISOString();
      const far = await checkOut(emp.token, 'off-5', { capturedAt: at, lat: 21.5, lng: 39.2 }).expect(400);
      expect(far.body.messageAr).toBe('أنت خارج نطاق الفرع');
      const other = await checkOut(emp.token, 'off-6', { capturedAt: at }).expect(403);
      expect(other.body.messageAr).toBe(MSG.device);
    });
  });

  describe('review fixes', () => {
    const userIdOf = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
    const FAR = { lat: 21.5, lng: 39.2 };

    it('a punch failing the geofence or the branch code never binds a device or files a request', async () => {
      const emp = await createEmployee();
      await checkIn(emp.token, 'gf-1', FAR).expect(400);
      expect(await prisma.employeeDevice.count({ where: { employeeId: emp.id } })).toBe(0);
      await setCompany({ requireBranchCode: true });
      await checkIn(emp.token, 'gf-1', { branchCode: '000000' }).expect(400);
      await checkIn(emp.token, 'gf-1').expect(400);
      expect(await prisma.employeeDevice.count({ where: { employeeId: emp.id } })).toBe(0);
      await setCompany({ requireBranchCode: false });
      await checkIn(emp.token, 'gf-1').expect(200);
      // bound: another device outside the zone files no request; inside the zone it does
      await checkOut(emp.token, 'gf-2', FAR).expect(400);
      expect(await prisma.employeeDevice.count({ where: { employeeId: emp.id, status: 'PENDING' } })).toBe(0);
      await checkOut(emp.token, 'gf-2').expect(403);
      expect(await prisma.employeeDevice.count({ where: { employeeId: emp.id, status: 'PENDING' } })).toBe(1);
    });

    it('a new pending request notifies owners/HR (once per request)', async () => {
      const ownerId = await userIdOf(`tamperowner${stamp}@test.sa`);
      const before = await prisma.notification.count({ where: { userId: ownerId, link: '/attendance/devices' } });
      const emp = await createEmployee();
      await checkIn(emp.token, 'nt-1').expect(200);
      expect(await prisma.notification.count({ where: { userId: ownerId, link: '/attendance/devices' } })).toBe(before);
      await checkOut(emp.token, 'nt-2').expect(403);
      await checkOut(emp.token, 'nt-2').expect(403);
      expect(await prisma.notification.count({ where: { userId: ownerId, link: '/attendance/devices' } })).toBe(before + 1);
    });

    it('concurrent first punches from two devices bind exactly one', async () => {
      const emp = await createEmployee();
      const [a, b] = await Promise.all([checkIn(emp.token, 'race-A'), checkIn(emp.token, 'race-B')]);
      expect([a.status, b.status].sort()).toEqual([200, 403]);
      expect(await prisma.employeeDevice.count({ where: { employeeId: emp.id, status: 'ACTIVE' } })).toBe(1);
      expect(await prisma.employeeDevice.count({ where: { employeeId: emp.id, status: 'PENDING' } })).toBe(1);
    });

    it('two concurrent decisions on one request: exactly one wins, the other gets 409', async () => {
      const emp = await createEmployee();
      await checkIn(emp.token, 'dec-A').expect(200);
      await checkOut(emp.token, 'dec-B').expect(403);
      const req = await prisma.employeeDevice.findFirstOrThrow({ where: { employeeId: emp.id, status: 'PENDING' } });
      const [x, y] = await Promise.all([
        http.post(`/api/devices/${req.id}/approve`).set(auth(ownerToken)),
        http.post(`/api/devices/${req.id}/reject`).set(auth(ownerToken)),
      ]);
      expect([x.status, y.status].sort()).toEqual([200, 409]);
      const devices = await prisma.employeeDevice.findMany({ where: { employeeId: emp.id } });
      expect(devices.filter((d) => d.status === 'ACTIVE')).toHaveLength(1);
      expect(devices.filter((d) => d.status === 'PENDING')).toHaveLength(0);
    });

    it('approve racing a punch from a third device keeps one ACTIVE and at most one PENDING', async () => {
      const emp = await createEmployee();
      await checkIn(emp.token, 'ra-A').expect(200);
      await checkOut(emp.token, 'ra-B').expect(403);
      const req = await prisma.employeeDevice.findFirstOrThrow({ where: { employeeId: emp.id, status: 'PENDING' } });
      const [approve, punch] = await Promise.all([http.post(`/api/devices/${req.id}/approve`).set(auth(ownerToken)), checkOut(emp.token, 'ra-C')]);
      expect([200, 409]).toContain(approve.status);
      expect(punch.status).toBe(403);
      const devices = await prisma.employeeDevice.findMany({ where: { employeeId: emp.id } });
      expect(devices.filter((d) => d.status === 'ACTIVE')).toHaveLength(1);
      expect(devices.filter((d) => d.status === 'PENDING')).toHaveLength(1);
      expect(devices.find((d) => d.status === 'PENDING')!.deviceId).toBe(`ra-C-${stamp}`);
      if (approve.status === 200) expect(devices.find((d) => d.status === 'ACTIVE')!.deviceId).toBe(`ra-B-${stamp}`);
    });

    it('branch managers: never decide their own device, never see another branch; another company sees nothing', async () => {
      const branch2 = await http.post('/api/branches').set(auth(ownerToken)).send({ nameAr: 'فرع الملقا', city: 'الرياض', lat: 24.81, lng: 46.61, radiusMeters: 200 }).expect(201);
      const mgr = await createEmployee();
      // promote the employee's own login to branch manager of «فرع العليا»
      const mgrUser = await prisma.user.findFirstOrThrow({ where: { employeeId: mgr.id } });
      await http.patch(`/api/users/${mgrUser.id}`).set(auth(ownerToken)).send({ role: 'BRANCH_MANAGER' }).expect(200);
      const mgrToken = (await http.post('/api/auth/login').send({ email: mgrUser.email, password: 'Passw0rd!' }).expect(200)).body.accessToken as string;

      // own device request: 400 for approve, reject and reset
      await checkIn(mgrToken, 'mgr-A').expect(200);
      await checkOut(mgrToken, 'mgr-B').expect(403);
      const own = await prisma.employeeDevice.findFirstOrThrow({ where: { employeeId: mgr.id, status: 'PENDING' } });
      for (const call of [
        () => http.post(`/api/devices/${own.id}/approve`).set(auth(mgrToken)),
        () => http.post(`/api/devices/${own.id}/reject`).set(auth(mgrToken)),
        () => http.delete(`/api/employees/${mgr.id}/devices`).set(auth(mgrToken)),
      ]) {
        const r = await call().expect(400);
        expect(r.body.messageAr).toBe('لا يمكنك اعتماد طلبك بنفسك');
      }
      expect((await prisma.employeeDevice.findUniqueOrThrow({ where: { id: own.id } })).status).toBe('PENDING');

      // a request in another branch is invisible and undecidable for this manager
      const far = await createEmployee({ branch: branch2.body.id });
      const B2 = { lat: 24.81, lng: 46.61 };
      await checkIn(far.token, 'b2-A', B2).expect(200);
      await checkOut(far.token, 'b2-B', B2).expect(403);
      const other = await prisma.employeeDevice.findFirstOrThrow({ where: { employeeId: far.id, status: 'PENDING' } });
      const seen = await http.get('/api/devices').set(auth(mgrToken)).expect(200);
      expect(seen.body.some((d: { id: string }) => d.id === other.id)).toBe(false);
      expect(seen.body.some((d: { id: string }) => d.id === own.id)).toBe(true);
      await http.post(`/api/devices/${other.id}/approve`).set(auth(mgrToken)).expect(404);
      await http.delete(`/api/employees/${far.id}/devices`).set(auth(mgrToken)).expect(404);

      // another company
      const reg2 = await http
        .post('/api/auth/register')
        .send({ companyNameAr: 'شركة أخرى', sector: 'RETAIL', ownerName: 'مالك آخر', email: `tamperowner2${stamp}@test.sa`, password: 'Passw0rd!' })
        .expect(201);
      const owner2 = reg2.body.accessToken as string;
      const list2 = await http.get('/api/devices').set(auth(owner2)).expect(200);
      expect(list2.body).toEqual([]);
      await http.post(`/api/devices/${other.id}/approve`).set(auth(owner2)).expect(404);
      await http.post(`/api/devices/${other.id}/reject`).set(auth(owner2)).expect(404);
      await http.delete(`/api/employees/${far.id}/devices`).set(auth(owner2)).expect(404);

      // the owner can decide the manager's request
      await http.post(`/api/devices/${own.id}/approve`).set(auth(ownerToken)).expect(200);
    });

    it('offline check-out captured before the check-in → 400', async () => {
      const emp = await createEmployee();
      await checkIn(emp.token, 'ob-1', { capturedAt: new Date(Date.now() - 60 * 60_000).toISOString() }).expect(200);
      const r = await checkOut(emp.token, 'ob-1', { capturedAt: new Date(Date.now() - 90 * 60_000).toISOString() }).expect(400);
      expect(r.body.messageAr).toBe('وقت الانصراف يجب أن يكون بعد وقت الحضور');
    });

    it('a replay captured slightly in the future (within the skew) is still idempotent', async () => {
      const emp = await createEmployee();
      const at = new Date(Date.now() + 60_000).toISOString();
      const a = await checkIn(emp.token, 'sk-1', { capturedAt: at }).expect(200);
      await new Promise((r) => setTimeout(r, 30));
      const b = await checkIn(emp.token, 'sk-1', { capturedAt: at }).expect(200);
      expect(b.body.id).toBe(a.body.id);
      const outAt = new Date(Date.now() + 90_000).toISOString();
      const o1 = await checkOut(emp.token, 'sk-1', { capturedAt: outAt }).expect(200);
      await new Promise((r) => setTimeout(r, 30));
      const o2 = await checkOut(emp.token, 'sk-1', { capturedAt: outAt }).expect(200);
      expect(o2.body.checkOut).toBe(o1.body.checkOut);
      expect(await prisma.attendanceRecord.count({ where: { employeeId: emp.id } })).toBe(1);
    });

    it('offline punches carry the branch code: verified against capturedAt, else flagged NO_BRANCH_CODE', async () => {
      await setCompany({ requireBranchCode: true });
      const { codeSecret } = await prisma.branch.findUniqueOrThrow({ where: { id: branchId } });
      const capturedIn = new Date(Date.now() - 3 * 3600_000);
      const good = await createEmployee();
      const r1 = await checkIn(good.token, 'bc-1', { capturedAt: capturedIn.toISOString(), branchCode: branchCode(codeSecret, capturedIn, sha256) }).expect(200);
      expect(r1.body.flags).toEqual(['OFFLINE']);

      const none = await createEmployee();
      const r2 = await checkIn(none.token, 'bc-2', { capturedAt: capturedIn.toISOString() }).expect(200);
      expect(r2.body.flags).toEqual(['OFFLINE', 'NO_BRANCH_CODE']);

      const stale = await createEmployee();
      // the code shown now is not the code shown 3 hours ago
      const r3 = await checkIn(stale.token, 'bc-3', { capturedAt: capturedIn.toISOString(), branchCode: branchCode(codeSecret, new Date(), sha256) }).expect(200);
      expect(r3.body.flags).toEqual(['OFFLINE', 'NO_BRANCH_CODE']);

      await setCompany({ requireBranchCode: false });
      const off = await createEmployee();
      const r4 = await checkIn(off.token, 'bc-4', { capturedAt: capturedIn.toISOString() }).expect(200);
      expect(r4.body.flags).toEqual(['OFFLINE']);
    });

    it('the board shows when an offline punch was received next to when it was captured', async () => {
      const emp = await createEmployee();
      const capturedAt = new Date(Date.now() - 2 * 3600_000);
      const before = Date.now();
      await checkIn(emp.token, 'rc-1', { capturedAt: capturedAt.toISOString() }).expect(200);
      const rows = await http.get('/api/attendance').query({ date: todayStr(capturedAt) }).set(auth(ownerToken)).expect(200);
      const row = rows.body.find((r: { employeeId: string }) => r.employeeId === emp.id);
      expect(new Date(row.checkIn).getTime()).toBe(capturedAt.getTime());
      expect(new Date(row.checkInReceivedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(row.checkOutReceivedAt).toBeNull();
    });

    it('HR correcting a punch time clears its receive time (no more «استُلم لاحقاً»); a note-only edit keeps it', async () => {
      const emp = await createEmployee();
      const capturedAt = new Date(Date.now() - 2 * 3600_000);
      const rec = await checkIn(emp.token, 'hr-1', { capturedAt: capturedAt.toISOString() }).expect(200);
      const row = async () => (await http.get('/api/attendance').query({ date: todayStr(capturedAt) }).set(auth(ownerToken)).expect(200)).body.find((r: { employeeId: string }) => r.employeeId === emp.id);
      await http.patch(`/api/attendance/${rec.body.id}`).set(auth(ownerToken)).send({ note: 'تمت المراجعة' }).expect(200);
      expect((await row()).checkInReceivedAt).not.toBeNull();
      await http.patch(`/api/attendance/${rec.body.id}`).set(auth(ownerToken)).send({ checkIn: new Date(capturedAt.getTime() - 5 * 60_000).toISOString() }).expect(200);
      expect((await row()).checkInReceivedAt).toBeNull();
    });
  });
});
