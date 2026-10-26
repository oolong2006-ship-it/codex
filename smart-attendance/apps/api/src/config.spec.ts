import { ConfigError, loadConfig } from './config';
import { createAttestationAdapter } from './devices/attestation';

const base = {
  DATABASE_APP_URL: 'postgres://a@h/db',
  DATABASE_PLATFORM_URL: 'postgres://p@h/db',
  JWT_SECRET: 'x'.repeat(40),
  MFA_ENC_KEY: Buffer.alloc(32, 1).toString('base64'),
  CODE_HMAC_KEY: Buffer.alloc(32, 2).toString('base64'),
};

describe('config (phase-1 §5: Fake forbidden in production)', () => {
  it('refuses the fake attestation adapter in production', () => {
    expect(() => loadConfig({ ...base, APP_ENV: 'production', ATTESTATION_ADAPTER: 'fake' })).toThrow(ConfigError);
  });

  it('defaults to fake outside production, so production must opt in explicitly', () => {
    expect(() => loadConfig({ ...base, APP_ENV: 'production' })).toThrow(/forbidden in production/);
    expect(loadConfig({ ...base, APP_ENV: 'development' }).attestationAdapter).toBe('fake');
  });

  it('requires Apple/Google keys for platform attestation', () => {
    expect(() => loadConfig({ ...base, APP_ENV: 'production', ATTESTATION_ADAPTER: 'platform' })).toThrow(/APPLE_TEAM_ID/);
  });

  it('refuses to start with platform attestation until a real verifier exists', () => {
    const cfg = loadConfig({
      ...base,
      APP_ENV: 'production',
      ATTESTATION_ADAPTER: 'platform',
      APPLE_TEAM_ID: 'T',
      APPLE_BUNDLE_ID: 'b',
      ANDROID_PACKAGE_NAME: 'p',
      GOOGLE_CLOUD_PROJECT_NUMBER: '1',
    });
    expect(() => createAttestationAdapter(cfg)).toThrow(/not implemented/);
  });

  it('rejects weak secrets', () => {
    expect(() => loadConfig({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ ...base, MFA_ENC_KEY: Buffer.alloc(8).toString('base64') })).toThrow(/MFA_ENC_KEY/);
  });

  it('allows disabling service tenant checks only in test', () => {
    expect(() => loadConfig({ ...base, APP_ENV: 'development', SERVICE_TENANT_CHECKS: 'off' })).toThrow();
    expect(loadConfig({ ...base, APP_ENV: 'test', SERVICE_TENANT_CHECKS: 'off' }).serviceTenantChecks).toBe(false);
  });
});
