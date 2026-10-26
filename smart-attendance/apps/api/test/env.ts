/**
 * بيئة الاختبار: قاعدة بيانات مستقلة `<db>_test` تُعاد من الصفر في كل تشغيل.
 * القيم الافتراضية تطابق .env.example و docker-compose.yml.
 */
const DEFAULTS: Record<string, string> = {
  DATABASE_URL: 'postgres://sa_owner:sa_owner_dev@localhost:54329/smart_attendance',
  DATABASE_APP_URL: 'postgres://sa_app:sa_app_dev@localhost:54329/smart_attendance',
  DATABASE_PLATFORM_URL: 'postgres://sa_platform:sa_platform_dev@localhost:54329/smart_attendance',
  JWT_SECRET: 'test-only-secret-test-only-secret-000000',
  MFA_ENC_KEY: 'dGVzdC1vbmx5LW1mYS1rZXktMzItYnl0ZXMtbG9uZyEh',
  CODE_HMAC_KEY: 'dGVzdC1vbmx5LWNvZGUtaG1hYy1rZXktMzJieXRlcyEh',
  SEED_PASSWORD: 'Test-Only-Pass-123',
};

function withTestDb(url: string): string {
  const u = new URL(url);
  const name = u.pathname.replace(/^\//, '');
  u.pathname = `/${name.endsWith('_test') ? name : `${name}_test`}`;
  return u.toString();
}

export function testEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  const pick = (k: string) => process.env[k] ?? (DEFAULTS[k] as string);
  return {
    APP_ENV: 'test',
    ATTESTATION_ADAPTER: 'fake',
    DATABASE_URL: withTestDb(pick('DATABASE_URL')),
    DATABASE_APP_URL: withTestDb(pick('DATABASE_APP_URL')),
    DATABASE_PLATFORM_URL: withTestDb(pick('DATABASE_PLATFORM_URL')),
    JWT_SECRET: pick('JWT_SECRET'),
    MFA_ENC_KEY: pick('MFA_ENC_KEY'),
    CODE_HMAC_KEY: pick('CODE_HMAC_KEY'),
    SEED_PASSWORD: pick('SEED_PASSWORD'),
    ...overrides,
  };
}

/** عنوان المالك على قاعدة postgres الإدارية (لإنشاء قاعدة الاختبار وحذفها). */
export function adminUrl(): string {
  const u = new URL(process.env.DATABASE_URL ?? (DEFAULTS.DATABASE_URL as string));
  u.pathname = '/postgres';
  return u.toString();
}

export function testDbName(): string {
  return new URL(testEnv().DATABASE_URL as string).pathname.replace(/^\//, '');
}
