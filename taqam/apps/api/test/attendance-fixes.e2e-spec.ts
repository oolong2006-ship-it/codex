import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { addDays, dayStr, riyadhDateTime, todayStr } from '../src/common/dates';

/** Valid Saudi IBAN for a bank code + 18-digit account (mod-97). */
function iban(bank: string, account: string) {
  const bban = bank + account;
  let rem = 0;
  for (const ch of bban + '281000') rem = (rem * 10 + Number(ch)) % 97;
  return `SA${String(98 - rem).padStart(2, '0')}${bban}`;
}

/** Fake only the clock (Date / Date.now); real timers keep Nest, Prisma and supertest working. */
function freezeClock(at: Date) {
  jest.useFakeTimers({
    now: at,
    doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
  });
}

describe('Attendance review fixes (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const stamp = Date.now();
  const BRANCH = { lat: 24.6948, lng: 46.6853 };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  let ownerToken = '';
  let branchId = '';

  async function createEmployee(n: number, nationalId: string) {
    const emp = await http
      .post('/api/employees')
      .set(auth(ownerToken))
      .send({
        firstNameAr: 'موظف',
        lastNameAr: `رقم ${n}`,
        nationality: 'SA',
        gender: 'MALE',
        nationalId,
        branchId,
        jobTitle: 'حارس',
        hireDate: '2022-01-01',
        basicSalary: 5000,
        iban: iban('10', `12345678901234567${n}`),
        createUser: { email: `att${n}-${stamp}@test.sa`, password: 'Passw0rd!' },
      })
      .expect(201);
    const login = await http.post('/api/auth/login').send({ email: `att${n}-${stamp}@test.sa`, password: 'Passw0rd!' }).expect(200);
    return { id: emp.body.id as string, token: login.body.accessToken as string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication(), { swagger: false });
    await app.init();
    http = request(app.getHttpServer());
    await app.get(PrismaService).platformSettings.upsert({ where: { id: 1 }, update: { requireApproval: false }, create: { id: 1, requireApproval: false } });

    const reg = await http
      .post('/api/auth/register')
      .send({ companyNameAr: 'شركة الحراسة', sector: 'RESTAURANTS', ownerName: 'مالك', email: `attowner${stamp}@test.sa`, password: 'Passw0rd!' })
      .expect(201);
    ownerToken = reg.body.accessToken;
    const branch = await http.post('/api/branches').set(auth(ownerToken)).send({ nameAr: 'فرع الليل', city: 'الرياض', ...BRANCH, radiusMeters: 150 }).expect(201);
    branchId = branch.body.id;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  afterAll(async () => {
    await app.get(PrismaService).$disconnect();
    await app.close();
  });

  it('overnight shift: check-out after midnight closes the previous day record', async () => {
    await http
      .post('/api/shifts')
      .set(auth(ownerToken))
      .send({ branchId, name: 'ليلية', startTime: '22:00', endTime: '06:00', breakMinutes: 0, graceMinutes: 10, days: [0, 1, 2, 3, 4, 5, 6] })
      .expect(201);
    const emp = await createEmployee(1, '1098765432');

    const D = dayStr(addDays(todayStr(), -2))!;
    const D1 = dayStr(addDays(D, 1))!;

    freezeClock(riyadhDateTime(D, '21:55'));
    const inRes = await http.post('/api/me/attendance/check-in').set(auth(emp.token)).send(BRANCH).expect(200);
    expect(dayStr(inRes.body.date)).toBe(D);

    freezeClock(riyadhDateTime(D1, '06:05'));
    const out = await http.post('/api/me/attendance/check-out').set(auth(emp.token)).send(BRANCH).expect(200);
    expect(out.body.id).toBe(inRes.body.id);
    expect(dayStr(out.body.date)).toBe(D);
    expect(out.body.checkOut).toBe(riyadhDateTime(D1, '06:05').toISOString());
    expect(out.body.workedMinutes).toBeGreaterThanOrEqual(485);
    expect(out.body.workedMinutes).toBeLessThanOrEqual(495);

    const recs = await app.get(PrismaService).attendanceRecord.findMany({ where: { employeeId: emp.id } });
    expect(recs).toHaveLength(1);
  });

  it('PATCH {note} on an ABSENT record keeps it ABSENT', async () => {
    const emp = await createEmployee(2, '1087654321');
    const date = dayStr(addDays(todayStr(), -3))!;
    const rec = await http
      .post('/api/attendance/manual')
      .set(auth(ownerToken))
      .send({ employeeId: emp.id, date, status: 'ABSENT' })
      .expect(201);
    expect(rec.body.status).toBe('ABSENT');

    const res = await http.patch(`/api/attendance/${rec.body.id}`).set(auth(ownerToken)).send({ note: 'غياب بعذر طبي' }).expect(200);
    expect(res.body).toMatchObject({ status: 'ABSENT', note: 'غياب بعذر طبي', checkIn: null, checkOut: null });
  });
});
