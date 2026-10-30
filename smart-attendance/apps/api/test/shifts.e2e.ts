import { INestApplication } from '@nestjs/common';
import { Session, bearer, bootApp, employeeIdByEmail, http, login, freshTenantAdmin } from './helpers';

/** الورديات: القوالب، والتعيين بلا تداخل، وتقرير الأيام المجدولة، والنطاق، والتصدير (phase-2 §4). */
describe('shifts and the shift report', () => {
  let app: INestApplication;
  let admin: Session;
  let managerOwn: Session;
  let managerOther: Session;
  let employee: Session;
  let templateId: string;
  let emp2Id: string;

  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString().slice(0, 10);

  beforeAll(async () => {
    app = await bootApp();
    admin = await freshTenantAdmin(app, 'tenant-b', 'shifts');
    managerOwn = await login(app, 'manager2@b.dev'); // فرع BR-2 يضم emp2@b
    managerOther = await login(app, 'manager1@b.dev'); // فرع BR-1
    employee = await login(app, 'emp3@b.dev');
    emp2Id = await employeeIdByEmail('emp2@b.dev');
  });
  afterAll(() => app.close());

  it('a template keeps local times and weekdays; malformed times are refused', async () => {
    const bad = await http(app).post('/v1/shift-templates').set(bearer(admin)).send({ name: 'خاطئة', start_time: '25:00', end_time: '06:00', days: [1] });
    expect(bad.status).toBe(400);

    // التكرار مرفوض صراحة (الترتيب غير مهم).
    const dup = await http(app).post('/v1/shift-templates').set(bearer(admin)).send({ name: 'مكررة', start_time: '08:00', end_time: '16:00', days: [1, 1] });
    expect(dup.status).toBe(400);

    const created = await http(app).post('/v1/shift-templates').set(bearer(admin)).send({ name: 'نهارية', start_time: '08:00', end_time: '16:00', days: [5, 1, 3] });
    expect(created.status).toBe(201);
    expect(created.body.days).toEqual([1, 3, 5]);
    templateId = created.body.id;
  });

  it('an employee cannot manage templates or read the report', async () => {
    expect((await http(app).post('/v1/shift-templates').set(bearer(employee)).send({ name: 'x', start_time: '08:00', end_time: '16:00', days: [1] })).status).toBe(403);
    expect((await http(app).get(`/v1/attendance/shift-report?from=${daysAgo(3)}&to=${daysAgo(1)}`).set(bearer(employee))).status).toBe(403);
  });

  it('an assignment is valid for its window and cannot overlap another one', async () => {
    const first = await http(app).post(`/v1/employees/${emp2Id}/shift-assignments`).set(bearer(admin)).send({ shift_template_id: templateId, valid_from: daysAgo(10) });
    expect(first.status).toBe(201);
    const overlap = await http(app).post(`/v1/employees/${emp2Id}/shift-assignments`).set(bearer(admin)).send({ shift_template_id: templateId, valid_from: daysAgo(5) });
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.code).toBe('SHIFT_OVERLAP');
    const reversed = await http(app).post(`/v1/employees/${emp2Id}/shift-assignments`).set(bearer(admin)).send({ shift_template_id: templateId, valid_from: daysAgo(1), valid_to: daysAgo(3) });
    expect(reversed.status).toBe(400);
  });

  it('the report marks scheduled days without any session as ABSENT, and today as not yet due', async () => {
    const res = await http(app).get(`/v1/attendance/shift-report?from=${daysAgo(7)}&to=${daysAgo(0)}&employee_id=${emp2Id}`).set(bearer(admin));
    expect(res.status).toBe(200);
    const past = res.body.rows.filter((r: { date: string }) => r.date < daysAgo(0));
    expect(past.length).toBeGreaterThan(0);
    expect(past.every((r: { outcome: string }) => r.outcome === 'ABSENT')).toBe(true);
    const today = res.body.rows.filter((r: { date: string }) => r.date === daysAgo(0));
    expect(today.every((r: { outcome: string }) => ['NOT_DUE', 'ABSENT'].includes(r.outcome))).toBe(true);
    expect(res.body.summary.ABSENT).toBe(past.length);
    expect(res.body.timezone).toBe('Asia/Riyadh');
  });

  it('a branch manager sees only the employees of the branch', async () => {
    const own = await http(app).get(`/v1/attendance/shift-report?from=${daysAgo(3)}&to=${daysAgo(1)}`).set(bearer(managerOwn));
    expect(own.body.rows.map((r: { employee_number: string }) => r.employee_number)).toContain('B-0006');
    const other = await http(app).get(`/v1/attendance/shift-report?from=${daysAgo(3)}&to=${daysAgo(1)}`).set(bearer(managerOther));
    expect(other.body.rows.map((r: { employee_number: string }) => r.employee_number)).not.toContain('B-0006');
  });

  it('the range is validated and the CSV is UTF-8 with a BOM', async () => {
    expect((await http(app).get(`/v1/attendance/shift-report?from=${daysAgo(1)}&to=${daysAgo(3)}`).set(bearer(admin))).status).toBe(400);
    expect((await http(app).get('/v1/attendance/shift-report?from=2020-01-01&to=2020-12-31').set(bearer(admin))).status).toBe(400);
    expect((await http(app).get('/v1/attendance/shift-report?from=bad&to=2020-12-31').set(bearer(admin))).status).toBe(400);

    const csv = await http(app).get(`/v1/attendance/shift-report?from=${daysAgo(3)}&to=${daysAgo(1)}&format=csv`).set(bearer(admin));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.startsWith('﻿employee_number,full_name,shift,date,scheduled_start,scheduled_end,outcome')).toBe(true);
    expect(csv.text).toContain('ABSENT');
  });
});
