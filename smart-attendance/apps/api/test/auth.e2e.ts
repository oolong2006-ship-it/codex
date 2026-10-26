import { INestApplication } from '@nestjs/common';
import { PASSWORD, bootApp, http, login, nextTotp, q } from './helpers';

describe('auth (phase-1 §4)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await bootApp();
  });
  afterAll(() => app.close());

  it('employee signs in with phone, no MFA required, and gets a 15-minute access token', async () => {
    // الجوال في seed = +9665 + (50 + رقم العميل) + رقم المستخدم: emp1 في العميل A.
    const phoneRes = await http(app).post('/v1/auth/login').send({ identifier: '+9665500005', password: PASSWORD });
    expect(phoneRes.status).toBe(200);
    expect(phoneRes.body.status).toBe('OK');
    expect(phoneRes.body.expires_in).toBe(900);
    const me = await http(app).get('/v1/me').set('Authorization', `Bearer ${phoneRes.body.access_token}`);
    expect(me.status).toBe(200);
    expect(me.body.roles.map((r: { role: string }) => r.role)).toEqual(['employee']);
  });

  it('wrong password → 401 with Arabic and English messages', async () => {
    const res = await http(app).post('/v1/auth/login').send({ identifier: 'emp1@a.dev', password: 'nope-nope' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(res.body.error.message_ar).toBeTruthy();
    expect(res.body.error.message_en).toBeTruthy();
  });

  it('unknown user gets the same error as a wrong password', async () => {
    const res = await http(app).post('/v1/auth/login').send({ identifier: 'ghost@x.dev', password: 'nope-nope' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('HR must enroll TOTP before any token is issued', async () => {
    const res = await http(app).post('/v1/auth/login').send({ identifier: 'hr@b.dev', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('MFA_ENROLLMENT_REQUIRED');
    expect(res.body.access_token).toBeUndefined();

    // التحقق دون تسجيل سر يفشل
    const early = await http(app).post('/v1/auth/mfa/verify').send({ mfa_token: res.body.mfa_token, code: '000000' });
    expect(early.status).toBe(401);
    expect(early.body.error.code).toBe('AUTH_MFA_ENROLLMENT_REQUIRED');

    const enroll = await http(app).post('/v1/auth/mfa/enroll').send({ mfa_token: res.body.mfa_token });
    expect(enroll.status).toBe(200);
    expect(enroll.body.otpauth_url).toMatch(/^otpauth:\/\/totp\//);

    const bad = await http(app).post('/v1/auth/mfa/verify').send({ mfa_token: res.body.mfa_token, code: '000000' });
    expect(bad.status).toBe(401);

    const code = await nextTotp('hr@b.dev');
    const ok = await http(app).post('/v1/auth/mfa/verify').send({ mfa_token: res.body.mfa_token, code });
    expect(ok.status).toBe(200);
    expect(ok.body.access_token).toBeTruthy();

    // إعادة استخدام الرمز نفسه مرفوضة
    const again = await http(app).post('/v1/auth/login').send({ identifier: 'hr@b.dev', password: PASSWORD });
    expect(again.body.status).toBe('MFA_REQUIRED');
    const replay = await http(app).post('/v1/auth/mfa/verify').send({ mfa_token: again.body.mfa_token, code });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('AUTH_MFA_INVALID');

    const stored = await q<{ mfa_secret_enc: string; mfa_enabled: boolean }>(
      'SELECT mfa_secret_enc, mfa_enabled FROM user_accounts WHERE email = $1',
      ['hr@b.dev'],
    );
    expect(stored[0]!.mfa_enabled).toBe(true);
    expect(stored[0]!.mfa_secret_enc).not.toContain(enroll.body.secret);
  });

  it('platform admin also requires MFA', async () => {
    const res = await http(app).post('/v1/auth/login').send({ identifier: 'platform@sa.dev', password: PASSWORD });
    expect(res.body.status).toBe('MFA_ENROLLMENT_REQUIRED');
  });

  it('refresh rotates; reusing a rotated token revokes the whole family', async () => {
    const s = await login(app, 'emp2@a.dev');
    const r1 = await http(app).post('/v1/auth/refresh').send({ refresh_token: s.refresh });
    expect(r1.status).toBe(200);
    expect(r1.body.refresh_token).not.toBe(s.refresh);

    const reuse = await http(app).post('/v1/auth/refresh').send({ refresh_token: s.refresh });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('AUTH_REFRESH_REUSED');

    // الرمز الجديد أصبح ملغى أيضًا (العائلة كلها)
    const afterTheft = await http(app).post('/v1/auth/refresh').send({ refresh_token: r1.body.refresh_token });
    expect(afterTheft.status).toBe(401);
  });

  it('logout revokes the refresh family', async () => {
    const s = await login(app, 'emp3@a.dev');
    expect((await http(app).post('/v1/auth/logout').send({ refresh_token: s.refresh })).status).toBe(204);
    expect((await http(app).post('/v1/auth/refresh').send({ refresh_token: s.refresh })).status).toBe(401);
  });

  it('locks the account after repeated failures, even for the right password', async () => {
    for (let i = 0; i < 5; i++) {
      await http(app).post('/v1/auth/login').send({ identifier: 'emp3@b.dev', password: 'wrong-pass' });
    }
    const locked = await http(app).post('/v1/auth/login').send({ identifier: 'emp3@b.dev', password: PASSWORD });
    expect(locked.status).toBe(401);
    const audit = await q<{ action: string }>(
      "SELECT action FROM audit_logs WHERE action LIKE 'auth.login.%' AND actor_id = (SELECT id FROM user_accounts WHERE email = 'emp3@b.dev')",
    );
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['auth.login.failed', 'auth.login.lockout', 'auth.login.locked']));
  });

  it('rejects requests without a valid bearer token', async () => {
    expect((await http(app).get('/v1/me')).status).toBe(401);
    expect((await http(app).get('/v1/me').set('Authorization', 'Bearer not-a-jwt')).status).toBe(401);
  });

  it('a suspended tenant cannot sign in', async () => {
    const created = await q<{ id: string }>("INSERT INTO tenants (name, slug, status) VALUES ('موقوف', 'suspended-t', 'SUSPENDED') RETURNING id");
    const { hash } = await import('@node-rs/argon2');
    await q('INSERT INTO user_accounts (tenant_id, email, password_hash) VALUES ($1, $2, $3)', [
      created[0]!.id,
      'u@suspended.dev',
      await hash(PASSWORD),
    ]);
    await q("INSERT INTO user_role_assignments (tenant_id, user_id, role_code) SELECT $1, id, 'employee' FROM user_accounts WHERE email = 'u@suspended.dev'", [created[0]!.id]);
    const res = await http(app).post('/v1/auth/login').send({ identifier: 'u@suspended.dev', password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TENANT_INACTIVE');
  });
});
