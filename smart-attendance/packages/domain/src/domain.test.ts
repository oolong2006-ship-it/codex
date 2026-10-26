import { describe, expect, it } from 'vitest';
import {
  ACTIVATION_ALPHABET,
  ERROR_CODES,
  REASON_CODES,
  activationCodeFromBytes,
  blocksFirstBinding,
  canTransitionBinding,
  catalogs,
  isChangeRequestExpired,
  normalizeActivationCode,
  requiresMfa,
} from './index';

describe('message catalogs', () => {
  it('every reason and error code has Arabic and English text', () => {
    for (const code of [...REASON_CODES, ...ERROR_CODES]) {
      expect(catalogs.ar[code], `ar:${code}`).toBeTruthy();
      expect(catalogs.en[code], `en:${code}`).toBeTruthy();
    }
  });

  it('catalogs have no keys outside the code lists', () => {
    const known = new Set<string>([...REASON_CODES, ...ERROR_CODES]);
    for (const key of Object.keys(catalogs.ar)) expect(known.has(key), key).toBe(true);
    expect(Object.keys(catalogs.ar).sort()).toEqual(Object.keys(catalogs.en).sort());
  });
});

describe('device binding state machine (specs §C)', () => {
  it('only HR can reactivate a suspended binding', () => {
    expect(canTransitionBinding('SUSPENDED', 'ACTIVE', ['hr'])).toBe(true);
    expect(canTransitionBinding('SUSPENDED', 'ACTIVE', ['tenant_admin'])).toBe(false);
    expect(canTransitionBinding('SUSPENDED', 'ACTIVE', ['employee'])).toBe(false);
  });

  it('supersession happens only inside an approved change flow', () => {
    expect(canTransitionBinding('ACTIVE', 'SUPERSEDED', 'system')).toBe(true);
    expect(canTransitionBinding('ACTIVE', 'SUPERSEDED', ['hr'])).toBe(false);
  });

  it('employees cannot change any binding status directly', () => {
    expect(canTransitionBinding('ACTIVE', 'SUSPENDED', ['employee'])).toBe(false);
    expect(canTransitionBinding('PENDING_ACTIVATION', 'ACTIVE', ['employee'])).toBe(false);
  });

  it('terminal states have no exits', () => {
    for (const to of ['ACTIVE', 'SUSPENDED', 'PENDING_ACTIVATION'] as const) {
      expect(canTransitionBinding('SUPERSEDED', to, ['hr'])).toBe(false);
      expect(canTransitionBinding('REVOKED', to, ['hr'])).toBe(false);
    }
  });

  it('an active, suspended or pending binding blocks a new first binding (F6)', () => {
    expect(blocksFirstBinding('ACTIVE')).toBe(true);
    expect(blocksFirstBinding('SUSPENDED')).toBe(true);
    expect(blocksFirstBinding('PENDING_ACTIVATION')).toBe(true);
    expect(blocksFirstBinding('REVOKED')).toBe(false);
    expect(blocksFirstBinding('SUPERSEDED')).toBe(false);
  });

  it('change requests expire after the TTL', () => {
    const created = new Date('2026-01-01T00:00:00Z');
    expect(isChangeRequestExpired(created, new Date('2026-01-07T23:59:59Z'), 7)).toBe(false);
    expect(isChangeRequestExpired(created, new Date('2026-01-08T00:00:00Z'), 7)).toBe(true);
  });
});

describe('activation codes', () => {
  it('are 8 characters from the unambiguous alphabet', () => {
    const code = activationCodeFromBytes(new Uint8Array([0, 31, 32, 255, 7, 8, 9, 10]));
    expect(code).toHaveLength(8);
    for (const ch of code) expect(ACTIVATION_ALPHABET).toContain(ch);
  });

  it('normalizes user input', () => {
    expect(normalizeActivationCode(' ab2c-d3ef ')).toBe('AB2CD3EF');
  });
});

describe('MFA policy', () => {
  it('is required for HR and admins, not employees or branch managers', () => {
    expect(requiresMfa(['hr'])).toBe(true);
    expect(requiresMfa(['tenant_admin'])).toBe(true);
    expect(requiresMfa(['platform_admin'])).toBe(true);
    expect(requiresMfa(['employee'])).toBe(false);
    expect(requiresMfa(['branch_manager', 'employee'])).toBe(false);
  });
});
