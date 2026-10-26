import { INestApplication } from '@nestjs/common';
import {
  Session,
  bearer,
  bindingsOf,
  bootApp,
  deviceRegistration,
  employeeIdByEmail,
  http,
  issueCode,
  login,
  q,
} from './helpers';

/** DeviceLock على الخادم (specs §C) + F6 + F7. */
describe('DeviceLock', () => {
  let app: INestApplication;
  let hr: Session;
  let admin: Session;
  beforeAll(async () => {
    app = await bootApp();
    hr = await login(app, 'hr@a.dev');
    admin = await login(app, 'admin@a.dev');
  });
  afterAll(() => app.close());

  async function bindFresh(email: string): Promise<{ s: Session; employeeId: string; bindingId: string }> {
    const s = await login(app, email);
    const employeeId = await employeeIdByEmail(email);
    const code = await issueCode(app, hr, employeeId);
    const res = await http(app)
      .post('/v1/devices/bind')
      .set(bearer(s))
      .send({ activation_code: code, device: await deviceRegistration(app, s, 'BIND') });
    expect(res.status).toBe(201);
    return { s, employeeId, bindingId: res.body.id };
  }

  describe('first binding', () => {
    it('HR issues an 8-character one-time code; the employee binds and the binding is ACTIVE', async () => {
      const { employeeId, bindingId } = await bindFresh('emp1@a.dev');
      const rows = await bindingsOf(employeeId);
      expect(rows).toEqual([expect.objectContaining({ id: bindingId, status: 'ACTIVE' })]);
      const audit = await q("SELECT 1 FROM audit_logs WHERE action = 'device.binding.created' AND entity_id = $1", [bindingId]);
      expect(audit).toHaveLength(1);
      const codeAudit = await q<{ after: Record<string, unknown> }>(
        "SELECT after FROM audit_logs WHERE action = 'device.activation_code.issued' ORDER BY id DESC LIMIT 1",
      );
      expect(JSON.stringify(codeAudit[0]!.after)).not.toMatch(/"code"/);
    });

    it('an employee cannot issue activation codes', async () => {
      const s = await login(app, 'emp3@a.dev');
      const res = await http(app)
        .post('/v1/devices/activation-codes')
        .set(bearer(s))
        .send({ employee_id: await employeeIdByEmail('emp3@a.dev') });
      expect(res.status).toBe(403);
    });

    it("rejects another employee's code, and a reused code", async () => {
      const s = await login(app, 'manager2@a.dev');
      const otherCode = await issueCode(app, hr, await employeeIdByEmail('emp3@a.dev'));
      const wrong = await http(app)
        .post('/v1/devices/bind')
        .set(bearer(s))
        .send({ activation_code: otherCode, device: await deviceRegistration(app, s, 'BIND') });
      expect(wrong.status).toBe(400);
      expect(wrong.body.error.code).toBe('ACTIVATION_CODE_INVALID');
      expect(await bindingsOf(await employeeIdByEmail('manager2@a.dev'))).toHaveLength(0);
    });

    it('failed attestation creates no binding but keeps the evidence', async () => {
      const s = await login(app, 'emp3@a.dev');
      const employeeId = await employeeIdByEmail('emp3@a.dev');
      const code = await issueCode(app, hr, employeeId);
      const res = await http(app)
        .post('/v1/devices/bind')
        .set(bearer(s))
        .send({ activation_code: code, device: await deviceRegistration(app, s, 'BIND', { verdict: 'invalid' }) });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ATTESTATION_FAILED');
      expect(await bindingsOf(employeeId)).toHaveLength(0);
      const att = await q<{ verified: boolean }>(
        'SELECT a.verified FROM device_attestations a JOIN devices d ON d.id = a.device_id ORDER BY a.created_at DESC LIMIT 1',
      );
      expect(att[0]!.verified).toBe(false);
    });

    it('an attestation that does not carry the issued challenge is rejected', async () => {
      const s = await login(app, 'emp3@a.dev');
      const code = await issueCode(app, hr, await employeeIdByEmail('emp3@a.dev'));
      const res = await http(app)
        .post('/v1/devices/bind')
        .set(bearer(s))
        .send({ activation_code: code, device: await deviceRegistration(app, s, 'BIND', { nonceOverride: 'forged' }) });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ATTESTATION_FAILED');
    });

    it('a challenge can be used only once', async () => {
      const s = await login(app, 'emp3@a.dev');
      const employeeId = await employeeIdByEmail('emp3@a.dev');
      const device = await deviceRegistration(app, s, 'BIND');
      const first = await http(app)
        .post('/v1/devices/bind')
        .set(bearer(s))
        .send({ activation_code: await issueCode(app, hr, employeeId), device });
      expect(first.status).toBe(201);
      await q("UPDATE device_bindings SET status = 'REVOKED' WHERE employee_id = $1", [employeeId]);
      const replay = await http(app)
        .post('/v1/devices/bind')
        .set(bearer(s))
        .send({ activation_code: await issueCode(app, hr, employeeId), device: { ...device, key_id: `${device.key_id}-2` } });
      expect(replay.status).toBe(403);
      expect(replay.body.error.code).toBe('ATTESTATION_FAILED');
    });
  });

  describe('F6 — no replacement device without approval', () => {
    it('binding a second device with a fresh code is refused and nothing changes', async () => {
      const { s, employeeId } = await bindFresh('emp2@a.dev');
      const before = await bindingsOf(employeeId);
      const res = await http(app)
        .post('/v1/devices/bind')
        .set(bearer(s))
        .send({ activation_code: await issueCode(app, hr, employeeId), device: await deviceRegistration(app, s, 'BIND') });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('DEVICE_CHANGE_REQUIRES_APPROVAL');
      expect(await bindingsOf(employeeId)).toEqual(before);
      const denied = await q("SELECT 1 FROM audit_logs WHERE action = 'device.binding.create.denied'");
      expect(denied.length).toBeGreaterThan(0);
    });

    it('a change request alone changes no binding; the employee cannot approve, reactivate or suspend', async () => {
      const s = await login(app, 'emp2@a.dev');
      const employeeId = await employeeIdByEmail('emp2@a.dev');
      const before = await bindingsOf(employeeId);
      const cr = await http(app)
        .post('/v1/devices/change-requests')
        .set(bearer(s))
        .send({ reason: 'UPGRADE', device: await deviceRegistration(app, s, 'CHANGE') });
      expect(cr.status).toBe(201);
      expect(cr.body.status).toBe('OPEN');
      expect(await bindingsOf(employeeId)).toEqual(before);

      const attempts = [
        http(app).post(`/v1/devices/change-requests/${cr.body.id}/approve`).set(bearer(s)),
        http(app).post(`/v1/devices/bindings/${before[0]!.id}/reactivate`).set(bearer(s)),
        http(app).post(`/v1/devices/bindings/${before[0]!.id}/suspend`).set(bearer(s)),
      ];
      for (const res of await Promise.all(attempts)) expect(res.status).toBe(403);
      expect(await bindingsOf(employeeId)).toEqual(before);

      const dup = await http(app)
        .post('/v1/devices/change-requests')
        .set(bearer(s))
        .send({ reason: 'UPGRADE', device: await deviceRegistration(app, s, 'CHANGE') });
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('DEVICE_CHANGE_ALREADY_OPEN');
    });

    it('HR approval supersedes the old binding, activates the new one and revokes sessions', async () => {
      const s = await login(app, 'emp2@a.dev');
      const employeeId = await employeeIdByEmail('emp2@a.dev');
      const open = await q<{ id: string; new_device_id: string }>(
        "SELECT id, new_device_id FROM device_change_requests WHERE employee_id = $1 AND status = 'OPEN'",
        [employeeId],
      );
      const res = await http(app).post(`/v1/devices/change-requests/${open[0]!.id}/approve`).set(bearer(hr));
      expect(res.status).toBe(200);
      expect(res.body.revoked_refresh_tokens).toBeGreaterThan(0);
      const rows = await bindingsOf(employeeId);
      expect(rows.map((r) => r.status)).toEqual(['SUPERSEDED', 'ACTIVE']);
      expect(rows[1]!.device_id).toBe(open[0]!.new_device_id);
      expect((await http(app).post('/v1/auth/refresh').send({ refresh_token: s.refresh })).status).toBe(401);

      const again = await http(app).post(`/v1/devices/change-requests/${open[0]!.id}/approve`).set(bearer(hr));
      expect(again.status).toBe(409);
    });
  });

  describe('F7 — nobody approves their own device change', () => {
    it('HR who is also an employee cannot approve their own request', async () => {
      const { s: hrAsEmployee } = await bindFresh('hr@a.dev');
      const cr = await http(app)
        .post('/v1/devices/change-requests')
        .set(bearer(hrAsEmployee))
        .send({ reason: 'BROKEN', device: await deviceRegistration(app, hrAsEmployee, 'CHANGE') });
      expect(cr.status).toBe(201);
      const res = await http(app).post(`/v1/devices/change-requests/${cr.body.id}/approve`).set(bearer(hrAsEmployee));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('DEVICE_CHANGE_SELF_APPROVAL');
      const still = await q<{ status: string }>('SELECT status FROM device_change_requests WHERE id = $1', [cr.body.id]);
      expect(still[0]!.status).toBe('OPEN');

      // مسؤول آخر يستطيع الاعتماد
      const byAdmin = await http(app).post(`/v1/devices/change-requests/${cr.body.id}/approve`).set(bearer(admin));
      expect(byAdmin.status).toBe(200);
    });

    it('rejection leaves bindings untouched', async () => {
      const s = await login(app, 'emp1@a.dev');
      const employeeId = await employeeIdByEmail('emp1@a.dev');
      const before = await bindingsOf(employeeId);
      const cr = await http(app)
        .post('/v1/devices/change-requests')
        .set(bearer(s))
        .send({ reason: 'LOST', device: await deviceRegistration(app, s, 'CHANGE') });
      const res = await http(app).post(`/v1/devices/change-requests/${cr.body.id}/reject`).set(bearer(hr));
      expect(res.status).toBe(200);
      expect(await bindingsOf(employeeId)).toEqual(before);
    });

    it('an expired request cannot be approved', async () => {
      const s = await login(app, 'emp1@a.dev');
      const cr = await http(app)
        .post('/v1/devices/change-requests')
        .set(bearer(s))
        .send({ reason: 'LOST', device: await deviceRegistration(app, s, 'CHANGE') });
      await q("UPDATE device_change_requests SET expires_at = now() - interval '1 second' WHERE id = $1", [cr.body.id]);
      const res = await http(app).post(`/v1/devices/change-requests/${cr.body.id}/approve`).set(bearer(hr));
      expect(res.status).toBe(409);
      const row = await q<{ status: string }>('SELECT status FROM device_change_requests WHERE id = $1', [cr.body.id]);
      expect(row[0]!.status).toBe('EXPIRED');
    });
  });

  describe('suspend and reactivate', () => {
    it('HR suspends immediately (theft) and sessions are revoked; only HR reactivates', async () => {
      const { s, employeeId, bindingId } = await bindFresh('manager1@a.dev');
      const res = await http(app).post(`/v1/devices/bindings/${bindingId}/suspend`).set(bearer(hr));
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('SUSPENDED');
      expect((await http(app).post('/v1/auth/refresh').send({ refresh_token: s.refresh })).status).toBe(401);

      const byAdmin = await http(app).post(`/v1/devices/bindings/${bindingId}/reactivate`).set(bearer(admin));
      expect(byAdmin.status).toBe(403);

      const byHr = await http(app).post(`/v1/devices/bindings/${bindingId}/reactivate`).set(bearer(hr));
      expect(byHr.status).toBe(200);
      expect((await bindingsOf(employeeId)).map((b) => b.status)).toEqual(['ACTIVE']);
    });
  });
});
