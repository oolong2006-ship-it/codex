import { parseTrustProxy } from './setup-app';

describe('parseTrustProxy (TRUST_PROXY env)', () => {
  it('is off when unset or empty', () => {
    expect(parseTrustProxy(undefined)).toBeUndefined();
    expect(parseTrustProxy('')).toBeUndefined();
    expect(parseTrustProxy('false')).toBeUndefined();
  });
  it('accepts a hop count, true, or an Express subnet list', () => {
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('loopback, 172.16.0.0/12')).toBe('loopback, 172.16.0.0/12');
  });
});
