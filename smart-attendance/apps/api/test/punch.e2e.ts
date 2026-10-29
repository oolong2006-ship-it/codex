import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { canonicalJson } from '@sa/domain';
import { sha256Hex } from '../src/auth/crypto';
import { fakeSign } from '../src/devices/attestation';
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

/** البصمة من طرف الهاتف إلى الخادم (phase-2 §5، specs §B/§D، مصفوفة F1–F5). */
describe('attendance punch (specs §B, §D)', () => {
  const CENTER = { lat: 24.7136, lng: 46.6753 };
  const north = (m: number) => ({ lat: CENTER.lat + m / 111_195, lng: CENTER.lng });

  let app: INestApplication;
  let hr: Session;
  let emp: Session;
  let empId: string;
  let siteId: string;
  let deviceKeyId: string;

  beforeAll(async () => {
    app = await bootApp();
    hr = await login(app, 'hr@b.dev');
    emp = await login(app, 'emp3@b.dev');
    empId = await employeeIdByEmail('emp3@b.dev');

    const branches = await http(app).get('/v1/branches').set(bearer(hr));
    const branchId = branches.body[0].id as string;
    const site = await http(app)
      .post('/v1/work-locations')
      .set(bearer(hr))
      .send({ branch_id: branchId, name: 'موقع البصمة', code: 'PUNCH-1', geofence: { kind: 'CIRCLE', center: CENTER, radius_m: 50 } });
    expect(site.status).toBe(201);
    siteId = site.body.id;

    const assign = await http(app).post(`/v1/employees/${empId}/site-assignments`).set(bearer(hr)).send({ work_location_id: siteId });
    expect(assign.status).toBe(201);

    const device = await deviceRegistration(app, emp, 'BIND');
    deviceKeyId = device.key_id;
    const bind = await http(app)
      .post('/v1/devices/bind')
      .set(bearer(emp))
      .send({ activation_code: await issueCode(app, hr, empId), device });
    expect(bind.status).toBe(201);
  });
  afterAll(() => app.close());

  /** بناء بصمة موقّعة: تحدٍّ جديد، ثم توقيع canonical JSON للجسم مع nonce. */
  async function signedPunch(
    s: Session,
    o: { type?: string; at?: { lat: number; lng: number }; accuracy?: number; keyId?: string } = {},
  ) {
    const ch = await http(app).post('/v1/attendance/challenges').set(bearer(s));
    expect(ch.status).toBe(201);
    const at = o.at ?? CENTER;
    const body = {
      challenge_id: ch.body.challenge_id as string,
      type: o.type ?? 'CLOCK_IN',
      location_samples: [{ lat: at.lat, lng: at.lng, accuracy_m: o.accuracy ?? 10, captured_at: new Date().toISOString(), provider: 'gps' }],
      client_time: new Date().toISOString(),
      client_tz: 'Asia/Riyadh',
      app_version: '1.0.0',
      os: 'android',
      os_version: '14',
    };
    const hash = sha256Hex((ch.body.nonce as string) + canonicalJson(body));
    const signature = fakeSign(`fake-public-key:${deviceKeyId}`, hash);
    return { ...body, attestation: { key_id: o.keyId ?? deviceKeyId, signature } };
  }

  const send = (s: Session, payload: unknown, key: string = randomUUID()) =>
    http(app).post('/v1/attendance/punches').set(bearer(s)).set('Idempotency-Key', key).send(payload as object);

  const eventCount = async () =>
    (await q<{ n: string }>('SELECT count(*) AS n FROM attendance_events WHERE employee_id = $1', [empId]))[0]!.n;

  it('a signed punch inside the fence is VERIFIED and leaves a full evidence trail', async () => {
    const res = await send(emp, await signedPunch(emp, { type: 'CLOCK_IN' }));
    expect(res.status).toBe(201);
    expect(res.body.decision).toBe('VERIFIED');
    expect(res.body.reasons.map((r: { code: string }) => r.code)).toEqual(['LOC_INSIDE']);
    expect(res.body.site).toEqual({ id: siteId, name: 'موقع البصمة' });
    expect(res.body.next_action).toBe('NONE');
    expect(res.body.reasons[0].message_ar).toBeTruthy();
    expect(res.body.reasons[0].message_en).toBeTruthy();

    const ev = await q<{ decision: string; geofence_version_id: string; signed: number }>(
      `SELECT d.decision, d.geofence_version_id, le.signed_distance_m AS signed
       FROM attendance_decisions d JOIN location_evidence le ON le.event_id = d.event_id WHERE d.event_id = $1`,
      [res.body.event_id],
    );
    expect(ev).toHaveLength(1);
    expect(ev[0]!.decision).toBe('VERIFIED');
    expect(Number(ev[0]!.signed)).toBeLessThan(0);
  });

  it('CLOCK_OUT with an open session is VERIFIED', async () => {
    const res = await send(emp, await signedPunch(emp, { type: 'CLOCK_OUT' }));
    expect(res.body.decision).toBe('VERIFIED');
  });

  it('CLOCK_OUT without an open session is REJECTED / SEQUENCE_INVALID, and still recorded', async () => {
    const before = await eventCount();
    const res = await send(emp, await signedPunch(emp, { type: 'CLOCK_OUT' }));
    expect(res.body.decision).toBe('REJECTED');
    expect(res.body.reasons.map((r: { code: string }) => r.code)).toEqual(['SEQUENCE_INVALID']);
    expect(res.body.next_action).toBe('SUBMIT_EXCEPTION');
    expect(await eventCount()).toBe(String(Number(before) + 1));
  });

  it('outside the fence is REJECTED / LOC_OUTSIDE with an exception path', async () => {
    const res = await send(emp, await signedPunch(emp, { type: 'CLOCK_IN', at: north(500) }));
    expect(res.body.decision).toBe('REJECTED');
    expect(res.body.reasons.map((r: { code: string }) => r.code)).toEqual(['LOC_OUTSIDE']);
  });

  it('low accuracy inside the fence asks the employee to retry the location', async () => {
    const res = await send(emp, await signedPunch(emp, { type: 'CLOCK_IN', accuracy: 300 }));
    expect(res.body.decision).toBe('PENDING_REVIEW');
    expect(res.body.reasons.map((r: { code: string }) => r.code)).toEqual(['LOC_LOW_ACCURACY']);
    expect(res.body.next_action).toBe('RETRY_LOCATION');
  });

  it('F4: the same Idempotency-Key with the same body returns the same response and one event', async () => {
    const payload = await signedPunch(emp, { type: 'CLOCK_IN', accuracy: 9 });
    const key = randomUUID();
    const before = await eventCount();
    const first = await send(emp, payload, key);
    const second = await send(emp, payload, key);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(await eventCount()).toBe(String(Number(before) + 1));
  });

  it('the same key with a different body is refused with 409', async () => {
    const payload = await signedPunch(emp, { type: 'CLOCK_IN', accuracy: 8 });
    const key = randomUUID();
    await send(emp, payload, key);
    const other = { ...payload, location_samples: [{ ...payload.location_samples[0]!, accuracy_m: 7 }] };
    const res = await send(emp, other, key);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('F3: replaying a signed punch with a new key is refused as CHALLENGE_INVALID', async () => {
    const payload = await signedPunch(emp, { type: 'CLOCK_OUT' });
    await send(emp, payload);
    const replay = await send(emp, payload);
    expect(replay.status).toBe(201);
    expect(replay.body.decision).toBe('REJECTED');
    expect(replay.body.reasons.map((r: { code: string }) => r.code)).toEqual(['CHALLENGE_INVALID']);
  });

  it('F5: a body changed after signing is REJECTED / ATTESTATION_FAILED', async () => {
    const payload = await signedPunch(emp, { type: 'CLOCK_IN' });
    const tampered = { ...payload, location_samples: [{ ...payload.location_samples[0]!, lat: CENTER.lat + 0.00001 }] };
    const res = await send(emp, tampered);
    expect(res.body.decision).toBe('REJECTED');
    expect(res.body.reasons.map((r: { code: string }) => r.code)).toEqual(['ATTESTATION_FAILED']);
  });

  it('F1: a punch from a key that is not the bound device is REJECTED / DEVICE_NOT_BOUND', async () => {
    const payload = await signedPunch(emp, { type: 'CLOCK_IN', keyId: 'some-other-device' });
    const res = await send(emp, payload);
    expect(res.body.decision).toBe('REJECTED');
    expect(res.body.reasons.map((r: { code: string }) => r.code)).toEqual(['DEVICE_NOT_BOUND']);
    expect(res.body.next_action).toBe('REQUEST_DEVICE_CHANGE');
  });

  it('F2: after HR suspends the binding (theft report), punches are DEVICE_NOT_BOUND', async () => {
    const [binding] = await bindingsOf(empId);
    const suspended = await http(app).post(`/v1/devices/bindings/${binding!.id}/suspend`).set(bearer(hr));
    expect(suspended.status).toBe(200);
    const res = await send(emp, await signedPunch(emp, { type: 'CLOCK_IN' }));
    expect(res.body.decision).toBe('REJECTED');
    expect(res.body.reasons.map((r: { code: string }) => r.code)).toEqual(['DEVICE_NOT_BOUND']);
  });

  it('a request without an Idempotency-Key is a validation error', async () => {
    const res = await http(app).post('/v1/attendance/punches').set(bearer(emp)).send({});
    expect(res.status).toBe(400);
  });

  it('break punches are off by policy (D-05) and rejected before any work', async () => {
    const res = await send(emp, { challenge_id: randomUUID(), type: 'BREAK_START', location_samples: [], app_version: '1', os: 'android', attestation: {} });
    expect([400, 422]).toContain(res.status);
  });

  it('the employee sees their own history with decisions', async () => {
    const res = await http(app).get('/v1/attendance/me/events').set(bearer(emp));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(3);
    expect(res.body[0]).toEqual(expect.objectContaining({ decision: expect.any(String), reasons: expect.any(Array) }));
  });
});
