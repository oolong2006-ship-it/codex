import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { addDays, dayStr, todayStr, weekday } from '../src/common/dates';

/** Valid Saudi IBAN for a bank code + 18-digit account (mod-97). */
function iban(bank: string, account: string) {
  const bban = bank + account;
  let rem = 0;
  for (const ch of bban + '281000') rem = (rem * 10 + Number(ch)) % 97;
  return `SA${String(98 - rem).padStart(2, '0')}${bban}`;
}

/** Next Sunday on/after `from` (Riyadh calendar) — a working day with weekend Fri/Sat. */
function nextSunday(offsetWeeks = 1) {
  const t = todayStr();
  return addDays(t, ((7 - weekday(t)) % 7) + 7 * offsetWeeks);
}

describe('Shuoon API (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const stamp = Date.now();
  const BRANCH = { lat: 24.6948, lng: 46.6853 };

  let tokenA = '';
  let tokenB = '';
  let employeeId = '';
  let employeeToken = '';
  let branchId = '';

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication(), { swagger: false });
    await app.init();
    http = request(app.getHttpServer());
    // Self-serve signups start as TRIAL here (approval flow is covered in admin.e2e-spec.ts).
    await app.get(PrismaService).platformSettings.upsert({ where: { id: 1 }, update: { requireApproval: false }, create: { id: 1, requireApproval: false } });
  });

  afterAll(async () => {
    await app.get(PrismaService).$disconnect();
    await app.close();
  });

  it('GET /api/health', async () => {
    await http.get('/api/health').expect(200, { status: 'ok', db: 'up' });
  });

  it('register → login → me', async () => {
    const reg = await http
      .post('/api/auth/register')
      .send({ companyNameAr: 'شركة ألف', companyNameEn: 'Alef Co', sector: 'RESTAURANTS', ownerName: 'مالك ألف', email: `a${stamp}@test.sa`, password: 'Passw0rd!' })
      .expect(201);
    expect(reg.body.accessToken).toBeTruthy();
    expect(reg.body.user).toMatchObject({ role: 'OWNER', employeeId: null, branchId: null });
    expect(reg.body.company).toMatchObject({ nameAr: 'شركة ألف', nameEn: 'Alef Co', status: 'TRIAL' });

    const login = await http.post('/api/auth/login').send({ email: `A${stamp}@test.sa`, password: 'Passw0rd!' }).expect(200);
    tokenA = login.body.accessToken;

    const me = await http.get('/api/auth/me').set(auth(tokenA)).expect(200);
    expect(me.body).toMatchObject({ email: `a${stamp}@test.sa`, role: 'OWNER', company: { nameAr: 'شركة ألف' } });

    const types = await http.get('/api/leave-types').set(auth(tokenA)).expect(200);
    expect(types.body.map((t: { code: string }) => t.code)).toEqual(expect.arrayContaining(['ANNUAL', 'SICK', 'UNPAID']));

    await http.post('/api/auth/login').send({ email: `a${stamp}@test.sa`, password: 'wrong-pass' }).expect(401);
    await http.get('/api/employees').expect(401);
  });

  it('validation errors use the standard error shape', async () => {
    const res = await http.post('/api/auth/register').send({ email: 'not-an-email' }).expect(400);
    expect(res.body.statusCode).toBe(400);
    expect(typeof res.body.message).toBe('string');
    expect(res.body.messageAr).toBeTruthy();
  });

  it('creates branch, department and employee (with login)', async () => {
    await http
      .patch('/api/company')
      .set(auth(tokenA))
      .send({ establishmentId: '7001112223', iban: iban('80', '000000608010167519'), weekendDays: [5, 6] })
      .expect(200);

    const branch = await http.post('/api/branches').set(auth(tokenA)).send({ nameAr: 'فرع العليا', city: 'الرياض', ...BRANCH, radiusMeters: 150 }).expect(201);
    branchId = branch.body.id;
    const dept = await http.post('/api/departments').set(auth(tokenA)).send({ name: 'المطبخ' }).expect(201);
    await http
      .post('/api/shifts')
      .set(auth(tokenA))
      .send({ branchId, name: 'صباحية', startTime: '08:00', endTime: '16:00', breakMinutes: 60, graceMinutes: 10, days: [0, 1, 2, 3, 4, 5, 6] })
      .expect(201);

    const emp = await http
      .post('/api/employees')
      .set(auth(tokenA))
      .send({
        firstNameAr: 'سعود',
        lastNameAr: 'الدوسري',
        fullNameEn: 'Saud Al-Dosari',
        nationality: 'SA',
        gender: 'MALE',
        nationalId: '1012345678',
        phone: '+966500000000',
        branchId,
        departmentId: dept.body.id,
        jobTitle: 'مشرف صالة',
        hireDate: '2022-01-01',
        basicSalary: 6000,
        housingAllowance: 1500,
        transportAllowance: 600,
        iban: iban('10', '123456789012345678'),
        annualLeaveCarryOver: 6,
        createUser: { email: `emp${stamp}@test.sa`, password: 'Passw0rd!' },
      })
      .expect(201);
    employeeId = emp.body.id;
    expect(emp.body).toMatchObject({ employeeNumber: 'EMP-0001', isSaudi: true, basicSalary: 6000, hireDate: '2022-01-01', bankCode: '10', branch: { nameAr: 'فرع العليا' } });

    const detail = await http.get(`/api/employees/${employeeId}`).set(auth(tokenA)).expect(200);
    expect(detail.body.leaveBalance).toMatchObject({ entitlementPerYear: 21 });
    expect(detail.body.user).toMatchObject({ role: 'EMPLOYEE' });

    const list = await http.get('/api/employees?search=سعود&nationality=SA').set(auth(tokenA)).expect(200);
    expect(list.body).toMatchObject({ total: 1, page: 1, pageSize: 20 });

    await http.post('/api/employees').set(auth(tokenA)).send({ firstNameAr: 'x', lastNameAr: 'y', nationality: 'SA', gender: 'MALE', nationalId: '1000000000', hireDate: '2024-01-01', basicSalary: 1, iban: 'SA00123' }).expect(400);

    const login = await http.post('/api/auth/login').send({ email: `emp${stamp}@test.sa`, password: 'Passw0rd!' }).expect(200);
    employeeToken = login.body.accessToken;
    expect(login.body.user).toMatchObject({ role: 'EMPLOYEE', employeeId, branchId });
  });

  it('tenant isolation: company B cannot read company A employee (404)', async () => {
    const reg = await http
      .post('/api/auth/register')
      .send({ companyNameAr: 'شركة باء', sector: 'RETAIL', ownerName: 'مالك باء', email: `b${stamp}@test.sa`, password: 'Passw0rd!' })
      .expect(201);
    tokenB = reg.body.accessToken;
    await http.get(`/api/employees/${employeeId}`).set(auth(tokenB)).expect(404);
    await http.patch(`/api/employees/${employeeId}`).set(auth(tokenB)).send({ jobTitle: 'hacked' }).expect(404);
    const list = await http.get('/api/employees').set(auth(tokenB)).expect(200);
    expect(list.body.total).toBe(0);
  });

  it('RBAC: EMPLOYEE gets 403 on staff endpoints but can use /me', async () => {
    await http.get('/api/employees').set(auth(employeeToken)).expect(403);
    await http.get('/api/payroll/runs').set(auth(employeeToken)).expect(403);
    await http.get('/api/dashboard').set(auth(employeeToken)).expect(403);
    await http.get('/api/leave-types').set(auth(employeeToken)).expect(200);
    const profile = await http.get('/api/me/profile').set(auth(employeeToken)).expect(200);
    expect(profile.body.id).toBe(employeeId);
    await http.get('/api/me/home').set(auth(employeeToken)).expect(200);
  });

  it('leave request → approve; balance & overlap validation', async () => {
    const types = await http.get('/api/leave-types').set(auth(tokenA)).expect(200);
    const annual = types.body.find((t: { code: string }) => t.code === 'ANNUAL');
    const start = nextSunday(1);
    const leave = await http
      .post('/api/leaves')
      .set(auth(tokenA))
      .send({ employeeId, leaveTypeId: annual.id, startDate: dayStr(start), endDate: dayStr(addDays(start, 1)), reason: 'سفر' })
      .expect(201);
    expect(leave.body).toMatchObject({ status: 'PENDING', days: 2, leaveType: { code: 'ANNUAL' } });

    const overlap = await http
      .post('/api/me/leaves')
      .set(auth(employeeToken))
      .send({ leaveTypeId: annual.id, startDate: dayStr(addDays(start, 1)), endDate: dayStr(addDays(start, 2)) })
      .expect(400);
    expect(overlap.body.messageAr).toBe('يوجد طلب إجازة متداخل مع هذه الفترة');

    const tooMuch = await http
      .post('/api/me/leaves')
      .set(auth(employeeToken))
      .send({ leaveTypeId: annual.id, startDate: dayStr(nextSunday(4)), endDate: dayStr(addDays(nextSunday(4), 60)) })
      .expect(400);
    expect(tooMuch.body.messageAr).toContain('رصيد الإجازة السنوية غير كافٍ');

    const approved = await http.post(`/api/leaves/${leave.body.id}/approve`).set(auth(tokenA)).send({ comment: 'موافق' }).expect(200);
    expect(approved.body).toMatchObject({ status: 'APPROVED', comment: 'موافق' });
    await http.post(`/api/leaves/${leave.body.id}/approve`).set(auth(tokenA)).send({}).expect(400);

    const mine = await http.get('/api/me/leaves').set(auth(employeeToken)).expect(200);
    expect(mine.body.data).toHaveLength(1);
    const bal = mine.body.balances.find((b: { code: string }) => b.code === 'ANNUAL');
    expect(bal.taken).toBe(2);

    const notifications = await http.get('/api/notifications').set(auth(employeeToken)).expect(200);
    expect(notifications.body.length).toBeGreaterThan(0);
    await http.post('/api/notifications/read-all').set(auth(employeeToken)).expect(200);
  });

  it('payroll run: create → calculate → approve → WPS csv', async () => {
    const period = todayStr().slice(0, 7);
    await http.post('/api/payroll/adjustments').set(auth(tokenA)).send({ employeeId, period, type: 'BONUS', amount: 500, note: 'تميز' }).expect(201);
    await http.post('/api/loans').set(auth(tokenA)).send({ employeeId, amount: 2000, monthlyDeduction: 500, startPeriod: period }).expect(201);

    const run = await http.post('/api/payroll/runs').set(auth(tokenA)).send({ period }).expect(201);
    expect(run.body.status).toBe('DRAFT');
    await http.post('/api/payroll/runs').set(auth(tokenA)).send({ period }).expect(409);

    const calc = await http.post(`/api/payroll/runs/${run.body.id}/calculate`).set(auth(tokenA)).expect(200);
    expect(calc.body.status).toBe('CALCULATED');
    expect(calc.body.payslips).toHaveLength(1);
    const slip = calc.body.payslips[0];
    expect(slip.employee).toMatchObject({ id: employeeId, employeeNumber: 'EMP-0001', isSaudi: true });
    expect(slip.earnings.map((e: { code: string }) => e.code)).toEqual(expect.arrayContaining(['BASIC', 'HOUSING', 'TRANSPORT', 'BONUS']));
    expect(slip.deductions.map((e: { code: string }) => e.code)).toEqual(expect.arrayContaining(['GOSI', 'LOAN']));
    expect(slip.gosiEmployee).toBe(731.25); // 9.75% × (6000 + 1500)
    expect(calc.body.totalNet).toBe(slip.net);

    const approved = await http.post(`/api/payroll/runs/${run.body.id}/approve`).set(auth(tokenA)).expect(200);
    expect(approved.body.status).toBe('APPROVED');
    const loans = await http.get('/api/loans').set(auth(tokenA)).expect(200);
    expect(loans.body[0].remaining).toBe(1500);
    await http.delete(`/api/payroll/runs/${run.body.id}`).set(auth(tokenA)).expect(400);

    const wps = await http.get(`/api/payroll/runs/${run.body.id}/wps`).set(auth(tokenA)).expect(200);
    expect(wps.headers['content-type']).toContain('text/csv');
    const lines = wps.text.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('7001112223');
    expect(lines[1]).toContain('EMP-0001');
    const v = await http.get(`/api/payroll/runs/${run.body.id}/wps?validate=1`).set(auth(tokenA)).expect(200);
    expect(v.body.errors).toEqual([]);

    await http.post(`/api/payroll/runs/${run.body.id}/mark-paid`).set(auth(tokenA)).expect(200);
    const myslips = await http.get('/api/me/payslips').set(auth(employeeToken)).expect(200);
    expect(myslips.body[0]).toMatchObject({ period, status: 'PAID' });
    await http.get(`/api/me/payslips/${myslips.body[0].id}`).set(auth(employeeToken)).expect(200);

    // other tenant cannot see the run
    await http.get(`/api/payroll/runs/${run.body.id}`).set(auth(tokenB)).expect(404);
  });

  it('check-in outside geofence → 400; inside → 200; twice → 409', async () => {
    const out = await http.post('/api/me/attendance/check-in').set(auth(employeeToken)).send({ lat: 24.75, lng: 46.75 }).expect(400);
    expect(out.body.messageAr).toBe('أنت خارج نطاق الفرع');
    await http.post('/api/me/attendance/check-in').set(auth(employeeToken)).send({ lat: BRANCH.lat + 0.0003, lng: BRANCH.lng }).expect(200);
    await http.post('/api/me/attendance/check-in').set(auth(employeeToken)).send(BRANCH).expect(409);
    const board = await http.get('/api/attendance').set(auth(tokenA)).expect(200);
    expect(board.body[0]).toMatchObject({ employeeId, shiftName: 'صباحية' });
    expect(board.body[0].checkIn).toBeTruthy();
  });

  it('BRANCH_MANAGER is scoped to own branch; approves requests (LOAN → Loan, ATTENDANCE_CORRECTION → record)', async () => {
    const b2 = await http.post('/api/branches').set(auth(tokenA)).send({ nameAr: 'فرع جدة', city: 'جدة', lat: 21.54, lng: 39.15 }).expect(201);
    const base = { lastNameAr: 'الاختبار', nationality: 'EG', gender: 'MALE', nationalId: '2012345678', hireDate: '2021-05-01', basicSalary: 3000 };
    const other = await http.post('/api/employees').set(auth(tokenA)).send({ ...base, firstNameAr: 'جداوي', branchId: b2.body.id }).expect(201);
    const mgrEmp = await http.post('/api/employees').set(auth(tokenA)).send({ ...base, firstNameAr: 'مدير', nationalId: '1099999999', nationality: 'SA', branchId }).expect(201);
    await http.post('/api/users').set(auth(tokenA)).send({ email: `mgr${stamp}@test.sa`, name: 'مدير الفرع', role: 'BRANCH_MANAGER', password: 'Passw0rd!', employeeId: mgrEmp.body.id }).expect(201);
    const mgr = (await http.post('/api/auth/login').send({ email: `mgr${stamp}@test.sa`, password: 'Passw0rd!' }).expect(200)).body.accessToken;

    const list = await http.get('/api/employees').set(auth(mgr)).expect(200);
    expect(list.body.data.every((e: { branchId: string }) => e.branchId === branchId)).toBe(true);
    await http.get(`/api/employees/${other.body.id}`).set(auth(mgr)).expect(404);
    await http.post('/api/employees').set(auth(mgr)).send({ ...base, firstNameAr: 'x' }).expect(403);

    const loanReq = await http.post('/api/me/requests').set(auth(employeeToken)).send({ type: 'LOAN', title: 'سلفة', amount: 1200, payload: { months: 4 } }).expect(201);
    // loan approval is reserved for HR / payroll (review #11): the branch manager is refused, the owner approves
    await http.post(`/api/requests/${loanReq.body.id}/approve`).set(auth(mgr)).send({ comment: 'ok' }).expect(403);
    const approved = await http.post(`/api/requests/${loanReq.body.id}/approve`).set(auth(tokenA)).send({ comment: 'ok' }).expect(200);
    expect(approved.body.status).toBe('APPROVED');
    const loans = await http.get('/api/loans').set(auth(tokenA)).expect(200);
    expect(loans.body.find((l: { id: string }) => l.id === approved.body.loanId)).toMatchObject({ amount: 1200, monthlyDeduction: 300, remaining: 1200 });

    const date = dayStr(addDays(todayStr(), -2))!;
    const corr = await http.post('/api/me/requests').set(auth(employeeToken)).send({ type: 'ATTENDANCE_CORRECTION', title: 'نسيت البصمة', payload: { date, checkIn: '08:30', checkOut: '16:10' } }).expect(201);
    await http.post(`/api/requests/${corr.body.id}/approve`).set(auth(mgr)).send({}).expect(200);
    const att = await http.get(`/api/me/attendance?month=${date.slice(0, 7)}`).set(auth(employeeToken)).expect(200);
    const rec = att.body.find((r: { date: string }) => r.date === date);
    expect(rec).toMatchObject({ lateMinutes: 20, status: 'LATE' });

    const eosb = await http.get(`/api/employees/${other.body.id}/eosb?reason=RESIGNATION&endDate=2026-05-01`).set(auth(tokenA)).expect(200);
    expect(eosb.body.factor).toBeCloseTo(2 / 3); // exactly 5 years of service, resignation (Art. 85)
    const term = await http.post(`/api/employees/${other.body.id}/terminate`).set(auth(tokenA)).send({ terminationDate: dayStr(todayStr()), reason: 'EMPLOYER_TERMINATION' }).expect(201);
    expect(term.body.employee.status).toBe('TERMINATED');
    expect(term.body.eosb.total).toBeGreaterThan(0);
  });

  it('audit log records mutations', async () => {
    const logs = await http.get('/api/audit-logs?pageSize=100').set(auth(tokenA)).expect(200);
    const actions = logs.body.data.map((l: { action: string; entity: string }) => `${l.action}:${l.entity}`);
    expect(actions).toEqual(expect.arrayContaining(['CREATE:Employee', 'APPROVE:LeaveRequest', 'CALCULATE:PayrollRun', 'APPROVE:PayrollRun', 'CHECK_IN:AttendanceRecord']));
  });
});
