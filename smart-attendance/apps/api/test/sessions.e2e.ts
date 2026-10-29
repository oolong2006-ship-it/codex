import { INestApplication } from '@nestjs/common';
import { Session, bearer, bootApp, deviceRegistration, http, issueCode, login, q, tenantId } from './helpers';
import { CENTER, metersNorth, punchClient } from './punch-client';

/** الجلسات والاستثناءات والتسويات وكشف CSV على بصمات حقيقية (phase-2 §3، §5، F17). */
describe('sessions, exceptions and monthly export', () => {
  let app: INestApplication;
  let admin: Session;
  let ses: Session;
  let managerOwn: Session;
  let managerOther: Session;
  let empId: string;
  let client: ReturnType<typeof punchClient>;

  beforeAll(async () => {
    app = await bootApp();
    admin = await login(app, 'admin@b.dev');
    const tenant = await tenantId('tenant-b');
    const branch = (await q<{ id: string }>("SELECT id FROM branches WHERE tenant_id = $1 AND code = 'BR-1'", [tenant]))[0]!.id;

    // موظف جديد للاختبار: لا يشارك حساباته مع اختبارات أخرى.
    const { hash } = await import('@node-rs/argon2');
    const inserted = await q<{ employee_id: string; user_id: string }>(
      `WITH e AS (INSERT INTO employees (tenant_id, employee_number, full_name, branch_id)
                  VALUES ($1, 'SES-1', 'موظف الجلسات', $2) RETURNING id),
            u AS (INSERT INTO user_accounts (tenant_id, employee_id, email, password_hash)
                  SELECT $1, e.id, 'ses1@b.dev', $3 FROM e RETURNING id, employee_id)
       INSERT INTO user_role_assignments (tenant_id, user_id, role_code)
       SELECT $1, u.id, 'employee' FROM u RETURNING user_id, user_id AS employee_id`,
      [tenant, branch, await hash(process.env.SEED_PASSWORD ?? 'Test-Only-Pass-123')],
    );
    expect(inserted).toHaveLength(1);
    empId = (await q<{ id: string }>("SELECT id FROM employees WHERE employee_number = 'SES-1'"))[0]!.id;

    ses = await login(app, 'ses1@b.dev');
    managerOwn = await login(app, 'manager1@b.dev');
    managerOther = await login(app, 'manager2@b.dev');

    const site = await http(app).post('/v1/work-locations').set(bearer(admin)).send({
      branch_id: branch,
      name: 'موقع الجلسات',
      code: 'SES-LOC',
      geofence: { kind: 'CIRCLE', center: CENTER, radius_m: 50 },
    });
    expect(site.status).toBe(201);
    expect((await http(app).post(`/v1/employees/${empId}/site-assignments`).set(bearer(admin)).send({ work_location_id: site.body.id })).status).toBe(201);

    const device = await deviceRegistration(app, ses, 'BIND');
    const bind = await http(app).post('/v1/devices/bind').set(bearer(ses)).send({ activation_code: await issueCode(app, admin, empId), device });
    expect(bind.status).toBe(201);
    client = punchClient(app, ses, device.key_id);
  });
  afterAll(() => app.close());

  it('an accepted clock-in opens a session; a rejected clock-out does not close it', async () => {
    const inside = await client.send(await client.signed({ type: 'CLOCK_IN' }));
    expect(inside.body.decision).toBe('VERIFIED');
    const outside = await client.send(await client.signed({ type: 'CLOCK_OUT', at: metersNorth(500) }));
    expect(outside.body.decision).toBe('REJECTED');

    const sessions = await http(app).get('/v1/attendance/sessions').set(bearer(ses));
    expect(sessions.status).toBe(200);
    expect(sessions.body).toHaveLength(1);
    expect(sessions.body[0]).toEqual(expect.objectContaining({ status: 'OPEN', ended_at: null, duration_minutes: null }));
    (globalThis as { rejectedEvent?: string }).rejectedEvent = outside.body.event_id;
  });

  it('an exception is requested on the rejected decision only once', async () => {
    const eventId = (globalThis as { rejectedEvent?: string }).rejectedEvent!;
    const first = await http(app).post('/v1/attendance/exceptions').set(bearer(ses)).send({ kind: 'DECISION_OVERRIDE', event_id: eventId, reason: 'كنت خارج النطاق عند الانصراف' });
    expect(first.status).toBe(201);
    expect(first.body.status).toBe('OPEN');
    const again = await http(app).post('/v1/attendance/exceptions').set(bearer(ses)).send({ kind: 'DECISION_OVERRIDE', event_id: eventId, reason: 'تكرار الطلب' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('EXCEPTION_ALREADY_OPEN');
    (globalThis as { exception?: string }).exception = first.body.id;
  });

  it('a verified decision cannot be disputed', async () => {
    const verified = await q<{ id: string }>(
      "SELECT e.id FROM attendance_events e JOIN attendance_decisions d ON d.event_id = e.id WHERE e.employee_id = $1 AND d.decision = 'VERIFIED' LIMIT 1",
      [empId],
    );
    const res = await http(app).post('/v1/attendance/exceptions').set(bearer(ses)).send({ kind: 'DECISION_OVERRIDE', event_id: verified[0]!.id, reason: 'لا حاجة' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EXCEPTION_NOT_APPLICABLE');
  });

  it('a missing punch older than the window is refused', async () => {
    const old = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const res = await http(app).post('/v1/attendance/exceptions').set(bearer(ses)).send({ kind: 'MISSING_PUNCH', punch_type: 'CLOCK_OUT', punch_at: old, reason: 'نسيت الانصراف' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EXCEPTION_OUT_OF_WINDOW');
  });

  it('the employee cannot approve, and a branch manager outside the branch gets 403', async () => {
    const id = (globalThis as { exception?: string }).exception!;
    expect((await http(app).post(`/v1/attendance/exceptions/${id}/approve`).set(bearer(ses)).send({})).status).toBe(403);
    const other = await http(app).post(`/v1/attendance/exceptions/${id}/approve`).set(bearer(managerOther)).send({});
    expect(other.status).toBe(403);
    const stillOpen = await q<{ status: string }>('SELECT status FROM attendance_exceptions WHERE id = $1', [id]);
    expect(stillOpen[0]!.status).toBe('OPEN');
  });

  it('the branch manager approves: an adjustment is written and the session closes', async () => {
    const id = (globalThis as { exception?: string }).exception!;
    const res = await http(app).post(`/v1/attendance/exceptions/${id}/approve`).set(bearer(managerOwn)).send({ note: 'تحقق من الكاميرا' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');

    const adjustments = await q<{ effect: string }>('SELECT effect FROM attendance_adjustments WHERE exception_id = $1', [id]);
    expect(adjustments).toEqual([{ effect: 'ACCEPT_EVENT' }]);

    const sessions = await http(app).get('/v1/attendance/sessions').set(bearer(ses));
    expect(sessions.body).toHaveLength(1);
    expect(sessions.body[0]).toEqual(expect.objectContaining({ status: 'CLOSED', duration_minutes: expect.any(Number) }));
    expect(sessions.body[0].ended_at).not.toBeNull();

    const twice = await http(app).post(`/v1/attendance/exceptions/${id}/reject`).set(bearer(managerOwn)).send({});
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe('EXCEPTION_NOT_OPEN');
  });

  it('sessions are scoped: the employee and own branch see them, another branch does not', async () => {
    expect((await http(app).get('/v1/attendance/sessions').set(bearer(managerOwn))).body.length).toBeGreaterThan(0);
    expect((await http(app).get('/v1/attendance/sessions').set(bearer(managerOther))).body).toEqual([]);
  });

  it('the live roster lists who is clocked in now, within the branch only', async () => {
    expect((await http(app).post('/v1/attendance/punches').set(bearer(ses)).set('Idempotency-Key', crypto.randomUUID()).send(await client.signed({ type: 'CLOCK_IN' }))).body.decision).toBe('VERIFIED');
    const own = await http(app).get('/v1/attendance/roster').set(bearer(managerOwn));
    expect(own.status).toBe(200);
    expect(own.body.present.map((r: { employee_number: string }) => r.employee_number)).toEqual(['SES-1']);
    const other = await http(app).get('/v1/attendance/roster').set(bearer(managerOther));
    expect(other.body.present).toEqual([]);
    expect((await http(app).get('/v1/attendance/roster').set(bearer(ses))).status).toBe(403);
  });

  it('the monthly CSV is UTF-8 with BOM, scoped, and forbidden to the employee', async () => {
    const sessions = await http(app).get('/v1/attendance/sessions').set(bearer(admin));
    const month = String(sessions.body[0].business_date).slice(0, 7);

    const csv = await http(app).get(`/v1/attendance/export.csv?month=${month}`).set(bearer(admin));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.startsWith('﻿employee_number,full_name,branch_code')).toBe(true);
    expect(csv.text).toContain('SES-1');
    expect(csv.text).toContain('CLOSED');

    const others = await http(app).get(`/v1/attendance/export.csv?month=${month}`).set(bearer(managerOther));
    expect(others.text).not.toContain('SES-1');

    expect((await http(app).get(`/v1/attendance/export.csv?month=${month}`).set(bearer(ses))).status).toBe(403);
    expect((await http(app).get('/v1/attendance/export.csv?month=2026-13').set(bearer(admin))).status).toBe(400);
  });
});
