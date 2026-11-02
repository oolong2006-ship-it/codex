import { createHash, createHmac } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { branchCode, calculateAttendance } from '@taqam/core';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { addDays, todayStr } from '../src/common/dates';

/** Valid Saudi IBAN for a bank code + 18-digit account (mod-97). */
function iban(bank: string, account: string) {
  const bban = bank + account;
  let rem = 0;
  for (const ch of bban + '281000') rem = (rem * 10 + Number(ch)) % 97;
  return `SA${String(98 - rem).padStart(2, '0')}${bban}`;
}

const hmac = (keyHex: string, msg: Uint8Array) => new Uint8Array(createHmac('sha256', Buffer.from(keyHex, 'hex')).update(msg).digest());
const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex');

const MSG = {
  invalid: 'رقم الموظف أو الرمز غير صحيح',
  locked: 'تم إيقاف الرمز مؤقتاً لكثرة المحاولات، حاول بعد 15 دقيقة',
  needKiosk: 'اربط جهاز حضور في الفرع أولاً ليظهر الرمز للموظفين',
};

describe('Branch kiosk mode: pairing, PIN punches and lockout (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  const stamp = Date.now();
  const BRANCH = { lat: 24.7136, lng: 46.6753 };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  let ownerToken = '';
  let branchId = '';
  let otherBranchId = '';
  let kioskToken = '';
  let kioskId = '';
  let n = 0;

  async function createEmployee(o: { branch?: string; login?: boolean } = {}) {
    n += 1;
    const nid = `10${String(stamp).slice(-6)}${String(n).padStart(2, '0')}`;
    const email = `kiosk${n}-${stamp}@test.sa`;
    const emp = await http
      .post('/api/employees')
      .set(auth(ownerToken))
      .send({
        firstNameAr: 'موظف',
        lastNameAr: `رقم ${n}`,
        nationality: 'SA',
        gender: 'MALE',
        nationalId: nid,
        branchId: o.branch ?? branchId,
        jobTitle: 'كاشير',
        hireDate: '2022-01-01',
        basicSalary: 5000,
        iban: iban('10', `1234567890123456${String(n).padStart(2, '0')}`),
        ...(o.login === false ? {} : { createUser: { email, password: 'Passw0rd!' } }),
      })
      .expect(201);
    let token = '';
    if (o.login !== false) token = (await http.post('/api/auth/login').send({ email, password: 'Passw0rd!' }).expect(200)).body.accessToken;
    return { id: emp.body.id as string, number: emp.body.employeeNumber as string, name: `موظف رقم ${n}`, token, email };
  }

  async function employeeWithPin(pin = '1234', branch?: string) {
    const e = await createEmployee({ branch });
    await http.post(`/api/employees/${e.id}/kiosk-pin`).set(auth(ownerToken)).send({ pin }).expect(200);
    return e;
  }

  const punch = (token: string | null, body: Record<string, unknown>) => {
    const r = http.post('/api/kiosk/punch');
    if (token !== null) r.set('X-Kiosk-Token', token);
    return r.send(body);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication(), { swagger: false });
    await app.init();
    http = request(app.getHttpServer());
    prisma = app.get(PrismaService);
    await prisma.platformSettings.upsert({ where: { id: 1 }, update: { requireApproval: false }, create: { id: 1, requireApproval: false } });

    const reg = await http
      .post('/api/auth/register')
      .send({ companyNameAr: 'شركة الكشك', sector: 'RETAIL', ownerName: 'مالك', email: `kioskowner${stamp}@test.sa`, password: 'Passw0rd!' })
      .expect(201);
    ownerToken = reg.body.accessToken;
    branchId = (await http.post('/api/branches').set(auth(ownerToken)).send({ nameAr: 'فرع العليا', city: 'الرياض', ...BRANCH }).expect(201)).body.id;
    otherBranchId = (await http.post('/api/branches').set(auth(ownerToken)).send({ nameAr: 'فرع الملقا', city: 'الرياض', lat: 24.81, lng: 46.61 }).expect(201)).body.id;
    const paired = await http.post(`/api/branches/${branchId}/kiosks`).set(auth(ownerToken)).send({ name: 'جهاز المدخل' }).expect(201);
    kioskToken = paired.body.token;
    kioskId = paired.body.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('pairing', () => {
    it('returns a 32-byte hex token once, stores only its sha256 and lists the device without it', async () => {
      const res = await http.post(`/api/branches/${branchId}/kiosks`).set(auth(ownerToken)).send({ name: 'جهاز الكاشير' }).expect(201);
      expect(Object.keys(res.body).sort()).toEqual(['id', 'name', 'token']);
      expect(res.body.token).toMatch(/^[0-9a-f]{64}$/);
      const row = await prisma.kioskDevice.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.tokenHash).toBe(sha256Hex(res.body.token));
      expect(row.tokenHash).not.toBe(res.body.token);
      expect(row.branchId).toBe(branchId);

      const list = await http.get(`/api/branches/${branchId}/kiosks`).set(auth(ownerToken)).expect(200);
      const listed = list.body.find((k: { id: string }) => k.id === res.body.id);
      expect(listed).toMatchObject({ id: res.body.id, name: 'جهاز الكاشير', branchId, revokedAt: null });
      expect(listed.token).toBeUndefined();
      expect(listed.tokenHash).toBeUndefined();
      expect(JSON.stringify(list.body)).not.toContain(res.body.token);
      await http.delete(`/api/kiosks/${res.body.id}`).set(auth(ownerToken)).expect(200);
    });

    it('rejects an empty name', async () => {
      await http.post(`/api/branches/${branchId}/kiosks`).set(auth(ownerToken)).send({ name: '  ' }).expect(400);
    });

    it('GET /kiosk/me shows the branch, company and the rotating branch code; marks the device as seen', async () => {
      const res = await http.get('/api/kiosk/me').set('X-Kiosk-Token', kioskToken).expect(200);
      expect(Object.keys(res.body).sort()).toEqual(['branchCode', 'branchName', 'codeExpiresInSeconds', 'companyName']);
      expect(res.body.branchName).toBe('فرع العليا');
      expect(res.body.companyName).toBe('شركة الكشك');
      const { codeSecret } = await prisma.branch.findUniqueOrThrow({ where: { id: branchId } });
      const now = Date.now();
      expect([branchCode(codeSecret, new Date(now), hmac), branchCode(codeSecret, new Date(now - 30_000), hmac)]).toContain(res.body.branchCode);
      expect(res.body.codeExpiresInSeconds).toBeGreaterThanOrEqual(1);
      expect(res.body.codeExpiresInSeconds).toBeLessThanOrEqual(30);
      const row = await prisma.kioskDevice.findUniqueOrThrow({ where: { id: kioskId } });
      expect(row.lastSeenAt).toBeTruthy();
    });

    it('missing, malformed or unknown kiosk token → 401; a user JWT is not a kiosk token', async () => {
      await http.get('/api/kiosk/me').expect(401);
      await http.get('/api/kiosk/me').set('X-Kiosk-Token', 'abc').expect(401);
      await http.get('/api/kiosk/me').set('X-Kiosk-Token', 'f'.repeat(64)).expect(401);
      await http.get('/api/kiosk/me').set(auth(ownerToken)).expect(401);
      await punch(null, { employeeNumber: '1', pin: '1234' }).expect(401);
    });

    it('EMPLOYEE cannot pair (403); a branch manager pairs only their own branch; another company sees nothing', async () => {
      const emp = await createEmployee();
      await http.post(`/api/branches/${branchId}/kiosks`).set(auth(emp.token)).send({ name: 'x' }).expect(403);
      await http.get(`/api/branches/${branchId}/kiosks`).set(auth(emp.token)).expect(403);
      await http.delete(`/api/kiosks/${kioskId}`).set(auth(emp.token)).expect(403);

      const mgr = await createEmployee();
      const mgrUser = await prisma.user.findFirstOrThrow({ where: { employeeId: mgr.id } });
      await http.patch(`/api/users/${mgrUser.id}`).set(auth(ownerToken)).send({ role: 'BRANCH_MANAGER' }).expect(200);
      const mgrToken = (await http.post('/api/auth/login').send({ email: mgr.email, password: 'Passw0rd!' }).expect(200)).body.accessToken as string;
      await http.post(`/api/branches/${otherBranchId}/kiosks`).set(auth(mgrToken)).send({ name: 'x' }).expect(403);
      await http.get(`/api/branches/${otherBranchId}/kiosks`).set(auth(mgrToken)).expect(403);
      const own = await http.post(`/api/branches/${branchId}/kiosks`).set(auth(mgrToken)).send({ name: 'جهاز المدير' }).expect(201);
      await http.get(`/api/branches/${branchId}/kiosks`).set(auth(mgrToken)).expect(200);
      const otherKiosk = await http.post(`/api/branches/${otherBranchId}/kiosks`).set(auth(ownerToken)).send({ name: 'ملقا' }).expect(201);
      await http.delete(`/api/kiosks/${otherKiosk.body.id}`).set(auth(mgrToken)).expect(404);
      await http.delete(`/api/kiosks/${own.body.id}`).set(auth(mgrToken)).expect(200);
      await http.delete(`/api/kiosks/${otherKiosk.body.id}`).set(auth(ownerToken)).expect(200);

      const reg2 = await http
        .post('/api/auth/register')
        .send({ companyNameAr: 'شركة أخرى', sector: 'RETAIL', ownerName: 'مالك', email: `kioskother${stamp}@test.sa`, password: 'Passw0rd!' })
        .expect(201);
      const other = reg2.body.accessToken as string;
      await http.get(`/api/branches/${branchId}/kiosks`).set(auth(other)).expect(404);
      await http.post(`/api/branches/${branchId}/kiosks`).set(auth(other)).send({ name: 'x' }).expect(404);
      await http.delete(`/api/kiosks/${kioskId}`).set(auth(other)).expect(404);
    });
  });

  describe('PIN', () => {
    it('employee sets their own PIN (4–6 digits, Arabic-Indic accepted), stored only as a bcrypt hash', async () => {
      const emp = await createEmployee();
      expect((await http.get('/api/me/kiosk-pin').set(auth(emp.token)).expect(200)).body).toEqual({ hasPin: false });
      for (const pin of ['123', '1234567', 'abcd', '12a4', '']) {
        await http.post('/api/me/kiosk-pin').set(auth(emp.token)).send({ pin }).expect(400);
      }
      await http.post('/api/me/kiosk-pin').set(auth(emp.token)).send({ pin: '٤٥٦٧' }).expect(200);
      expect((await http.get('/api/me/kiosk-pin').set(auth(emp.token)).expect(200)).body).toEqual({ hasPin: true });
      const row = await prisma.employee.findUniqueOrThrow({ where: { id: emp.id } });
      expect(row.kioskPinHash).toMatch(/^\$2[aby]\$/);
      expect(row.kioskPinHash).not.toContain('4567');
      await punch(kioskToken, { employeeNumber: emp.number, pin: '4567' }).expect(200);
      // never returned by any employee endpoint, never in the audit log
      const detail = await http.get(`/api/employees/${emp.id}`).set(auth(ownerToken)).expect(200);
      expect(detail.body.kioskPinHash).toBeUndefined();
      const profile = await http.get('/api/me/profile').set(auth(emp.token)).expect(200);
      expect(profile.body.kioskPinHash).toBeUndefined();
      const logs = await prisma.auditLog.findMany({ where: { entityId: emp.id } });
      expect(JSON.stringify(logs)).not.toContain('4567');
      expect(JSON.stringify(logs)).not.toContain(row.kioskPinHash!);
    });

    it('HR sets an employee PIN; EMPLOYEE cannot set another employee’s PIN', async () => {
      const emp = await createEmployee();
      const other = await createEmployee();
      await http.post(`/api/employees/${emp.id}/kiosk-pin`).set(auth(other.token)).send({ pin: '1111' }).expect(403);
      await http.post(`/api/employees/${emp.id}/kiosk-pin`).set(auth(ownerToken)).send({ pin: '99' }).expect(400);
      await http.post(`/api/employees/${emp.id}/kiosk-pin`).set(auth(ownerToken)).send({ pin: '246810' }).expect(200);
      expect((await http.get(`/api/employees/${emp.id}/kiosk-pin`).set(auth(ownerToken)).expect(200)).body).toEqual({ hasPin: true, lockedUntil: null });
      await http.post('/api/employees/does-not-exist/kiosk-pin').set(auth(ownerToken)).send({ pin: '1234' }).expect(404);
    });
  });

  describe('punch', () => {
    it('IN when there is no check-in today, then OUT; source KIOSK + flag KIOSK; device binding does not apply', async () => {
      const emp = await employeeWithPin('1234');
      const inRes = await punch(kioskToken, { employeeNumber: emp.number, pin: '1234' }).expect(200);
      expect(inRes.body).toEqual({ action: 'IN', employeeName: emp.name, time: expect.any(String), lateMinutes: 0 });
      const rec = await prisma.attendanceRecord.findFirstOrThrow({ where: { employeeId: emp.id } });
      expect(rec.source).toBe('KIOSK');
      expect(rec.flags).toEqual(['KIOSK']);
      expect(rec.checkIn!.toISOString()).toBe(inRes.body.time);
      expect(await prisma.employeeDevice.count({ where: { employeeId: emp.id } })).toBe(0);

      // a second tap right after the check-in is not taken as a check-out
      await punch(kioskToken, { employeeNumber: emp.number, pin: '1234' }).expect(409);
      await prisma.attendanceRecord.update({ where: { id: rec.id }, data: { checkIn: new Date(Date.now() - 2 * 3600_000) } });

      const outRes = await punch(kioskToken, { employeeNumber: emp.number, pin: '1234' }).expect(200);
      expect(outRes.body).toMatchObject({ action: 'OUT', employeeName: emp.name });
      const closed = await prisma.attendanceRecord.findUniqueOrThrow({ where: { id: rec.id } });
      expect(closed.checkOut!.toISOString()).toBe(outRes.body.time);
      expect(closed.workedMinutes).toBeGreaterThanOrEqual(119);
      expect(closed.flags).toEqual(['KIOSK']);

      // already checked out today → 409
      const again = await punch(kioskToken, { employeeNumber: emp.number, pin: '1234' }).expect(409);
      expect(again.body.messageAr).toBe('تم تسجيل الانصراف مسبقاً اليوم');
      // shows on the HR board with the KIOSK flag
      const board = await http.get('/api/attendance').query({ date: todayStr() }).set(auth(ownerToken)).expect(200);
      const rows = Array.isArray(board.body) ? board.body : board.body.data ?? board.body.rows;
      expect(rows.find((r: { employeeId: string }) => r.employeeId === emp.id).flags).toContain('KIOSK');
    });

    it('late minutes use the same attendance computation as ESS (roster shift)', async () => {
      const emp = await employeeWithPin('2468');
      const shift = await http
        .post('/api/shifts')
        .set(auth(ownerToken))
        .send({ branchId: otherBranchId, name: 'صباحية', startTime: '00:00', endTime: '23:59', breakMinutes: 0, graceMinutes: 0, days: [0, 1, 2, 3, 4, 5, 6] })
        .expect(201);
      await prisma.shiftAssignment.create({ data: { companyId: shift.body.companyId, employeeId: emp.id, shiftId: shift.body.id, date: new Date(`${todayStr()}T00:00:00.000Z`) } });
      const res = await punch(kioskToken, { employeeNumber: emp.number, pin: '2468' }).expect(200);
      const rec = await prisma.attendanceRecord.findFirstOrThrow({ where: { employeeId: emp.id } });
      const expected = calculateAttendance({ startTime: '00:00', endTime: '23:59', breakMinutes: 0, graceMinutes: 0 }, rec.checkIn, null, 180);
      expect(rec.shiftId).toBe(shift.body.id);
      expect(res.body.lateMinutes).toBe(expected.lateMinutes);
      expect(rec.lateMinutes).toBe(expected.lateMinutes);
    });

    it('overnight shift: an open record from the previous day is closed as OUT', async () => {
      const emp = await employeeWithPin('1357');
      const night = await http
        .post('/api/shifts')
        .set(auth(ownerToken))
        .send({ branchId: otherBranchId, name: 'ليلية', startTime: '22:00', endTime: '06:00', breakMinutes: 0, graceMinutes: 15, days: [0, 1, 2, 3, 4, 5, 6] })
        .expect(201);
      const checkIn = new Date(Date.now() - 8 * 3600_000);
      const rec = await prisma.attendanceRecord.create({
        data: { companyId: night.body.companyId, employeeId: emp.id, date: addDays(todayStr(), -1), shiftId: night.body.id, checkIn, status: 'PRESENT', source: 'SELF' },
      });
      const res = await punch(kioskToken, { employeeNumber: emp.number, pin: '1357' }).expect(200);
      expect(res.body.action).toBe('OUT');
      const closed = await prisma.attendanceRecord.findUniqueOrThrow({ where: { id: rec.id } });
      expect(closed.checkOut).toBeTruthy();
      expect(closed.flags).toEqual(['KIOSK']);
      expect(await prisma.attendanceRecord.count({ where: { employeeId: emp.id } })).toBe(1);
    });

    it('employee number typed as digits only (or Arabic-Indic digits) matches EMP-xxxx', async () => {
      const emp = await employeeWithPin('8642');
      const digits = emp.number.replace(/\D/g, '').replace(/^0+/, '');
      const arabic = digits.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
      const res = await punch(kioskToken, { employeeNumber: arabic, pin: '٨٦٤٢' }).expect(200);
      expect(res.body.action).toBe('IN');
    });
  });

  describe('brute force', () => {
    it('5 wrong PINs → locked: the 6th attempt gets 423 even with the right PIN; unlocks after 15 minutes', async () => {
      const emp = await employeeWithPin('1234');
      for (let i = 0; i < 5; i++) {
        const r = await punch(kioskToken, { employeeNumber: emp.number, pin: '0000' }).expect(401);
        expect(r.body.messageAr).toBe(MSG.invalid);
      }
      const locked = await punch(kioskToken, { employeeNumber: emp.number, pin: '1234' }).expect(423);
      expect(locked.body.messageAr).toBe(MSG.locked);
      expect(await prisma.attendanceRecord.count({ where: { employeeId: emp.id } })).toBe(0);
      const row = await prisma.employee.findUniqueOrThrow({ where: { id: emp.id } });
      const lockMs = row.kioskLockedUntil!.getTime() - Date.now();
      expect(lockMs).toBeGreaterThan(14 * 60_000);
      expect(lockMs).toBeLessThanOrEqual(15 * 60_000);
      expect((await http.get(`/api/employees/${emp.id}/kiosk-pin`).set(auth(ownerToken)).expect(200)).body.lockedUntil).toBeTruthy();
      // HR is notified
      const notes = await prisma.notification.findMany({ where: { title: { contains: 'رمز الحضور' }, body: { contains: emp.name } } });
      expect(notes.length).toBeGreaterThan(0);

      // 16 minutes later
      await prisma.employee.update({ where: { id: emp.id }, data: { kioskLockedUntil: new Date(Date.now() - 60_000), kioskFirstFailAt: new Date(Date.now() - 16 * 60_000) } });
      await punch(kioskToken, { employeeNumber: emp.number, pin: '1234' }).expect(200);
      const reset = await prisma.employee.findUniqueOrThrow({ where: { id: emp.id } });
      expect(reset).toMatchObject({ kioskFailCount: 0, kioskFirstFailAt: null, kioskLockedUntil: null });
    });

    it('the count restarts when the first failure is older than 15 minutes, and resets on success', async () => {
      const emp = await employeeWithPin('1234');
      for (let i = 0; i < 4; i++) await punch(kioskToken, { employeeNumber: emp.number, pin: '9999' }).expect(401);
      await prisma.employee.update({ where: { id: emp.id }, data: { kioskFirstFailAt: new Date(Date.now() - 16 * 60_000) } });
      await punch(kioskToken, { employeeNumber: emp.number, pin: '9999' }).expect(401);
      expect((await prisma.employee.findUniqueOrThrow({ where: { id: emp.id } })).kioskFailCount).toBe(1);
      for (let i = 0; i < 3; i++) await punch(kioskToken, { employeeNumber: emp.number, pin: '9999' }).expect(401);
      await punch(kioskToken, { employeeNumber: emp.number, pin: '1234' }).expect(200);
      expect((await prisma.employee.findUniqueOrThrow({ where: { id: emp.id } })).kioskFailCount).toBe(0);
    });

    it('parallel wrong PINs cannot slip past the lock', async () => {
      const emp = await employeeWithPin('1234');
      const results = await Promise.all(Array.from({ length: 8 }, () => punch(kioskToken, { employeeNumber: emp.number, pin: '5555' })));
      expect(results.filter((r) => r.status === 401)).toHaveLength(5);
      expect(results.filter((r) => r.status === 423)).toHaveLength(3);
    });

    it('unknown employee number → the same 401 as a wrong PIN, and never locks (existence is not revealed)', async () => {
      const emp = await employeeWithPin('1234');
      const wrong = await punch(kioskToken, { employeeNumber: emp.number, pin: '0001' }).expect(401);
      const results = [];
      for (let i = 0; i < 7; i++) results.push(await punch(kioskToken, { employeeNumber: `EMP-9${stamp % 1000}${i}`, pin: '1234' }));
      for (const r of results) {
        expect(r.status).toBe(401);
        expect(r.body).toEqual(wrong.body);
      }
      expect(wrong.body.messageAr).toBe(MSG.invalid);
    });

    it('an employee of another branch → the same 401 and their PIN is never locked from this kiosk', async () => {
      const emp = await employeeWithPin('1234', otherBranchId);
      const wrong = await punch(kioskToken, { employeeNumber: emp.number, pin: '0001' }).expect(401);
      for (let i = 0; i < 6; i++) {
        const r = await punch(kioskToken, { employeeNumber: emp.number, pin: '1234' }).expect(401);
        expect(r.body).toEqual(wrong.body);
      }
      const row = await prisma.employee.findUniqueOrThrow({ where: { id: emp.id } });
      expect(row).toMatchObject({ kioskFailCount: 0, kioskLockedUntil: null });
      expect(await prisma.attendanceRecord.count({ where: { employeeId: emp.id } })).toBe(0);
    });

    it('an employee without a PIN, or a terminated employee → the same 401', async () => {
      const noPin = await createEmployee({ login: false });
      const ref = await punch(kioskToken, { employeeNumber: 'EMP-NOPE', pin: '1234' }).expect(401);
      expect((await punch(kioskToken, { employeeNumber: noPin.number, pin: '1234' }).expect(401)).body).toEqual(ref.body);
      const gone = await employeeWithPin('1234');
      await prisma.employee.update({ where: { id: gone.id }, data: { status: 'TERMINATED', terminationDate: new Date() } });
      expect((await punch(kioskToken, { employeeNumber: gone.number, pin: '1234' }).expect(401)).body).toEqual(ref.body);
    });

    it('HR setting a new PIN clears the lock', async () => {
      const emp = await employeeWithPin('1234');
      for (let i = 0; i < 5; i++) await punch(kioskToken, { employeeNumber: emp.number, pin: '0000' }).expect(401);
      await punch(kioskToken, { employeeNumber: emp.number, pin: '1234' }).expect(423);
      await http.post(`/api/employees/${emp.id}/kiosk-pin`).set(auth(ownerToken)).send({ pin: '4321' }).expect(200);
      await punch(kioskToken, { employeeNumber: emp.number, pin: '4321' }).expect(200);
    });
  });

  describe('revoke and the branch-code setting', () => {
    it('a fresh company cannot require the branch code until a kiosk is paired; revoking the last kiosk turns it off', async () => {
      const reg = await http
        .post('/api/auth/register')
        .send({ companyNameAr: 'شركة بلا أجهزة', sector: 'RETAIL', ownerName: 'مالك', email: `kiosknone${stamp}@test.sa`, password: 'Passw0rd!' })
        .expect(201);
      const owner = reg.body.accessToken as string;
      expect((await http.get('/api/company').set(auth(owner)).expect(200)).body.activeKiosks).toBe(0);
      const denied = await http.patch('/api/company').set(auth(owner)).send({ requireBranchCode: true }).expect(400);
      expect(denied.body.messageAr).toBe(MSG.needKiosk);
      await http.patch('/api/company').set(auth(owner)).send({ requireBranchCode: false }).expect(200);

      const b = await http.post('/api/branches').set(auth(owner)).send({ nameAr: 'الفرع الرئيسي', city: 'جدة', lat: 21.5, lng: 39.2 }).expect(201);
      const k = await http.post(`/api/branches/${b.body.id}/kiosks`).set(auth(owner)).send({ name: 'جهاز' }).expect(201);
      expect((await http.get('/api/company').set(auth(owner)).expect(200)).body.activeKiosks).toBe(1);
      expect((await http.patch('/api/company').set(auth(owner)).send({ requireBranchCode: true }).expect(200)).body.requireBranchCode).toBe(true);

      const revoked = await http.delete(`/api/kiosks/${k.body.id}`).set(auth(owner)).expect(200);
      expect(revoked.body).toEqual({ ok: true, requireBranchCodeDisabled: true });
      expect((await http.get('/api/company').set(auth(owner)).expect(200)).body).toMatchObject({ requireBranchCode: false, activeKiosks: 0 });
      // revoked → the token stops working
      await http.get('/api/kiosk/me').set('X-Kiosk-Token', k.body.token).expect(401);
      await punch(k.body.token, { employeeNumber: '1', pin: '1234' }).expect(401);
      expect((await http.delete(`/api/kiosks/${k.body.id}`).set(auth(owner)).expect(200)).body).toEqual({ ok: true, requireBranchCodeDisabled: false });
    });

    it('a revoked kiosk is listed as revoked and its punches are refused', async () => {
      const paired = await http.post(`/api/branches/${branchId}/kiosks`).set(auth(ownerToken)).send({ name: 'مؤقت' }).expect(201);
      const emp = await employeeWithPin('1234');
      await punch(paired.body.token, { employeeNumber: emp.number, pin: '1234' }).expect(200);
      await http.delete(`/api/kiosks/${paired.body.id}`).set(auth(ownerToken)).expect(200);
      const r = await punch(paired.body.token, { employeeNumber: emp.number, pin: '1234' }).expect(401);
      expect(r.body.code).toBe('KIOSK_TOKEN_INVALID');
      const list = await http.get(`/api/branches/${branchId}/kiosks`).set(auth(ownerToken)).expect(200);
      expect(list.body.find((x: { id: string }) => x.id === paired.body.id).revokedAt).toBeTruthy();
    });
  });
});
