import { jwtSecret } from './jwt-config';

describe('jwtSecret (production guard)', () => {
  const strong = 'x'.repeat(32);

  it('throws in production when JWT_SECRET is missing', () => {
    expect(() => jwtSecret({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
  });

  it('throws in production when JWT_SECRET is shorter than 32 chars', () => {
    expect(() => jwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'change-me-in-production' })).toThrow(/32/);
  });

  it('accepts a 32+ char secret in production', () => {
    expect(jwtSecret({ NODE_ENV: 'production', JWT_SECRET: strong })).toBe(strong);
  });

  it('keeps the dev/test fallback outside production', () => {
    expect(jwtSecret({})).toBeTruthy();
    expect(jwtSecret({ NODE_ENV: 'test' })).toBeTruthy();
    expect(jwtSecret({ NODE_ENV: 'development', JWT_SECRET: 'short' })).toBe('short');
  });
});
