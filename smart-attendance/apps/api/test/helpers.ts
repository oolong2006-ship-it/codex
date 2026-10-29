import { INestApplication } from '@nestjs/common';
import { authenticator } from 'otplib';
import { Client } from 'pg';
import request from 'supertest';
import { createApp } from '../src/app.factory';
import { loadConfig } from '../src/config';
import { decryptSecret } from '../src/auth/crypto';
import { testEnv } from './env';

export const PASSWORD = testEnv().SEED_PASSWORD as string;

export async function bootApp(overrides: Record<string, string> = {}): Promise<INestApplication> {
  const app = await createApp(loadConfig(testEnv(overrides)));
  // خادم يستمع دائمًا: supertest يعيد استخدام العنوان بدل تشغيل/إيقاف خادم مؤقت لكل طلب.
  await app.listen(0, '127.0.0.1');
  return app;
}

export type Http = ReturnType<typeof request>;
export const http = (app: INestApplication) => request(app.getHttpServer());

/**
 * رمز TOTP لخطوة لم تُستخدم بعد. السر يُقرأ من DB ويُفك بمفتاح الاختبار، لأن Jest
 * يعزل الوحدات بين ملفات الاختبار. الخادم يرفض أي خطوة <= mfa_last_step.
 */
export async function nextTotp(email: string): Promise<string> {
  const row = (
    await q<{ mfa_secret_enc: string | null; mfa_last_step: string | null }>(
      'SELECT mfa_secret_enc, mfa_last_step FROM user_accounts WHERE email = $1',
      [email],
    )
  )[0];
  if (!row?.mfa_secret_enc) throw new Error(`no TOTP secret for ${email}`);
  const secret = decryptSecret(Buffer.from(testEnv().MFA_ENC_KEY as string, 'base64'), row.mfa_secret_enc);
  const now = Math.floor(Date.now() / 30000);
  // الخطوة الحالية: تبقى داخل نافذة الخادم ±1 حتى لو عبر الاختبار حدّ 30 ثانية أثناء التحقق.
  const step = Math.max(now, row.mfa_last_step === null ? now : Number(row.mfa_last_step) + 1);
  if (step > now + 1) throw new Error('TOTP steps exhausted for this window');
  return authenticator.clone({ epoch: step * 30000 }).generate(secret);
}

export interface Session {
  access: string;
  refresh: string;
}

/** دخول كامل يشمل تفعيل MFA عند الحاجة. */
export async function login(app: INestApplication, email: string): Promise<Session> {
  const res = await http(app).post('/v1/auth/login').send({ identifier: email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  let body = res.body;
  if (body.status === 'MFA_ENROLLMENT_REQUIRED') {
    const enroll = await http(app).post('/v1/auth/mfa/enroll').send({ mfa_token: body.mfa_token });
    if (enroll.status !== 200) throw new Error(`enroll ${email}: ${enroll.status} ${JSON.stringify(enroll.body)}`);
  }
  if (body.status !== 'OK') {
    const verify = await http(app).post('/v1/auth/mfa/verify').send({ mfa_token: body.mfa_token, code: await nextTotp(email) });
    if (verify.status !== 200) throw new Error(`mfa ${email}: ${verify.status} ${JSON.stringify(verify.body)}`);
    body = verify.body;
  }
  return { access: body.access_token, refresh: body.refresh_token };
}

export const bearer = (s: Session) => ({ Authorization: `Bearer ${s.access}` });

/** اتصال مباشر بأدوار DB للتحقق من الحالة دون المرور بالخدمة. */
export async function withDb<T>(role: 'owner' | 'app' | 'platform', fn: (c: Client) => Promise<T>): Promise<T> {
  const env = testEnv();
  const url = role === 'owner' ? env.DATABASE_URL : role === 'app' ? env.DATABASE_APP_URL : env.DATABASE_PLATFORM_URL;
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

export async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withDb('platform', async (c) => (await c.query(sql, params)).rows as T[]);
}

export async function tenantId(slug: string): Promise<string> {
  return (await q<{ id: string }>('SELECT id FROM tenants WHERE slug = $1', [slug]))[0]!.id;
}

export async function employeeIdByEmail(email: string): Promise<string> {
  return (await q<{ employee_id: string }>('SELECT employee_id FROM user_accounts WHERE email = $1', [email]))[0]!.employee_id;
}

let keySeq = 0;
/** يسجل جهازًا عبر Fake attestation: يطلب تحديًا ثم يضمّنه في الحمولة. */
export async function deviceRegistration(
  app: INestApplication,
  s: Session,
  purpose: 'BIND' | 'CHANGE',
  opts: { verdict?: 'valid' | 'invalid'; nonceOverride?: string; keyId?: string } = {},
) {
  const ch = await http(app).post('/v1/devices/challenges').set(bearer(s)).send({ purpose });
  if (ch.status !== 201) throw new Error(`challenge: ${ch.status} ${JSON.stringify(ch.body)}`);
  return {
    challenge_id: ch.body.challenge_id as string,
    platform: 'android' as const,
    key_id: opts.keyId ?? `test-key-${process.pid}-${Date.now()}-${++keySeq}`,
    attestation: { nonce: opts.nonceOverride ?? ch.body.nonce, fake_verdict: opts.verdict ?? 'valid' },
    model: 'Test Device',
  };
}

export async function issueCode(app: INestApplication, hr: Session, employeeId: string): Promise<string> {
  const res = await http(app).post('/v1/devices/activation-codes').set(bearer(hr)).send({ employee_id: employeeId });
  if (res.status !== 201) throw new Error(`issue code: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.code;
}

export async function bindingsOf(employeeId: string) {
  return q<{ id: string; status: string; device_id: string }>(
    'SELECT id, status, device_id FROM device_bindings WHERE employee_id = $1 ORDER BY created_at',
    [employeeId],
  );
}
