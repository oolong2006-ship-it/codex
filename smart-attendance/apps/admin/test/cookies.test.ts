import { describe, expect, it } from 'vitest';
import { REFRESH_MAX_AGE, accessMaxAge, applyTokenCookies, sessionCookieOptions, withCookies } from '../lib/cookies';

describe('session cookies', () => {
  it('are httpOnly and lax, and expire before the token does', () => {
    const options = sessionCookieOptions(60, false);
    expect(options).toEqual({ httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 60 });
    expect(accessMaxAge(900)).toBe(840);
    expect(accessMaxAge(30)).toBe(60);
    expect(REFRESH_MAX_AGE).toBeGreaterThan(accessMaxAge(900));
  });

  it('writes both tokens with their own lifetimes', () => {
    const written: Record<string, { value: string; maxAge: number }> = {};
    applyTokenCookies(
      { set: (name, value, options) => (written[name] = { value, maxAge: options.maxAge }) },
      { access_token: 'a1', refresh_token: 'r1', token_type: 'Bearer', expires_in: 900 },
    );
    expect(written.sa_access).toEqual({ value: 'a1', maxAge: 840 });
    expect(written.sa_refresh).toEqual({ value: 'r1', maxAge: REFRESH_MAX_AGE });
  });

  it('replaces values inside a cookie header and keeps unrelated cookies', () => {
    const header = 'theme=dark; sa_access=old; sa_refresh=oldr; other=1';
    const next = withCookies(header, { sa_access: 'new', sa_refresh: 'newr' });
    expect(next.split('; ').sort()).toEqual(['other=1', 'sa_access=new', 'sa_refresh=newr', 'theme=dark']);
  });

  it('adds the values when the header is empty', () => {
    expect(withCookies('', { sa_access: 'x' })).toBe('sa_access=x');
  });
});
