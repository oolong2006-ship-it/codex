/**
 * إعدادات التشغيل من متغيرات البيئة. تفشل مبكرًا عند أي إعداد غير آمن.
 * prompts/phase-1 §5: الـ Fake ممنوع في الإنتاج، والتشغيل يفشل دون المفاتيح.
 */
export type AppEnv = 'development' | 'test' | 'production';
export type AttestationAdapterKind = 'fake' | 'platform';

export interface AppConfig {
  env: AppEnv;
  port: number;
  databaseAppUrl: string;
  databasePlatformUrl: string;
  jwtSecret: Uint8Array;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  mfaTokenTtlSeconds: number;
  mfaEncKey: Buffer;
  codeHmacKey: Buffer;
  attestationAdapter: AttestationAdapterKind;
  maxFailedLogins: number;
  lockoutMinutes: number;
  /** فحص العميل في طبقة الخدمة. يُعطّل فقط في اختبار «RLS وحده يكفي». */
  serviceTenantChecks: boolean;
  /** إعدادات التحقق الحقيقي من الأجهزة (مطلوبة إذا attestationAdapter = platform). */
  apple: { teamId?: string; bundleId?: string };
  google: { packageName?: string; cloudProjectNumber?: string };
}

export class ConfigError extends Error {}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key];
  if (!v) throw new ConfigError(`Missing required environment variable ${key}`);
  return v;
}

function base64Key(env: NodeJS.ProcessEnv, key: string): Buffer {
  const buf = Buffer.from(required(env, key), 'base64');
  if (buf.length < 32) throw new ConfigError(`${key} must decode to at least 32 bytes`);
  return buf;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const appEnv = (env.APP_ENV ?? 'development') as AppEnv;
  if (!['development', 'test', 'production'].includes(appEnv)) {
    throw new ConfigError(`Invalid APP_ENV ${appEnv}`);
  }

  const jwtSecret = required(env, 'JWT_SECRET');
  if (Buffer.byteLength(jwtSecret) < 32) throw new ConfigError('JWT_SECRET must be at least 32 bytes');

  const attestationAdapter = (env.ATTESTATION_ADAPTER ?? 'fake') as AttestationAdapterKind;
  if (!['fake', 'platform'].includes(attestationAdapter)) {
    throw new ConfigError(`Invalid ATTESTATION_ADAPTER ${attestationAdapter}`);
  }
  if (appEnv === 'production' && attestationAdapter === 'fake') {
    throw new ConfigError('FakeAttestationAdapter is forbidden in production');
  }

  const apple = { teamId: env.APPLE_TEAM_ID, bundleId: env.APPLE_BUNDLE_ID };
  const google = { packageName: env.ANDROID_PACKAGE_NAME, cloudProjectNumber: env.GOOGLE_CLOUD_PROJECT_NUMBER };
  if (attestationAdapter === 'platform') {
    for (const [k, v] of Object.entries({
      APPLE_TEAM_ID: apple.teamId,
      APPLE_BUNDLE_ID: apple.bundleId,
      ANDROID_PACKAGE_NAME: google.packageName,
      GOOGLE_CLOUD_PROJECT_NUMBER: google.cloudProjectNumber,
    })) {
      if (!v) throw new ConfigError(`Missing required environment variable ${k} for platform attestation`);
    }
  }

  const serviceTenantChecks = env.SERVICE_TENANT_CHECKS !== 'off';
  if (!serviceTenantChecks && appEnv !== 'test') {
    throw new ConfigError('SERVICE_TENANT_CHECKS=off is allowed only in APP_ENV=test');
  }

  return {
    env: appEnv,
    port: Number(env.PORT ?? 3000),
    databaseAppUrl: required(env, 'DATABASE_APP_URL'),
    databasePlatformUrl: required(env, 'DATABASE_PLATFORM_URL'),
    jwtSecret: new TextEncoder().encode(jwtSecret),
    accessTokenTtlSeconds: 15 * 60,
    refreshTokenTtlDays: Number(env.REFRESH_TOKEN_TTL_DAYS ?? 30),
    mfaTokenTtlSeconds: 5 * 60,
    mfaEncKey: base64Key(env, 'MFA_ENC_KEY'),
    codeHmacKey: base64Key(env, 'CODE_HMAC_KEY'),
    attestationAdapter,
    maxFailedLogins: Number(env.MAX_FAILED_LOGINS ?? 5),
    lockoutMinutes: Number(env.LOCKOUT_MINUTES ?? 15),
    serviceTenantChecks,
    apple,
    google,
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
