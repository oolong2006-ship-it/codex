import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { todayStr } from '../src/common/dates';

/** Valid Saudi IBAN for a bank code + 18-digit account (mod-97). */
function iban(bank: string, account: string) {
  const bban = bank + account;
  let rem = 0;
  for (const ch of bban + '281000') rem = (rem * 10 + Number(ch)) % 97;
  return `SA${String(98 - rem).padStart(2, '0')}${bban}`;
}

type Issue = { code: string; severity: string; employeeNumber: string | null; employeeId: string | null; messageAr: string };

/** Mudad / WPS pre-upload checker — spec §2. */
describe('WPS pre-upload checker (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const stamp = Date.now();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const period = '2026-08';
  let ownerToken = '';
  let employeeToken = '';
  let runId = '';
  const emp: Record<string, { id: string; employeeNumber: string }> = {};

  const create = async (key: string, n: number, extra: Record<string, unknown>) => {
    const res = await http
      .post('/api/employees')
      .set(auth(ownerToken))
      .send({
        firstNameAr: `موظف${n}`,
        lastNameAr: 'الاختبار',
        nationality: 'SA',
        gender: 'MALE',
        nationalId: `11${String(stamp).slice(-6)}${n}`,
        hireDate: '2020-01-01',
        basicSalary: 6000,
        housingAllowance: 1500,
        iban: iban('10', `${String(stamp).slice(-6)}0000000000${String(n).padStart(2, '0')}`),
        ...extra,
      })
      .expect(201);
    emp[key] = { id: res.body.id, employeeNumber: res.body.employeeNumber };
    return res.body;
  };
  const check = async (token = ownerToken) => (await http.get(`/api/payroll/runs/${runId}/wps-check`).set(auth(token)).expect(200)).body;
  const issuesFor = (body: { issues: Issue[] }, key: string) => body.issues.filter((i) => i.employeeNumber === emp[key].employeeNumber).map((i) => i.code);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication(), { swagger: false });
    await app.init();
    http = request(app.getHttpServer());
    await app.get(PrismaService).platformSettings.upsert({ where: { id: 1 }, update: { requireApproval: false }, create: { id: 1, requireApproval: false } });

    const reg = await http
      .post('/api/auth/register')
      .send({ companyNameAr: 'شركة مدد', sector: 'RETAIL', ownerName: 'مالك', email: `wpsowner${stamp}@test.sa`, password: 'Passw0rd!' })
      .expect(201);
    ownerToken = reg.body.accessToken;

    await create('clean', 1, { createUser: { email: `wpsemp${stamp}@test.sa`, password: 'Passw0rd!' } });
    await create('noIban', 2, { iban: null });
    await create('leftBefore', 3, {});
    await http.post(`/api/employees/${emp.leftBefore.id}/terminate`).set(auth(ownerToken)).send({ terminationDate: '2026-07-15', reason: 'RESIGNATION' }).expect(201);
    await create('leftMid', 4, {});
    await http.post(`/api/employees/${emp.leftMid.id}/terminate`).set(auth(ownerToken)).send({ terminationDate: '2026-08-15', reason: 'RESIGNATION' }).expect(201);
    await create('joinerMid', 5, { hireDate: '2026-08-16' });
    await create('unpaidLeave', 6, {});
    const types = await http.get('/api/leave-types').set(auth(ownerToken)).expect(200);
    const unpaid = types.body.find((t: { code: string }) => t.code === 'UNPAID');
    const leave = await http
      .post('/api/leaves')
      .set(auth(ownerToken))
      .send({ employeeId: emp.unpaidLeave.id, leaveTypeId: unpaid.id, startDate: '2026-08-10', endDate: '2026-08-11' })
      .expect(201);
    await http.post(`/api/leaves/${leave.body.id}/approve`).set(auth(ownerToken)).send({}).expect(200);
    // absence recorded in the period → ABSENCE wage-loss line
    await create('absent', 9, {});
    await http.post('/api/attendance/manual').set(auth(ownerToken)).send({ employeeId: emp.absent.id, date: '2026-08-12', status: 'ABSENT' }).expect(201);
    // sick leave past the first 30 full-pay days of the year → SICK wage-loss line in August
    await create('sick', 10, {});
    const sickType = types.body.find((t: { code: string }) => t.code === 'SICK');
    for (const [startDate, endDate] of [['2026-06-01', '2026-07-05'], ['2026-08-03', '2026-08-04']]) {
      const l = await http.post('/api/leaves').set(auth(ownerToken)).send({ employeeId: emp.sick.id, leaveTypeId: sickType.id, startDate, endDate }).expect(201);
      await http.post(`/api/leaves/${l.body.id}/approve`).set(auth(ownerToken)).send({}).expect(200);
    }

    const login = await http.post('/api/auth/login').send({ email: `wpsemp${stamp}@test.sa`, password: 'Passw0rd!' }).expect(200);
    employeeToken = login.body.accessToken;

    const run = await http.post('/api/payroll/runs').set(auth(ownerToken)).send({ period }).expect(201);
    runId = run.body.id;
  });

  afterAll(async () => {
    await app.get(PrismaService).$disconnect();
    await app.close();
  });

  it('refuses a DRAFT run (not calculated yet)', async () => {
    const res = await http.get(`/api/payroll/runs/${runId}/wps-check`).set(auth(ownerToken)).expect(400);
    expect(res.body.messageAr).toBe('يجب احتساب المسير أولاً');
  });

  it('flags a missing IBAN and an active employee excluded from the run; terminated-before-period is not missing', async () => {
    await http.post(`/api/payroll/runs/${runId}/calculate`).set(auth(ownerToken)).expect(200);
    // hired during the period but added after the run was calculated → active and missing from the run
    await create('lateAdded', 7, { hireDate: '2026-08-05' });
    // hired after the period → not expected in this run
    await create('futureHire', 8, { hireDate: '2026-09-01' });
    // left mid-period but has no payslip → still owed for the days worked → missing
    await create('leftMidNoSlip', 11, {});
    await http.post(`/api/employees/${emp.leftMidNoSlip.id}/terminate`).set(auth(ownerToken)).send({ terminationDate: '2026-08-20', reason: 'RESIGNATION' }).expect(201);
    // ON_LEAVE is still employed → required in the run
    await create('onLeave', 12, {});
    await app.get(PrismaService).employee.update({ where: { id: emp.onLeave.id }, data: { status: 'ON_LEAVE' } });

    const body = await check();
    expect(body.ready).toBe(false);
    expect(body.exportedAt).toBeNull();
    expect(body.period).toBe(period);
    expect(body.scheduledPaymentDate).toBe('2026-08-27');
    // not paid and the deadline (2026-09-07) has passed → checked against today (Riyadh)
    expect(body.paymentDate).toBe(todayStr());

    expect(body.issues).toContainEqual({
      code: 'INVALID_IBAN',
      severity: 'ERROR',
      employeeNumber: emp.noIban.employeeNumber,
      employeeId: emp.noIban.id,
      employeeName: 'موظف2 الاختبار',
      messageAr: 'رقم الآيبان غير صالح',
    });
    expect(body.issues).toContainEqual({
      code: 'EMPLOYEE_MISSING_FROM_RUN',
      severity: 'ERROR',
      employeeNumber: emp.lateAdded.employeeNumber,
      employeeId: emp.lateAdded.id,
      employeeName: 'موظف7 الاختبار',
      messageAr: 'موظف نشط غير موجود في المسير',
    });
    for (const key of ['leftMidNoSlip', 'onLeave']) expect(issuesFor(body, key)).toEqual(['EMPLOYEE_MISSING_FROM_RUN']);
    expect(body.issues).toContainEqual({
      code: 'LATE_PAYMENT', severity: 'WARNING', employeeNumber: null, employeeId: null, employeeName: null, messageAr: 'تاريخ الصرف متأخر عن نهاية الشهر بأكثر من 7 أيام',
    });
    expect(issuesFor(body, 'leftBefore')).toEqual([]);
    expect(issuesFor(body, 'futureHire')).toEqual([]);
    expect(issuesFor(body, 'clean')).toEqual([]);
    // prorated leaver (15/30) and joiner (15/30) are not underpaid; the unpaid-leave employee is fine too
    expect(issuesFor(body, 'leftMid')).toEqual([]);
    expect(issuesFor(body, 'joinerMid')).toEqual([]);
    expect(issuesFor(body, 'unpaidLeave')).toEqual([]);
    expect(body.errors).toBe(4);
    expect(body.warnings).toBe(1);
  });

  it('PAID_BELOW_CONTRACT uses the current contract and the run\'s recorded absence/unpaid leave', async () => {
    // contract raised after calculation: the run pays below contract — unless leave/absence explains it
    await http.patch(`/api/employees/${emp.clean.id}`).set(auth(ownerToken)).send({ basicSalary: 7000 }).expect(200);
    for (const key of ['unpaidLeave', 'absent', 'sick']) {
      await http.patch(`/api/employees/${emp[key].id}`).set(auth(ownerToken)).send({ basicSalary: 7000 }).expect(200);
    }
    const body = await check();
    expect(body.issues.filter((i: Issue) => i.employeeNumber === emp.clean.employeeNumber)).toEqual([
      expect.objectContaining({ code: 'PAID_BELOW_CONTRACT', severity: 'WARNING', messageAr: 'الأجر الأساسي المدفوع أقل من العقد دون غياب مسجل' }),
    ]);
    // the run recorded unpaid leave / absence / reduced-pay sick leave for these → legitimate
    const detail = await http.get(`/api/payroll/runs/${runId}`).set(auth(ownerToken)).expect(200);
    const lines = (key: string) => detail.body.payslips.find((p: { employee: { id: string } }) => p.employee.id === emp[key].id).deductions.map((d: { code: string }) => d.code);
    expect(lines('absent')).toContain('ABSENCE');
    expect(lines('sick')).toContain('SICK');
    for (const key of ['unpaidLeave', 'absent', 'sick']) expect(issuesFor(body, key)).toEqual([]);
    expect(body.warnings).toBe(2); // + LATE_PAYMENT
  });

  it('is limited to finance roles and to the caller\'s company', async () => {
    await http.get(`/api/payroll/runs/${runId}/wps-check`).set(auth(employeeToken)).expect(403);
    const other = await http
      .post('/api/auth/register')
      .send({ companyNameAr: 'شركة أخرى', sector: 'RETAIL', ownerName: 'مالك', email: `wpsother${stamp}@test.sa`, password: 'Passw0rd!' })
      .expect(201);
    await http.get(`/api/payroll/runs/${runId}/wps-check`).set(auth(other.body.accessToken)).expect(404);
  });

  it('a validate-only call does not stamp the export; downloading the file sets exportedAt', async () => {
    await http.get(`/api/payroll/runs/${runId}/wps?validate=1`).set(auth(ownerToken)).expect(400);
    expect((await check()).exportedAt).toBeNull();
    await http.get(`/api/payroll/runs/${runId}/wps`).set(auth(ownerToken)).expect(200);
    const body = await check();
    expect(body.exportedAt).not.toBeNull();
    expect(new Date(body.exportedAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('LATE_PAYMENT is a warning once the run is paid more than 7 days after the period end', async () => {
    // fix the blocking issues, recalculate, approve and mark paid today (well after 2026-09-07)
    await http.patch(`/api/employees/${emp.noIban.id}`).set(auth(ownerToken)).send({ iban: iban('10', '123456000000000099') }).expect(200);
    await http.post(`/api/payroll/runs/${runId}/calculate`).set(auth(ownerToken)).expect(200);
    // the earlier export no longer matches the recalculated run
    expect((await check()).exportedAt).toBeNull();
    await http.post(`/api/payroll/runs/${runId}/approve`).set(auth(ownerToken)).expect(200);
    await http.post(`/api/payroll/runs/${runId}/mark-paid`).set(auth(ownerToken)).expect(200);
    const late = [{ code: 'LATE_PAYMENT', severity: 'WARNING', employeeNumber: null, employeeId: null, employeeName: null, messageAr: 'تاريخ الصرف متأخر عن نهاية الشهر بأكثر من 7 أيام' }];
    const body = await check();
    expect(body.issues).toEqual(late);
    expect(body).toMatchObject({ errors: 0, warnings: 1, ready: true });

    // a raise after the run was paid is not an underpayment of that run (the calculation snapshot is the contract)
    await http.patch(`/api/employees/${emp.clean.id}`).set(auth(ownerToken)).send({ basicSalary: 9000 }).expect(200);
    expect((await check()).issues).toEqual(late);
  });

  it('an unpaid run before its deadline is checked against the scheduled payment day (no LATE_PAYMENT)', async () => {
    const future = await http.post('/api/payroll/runs').set(auth(ownerToken)).send({ period: '2099-12' }).expect(201);
    await http.post(`/api/payroll/runs/${future.body.id}/calculate`).set(auth(ownerToken)).expect(200);
    const body = (await http.get(`/api/payroll/runs/${future.body.id}/wps-check`).set(auth(ownerToken)).expect(200)).body;
    expect(body).toMatchObject({ paymentDate: '2099-12-27', scheduledPaymentDate: '2099-12-27' });
    expect(body.issues.map((i: Issue) => i.code)).not.toContain('LATE_PAYMENT');
  });
});
