import { describe, expect, it } from 'vitest';
import { demoFetch } from './client';
import { DB_VERSION } from './db';
import { addDays, todayStr } from './dates';

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const call = async (method: string, path: string, token: string | null, body?: unknown, query?: Record<string, unknown>) =>
  (await demoFetch(method, path, { token, body, query })) as { status: number; data: Body };
const login = async (email: string) => (await call('POST', '/auth/login', null, { email, password: 'Shuoon@2026' })).data;

/** Mudad / WPS pre-upload checker — mock parity with the API (spec §2). */
describe('demo mock: WPS pre-upload checker', () => {
  it('bumps the demo DB version for PayrollRun.wpsExportedAt', () => {
    expect(DB_VERSION).toBeGreaterThanOrEqual(10);
  });

  it('seeds one run with a WARNING and one clean run «جاهز للرفع»', async () => {
    const owner = await login('owner@shuoon.demo');
    const runs = (await call('GET', '/payroll/runs', owner.accessToken)).data as Body[];
    expect(runs.every((r) => 'wpsExportedAt' in r)).toBe(true);
    const checks: Body[] = [];
    for (const r of runs) {
      const c = await call('GET', `/payroll/runs/${r.id}/wps-check`, owner.accessToken);
      expect(c.status).toBe(200);
      checks.push(c.data);
    }
    expect(checks.some((c) => c.ready && c.warnings > 0 && c.issues.some((i: Body) => i.severity === 'WARNING'))).toBe(true);
    // the seeded example: 18 unpaid days → deductions over half the wage, net still positive
    const latestRun = (await call('GET', `/payroll/runs/${runs[0].id}`, owner.accessToken)).data;
    const over = (checks[0].issues as Body[]).filter((i) => i.code === 'DEDUCTION_OVER_HALF');
    expect(over).toHaveLength(1);
    const slip = (latestRun.payslips as Body[]).find((p) => p.employee.employeeNumber === over[0].employeeNumber)!;
    expect((slip.deductions as Body[]).find((d) => d.code === 'UNPAID_LEAVE')!.labelAr).toBe('إجازة بدون أجر (18 يوم)');
    expect(slip.net).toBeGreaterThan(0);
    expect(checks.some((c) => c.ready && c.issues.length === 0)).toBe(true);
    // seeded runs were already uploaded except the latest (approved, awaiting payment)
    const latest = runs[0];
    expect(checks[0].exportedAt).toBeNull();
    expect(latest.status).toBe('APPROVED');
    expect(checks.slice(1).every((c) => typeof c.exportedAt === 'string')).toBe(true);
  });

  it('same contract as the API: DRAFT → 400, missing IBAN and an excluded active employee are ERRORs, staff who left before the period are not missing', async () => {
    const owner = await login('owner@shuoon.demo');
    const employee = await login('employee@shuoon.demo');
    const noIban = (await call('POST', '/employees', owner.accessToken, {
      firstNameAr: 'بلا', lastNameAr: 'آيبان', nationality: 'SA', gender: 'MALE', nationalId: '1034567890', hireDate: '2020-01-01', basicSalary: 6000,
    })).data;
    const run = (await call('POST', '/payroll/runs', owner.accessToken, { period: '2031-03' })).data;
    const draft = await call('GET', `/payroll/runs/${run.id}/wps-check`, owner.accessToken);
    expect(draft.status).toBe(400);
    expect(draft.data.messageAr).toBe('يجب احتساب المسير أولاً');

    expect((await call('POST', `/payroll/runs/${run.id}/calculate`, owner.accessToken)).status).toBe(200);
    const late = (await call('POST', '/employees', owner.accessToken, {
      firstNameAr: 'منضم', lastNameAr: 'متأخر', nationality: 'SA', gender: 'MALE', nationalId: '1034567891', hireDate: '2031-03-10', basicSalary: 6000,
    })).data;
    await call('POST', '/employees', owner.accessToken, {
      firstNameAr: 'بعد', lastNameAr: 'الفترة', nationality: 'SA', gender: 'MALE', nationalId: '1034567892', hireDate: '2031-04-01', basicSalary: 6000,
    });
    // left mid-period without a payslip → still owed for the days worked → missing
    const leftMid = (await call('POST', '/employees', owner.accessToken, {
      firstNameAr: 'غادر', lastNameAr: 'منتصف', nationality: 'SA', gender: 'MALE', nationalId: '1034567894', hireDate: '2020-01-01', basicSalary: 6000,
    })).data;
    expect((await call('POST', `/employees/${leftMid.id}/terminate`, owner.accessToken, { terminationDate: '2031-03-20', reason: 'RESIGNATION' })).status).toBe(200);
    // ON_LEAVE (approved leave covering today) is still employed → required in the run
    const onLeave = (await call('POST', '/employees', owner.accessToken, {
      firstNameAr: 'في', lastNameAr: 'إجازة', nationality: 'SA', gender: 'MALE', nationalId: '1034567895', hireDate: '2020-01-01', basicSalary: 6000,
    })).data;
    const types = (await call('GET', '/leave-types', owner.accessToken)).data as Body[];
    const leave = await call('POST', '/leaves', owner.accessToken, { employeeId: onLeave.id, leaveTypeId: types.find((t) => t.code === 'UNPAID')!.id, startDate: todayStr(), endDate: addDays(todayStr(), 6) });
    expect(leave.status).toBe(201);
    await call('POST', `/leaves/${leave.data.id}/approve`, owner.accessToken, {});
    expect((await call('GET', `/employees/${onLeave.id}`, owner.accessToken)).data.status).toBe('ON_LEAVE');

    const c = await call('GET', `/payroll/runs/${run.id}/wps-check`, owner.accessToken);
    expect(c.status).toBe(200);
    expect(c.data).toMatchObject({ period: '2031-03', paymentDate: '2031-03-27', scheduledPaymentDate: '2031-03-27', exportedAt: null, ready: false, errors: 4, warnings: 0 });
    const missing = (e: Body, name: string) => ({ code: 'EMPLOYEE_MISSING_FROM_RUN', severity: 'ERROR', employeeNumber: e.employeeNumber, employeeId: e.id, employeeName: name, messageAr: 'موظف نشط غير موجود في المسير' });
    expect(c.data.issues).toEqual([
      { code: 'INVALID_IBAN', severity: 'ERROR', employeeNumber: noIban.employeeNumber, employeeId: noIban.id, employeeName: 'بلا آيبان', messageAr: 'رقم الآيبان غير صالح' },
      missing(late, 'منضم متأخر'), missing(leftMid, 'غادر منتصف'), missing(onLeave, 'في إجازة'),
    ]);
    // seeded leavers terminated before 2031-03 are never reported
    const list = (await call('GET', '/employees', owner.accessToken, undefined, { pageSize: 100, status: 'TERMINATED' })).data.data as Body[];
    const terminated = list.filter((e) => e.status === 'TERMINATED' && String(e.terminationDate) < '2031-03-01').map((e) => e.employeeNumber);
    expect(terminated.length).toBeGreaterThan(0);
    expect((c.data.issues as Body[]).some((i) => terminated.includes(i.employeeNumber))).toBe(false);

    expect((await call('GET', `/payroll/runs/${run.id}/wps-check`, employee.accessToken)).status).toBe(403);

    // validate-only does not stamp the export; downloading the file does
    expect((await call('GET', `/payroll/runs/${run.id}/wps`, owner.accessToken, undefined, { validate: 1 })).status).toBe(400);
    expect((await call('GET', `/payroll/runs/${run.id}/wps-check`, owner.accessToken)).data.exportedAt).toBeNull();
    expect((await call('GET', `/payroll/runs/${run.id}/wps`, owner.accessToken)).status).toBe(200);
    const after = (await call('GET', `/payroll/runs/${run.id}/wps-check`, owner.accessToken)).data;
    expect(typeof after.exportedAt).toBe('string');
    expect((await call('GET', `/payroll/runs/${run.id}`, owner.accessToken)).data.wpsExportedAt).toBe(after.exportedAt);
    // a recalculation clears it: the exported file no longer matches the run
    await call('POST', `/payroll/runs/${run.id}/calculate`, owner.accessToken);
    expect((await call('GET', `/payroll/runs/${run.id}/wps-check`, owner.accessToken)).data.exportedAt).toBeNull();
  }, 30000);

  it('LATE_PAYMENT before payment: an unpaid run past its deadline is checked against today', async () => {
    const owner = await login('owner@shuoon.demo');
    const run = (await call('POST', '/payroll/runs', owner.accessToken, { period: '2020-01' })).data;
    await call('POST', `/payroll/runs/${run.id}/calculate`, owner.accessToken);
    const c = (await call('GET', `/payroll/runs/${run.id}/wps-check`, owner.accessToken)).data;
    expect(c).toMatchObject({ paymentDate: todayStr(), scheduledPaymentDate: '2020-01-27' });
    expect((c.issues as Body[]).filter((i) => i.code === 'LATE_PAYMENT')).toEqual([
      { code: 'LATE_PAYMENT', severity: 'WARNING', employeeNumber: null, employeeId: null, employeeName: null, messageAr: 'تاريخ الصرف متأخر عن نهاية الشهر بأكثر من 7 أيام' },
    ]);
  });

  it('a mid-month joiner\'s prorated basic is not PAID_BELOW_CONTRACT; a raise after calculation is', async () => {
    const owner = await login('owner@shuoon.demo');
    const joiner = (await call('POST', '/employees', owner.accessToken, {
      firstNameAr: 'منضم', lastNameAr: 'منتصف', nationality: 'SA', gender: 'MALE', nationalId: '1034567893', hireDate: '2031-05-16', basicSalary: 6000,
      iban: 'SA0380000000608010167519',
    })).data;
    const run = (await call('POST', '/payroll/runs', owner.accessToken, { period: '2031-05' })).data;
    await call('POST', `/payroll/runs/${run.id}/calculate`, owner.accessToken);
    const mine = (b: Body, id: string) => (b.issues as Body[]).filter((i) => i.employeeId === id).map((i) => i.code);
    expect(mine((await call('GET', `/payroll/runs/${run.id}/wps-check`, owner.accessToken)).data, joiner.id)).toEqual([]);
    await call('PATCH', `/employees/${joiner.id}`, owner.accessToken, { basicSalary: 7000 });
    expect(mine((await call('GET', `/payroll/runs/${run.id}/wps-check`, owner.accessToken)).data, joiner.id)).toEqual(['PAID_BELOW_CONTRACT']);
    // recalculated, approved and paid: a later raise is not an underpayment of that run (the calculation snapshot is the contract)
    await call('POST', `/payroll/runs/${run.id}/calculate`, owner.accessToken);
    expect((await call('POST', `/payroll/runs/${run.id}/approve`, owner.accessToken)).status).toBe(200);
    expect((await call('POST', `/payroll/runs/${run.id}/mark-paid`, owner.accessToken)).status).toBe(200);
    await call('PATCH', `/employees/${joiner.id}`, owner.accessToken, { basicSalary: 9000 });
    expect(mine((await call('GET', `/payroll/runs/${run.id}/wps-check`, owner.accessToken)).data, joiner.id)).toEqual([]);
  });

  it('mock payroll counts UNPAID leave in calendar days, like the API engine', async () => {
    const owner = await login('owner@shuoon.demo');
    const e = (await call('POST', '/employees', owner.accessToken, {
      firstNameAr: 'إجازة', lastNameAr: 'بدون أجر', nationality: 'SA', gender: 'MALE', nationalId: '1034567896', hireDate: '2020-01-01', basicSalary: 6000,
      iban: 'SA0380000000608010167519',
    })).data;
    const types = (await call('GET', '/leave-types', owner.accessToken)).data as Body[];
    // Thu 2031-07-03 → Wed 2031-07-09: 7 calendar days spanning a weekend
    const leave = await call('POST', '/leaves', owner.accessToken, { employeeId: e.id, leaveTypeId: types.find((t) => t.code === 'UNPAID')!.id, startDate: '2031-07-03', endDate: '2031-07-09' });
    expect(leave.status).toBe(201);
    await call('POST', `/leaves/${leave.data.id}/approve`, owner.accessToken, {});
    const run = (await call('POST', '/payroll/runs', owner.accessToken, { period: '2031-07' })).data;
    const calc = (await call('POST', `/payroll/runs/${run.id}/calculate`, owner.accessToken)).data;
    const slip = (calc.payslips as Body[]).find((p) => p.employee.id === e.id)!;
    expect((slip.deductions as Body[]).find((d) => d.code === 'UNPAID_LEAVE')).toMatchObject({ labelAr: 'إجازة بدون أجر (7 يوم)', amount: 1400 }); // 6,000/30 × 7
  });
});
