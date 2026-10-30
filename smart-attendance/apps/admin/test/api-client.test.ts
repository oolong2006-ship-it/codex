import { describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, buildPath, readJson } from '../lib/api-client';
import { login, refreshTokens } from '../lib/auth-api';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('buildPath', () => {
  it('skips empty and undefined query values', () => {
    expect(buildPath('/v1/x', { from: '2026-10-01', to: undefined, employee_id: '' })).toBe('/v1/x?from=2026-10-01');
    expect(buildPath('/v1/x', {})).toBe('/v1/x');
  });
});

describe('apiRequest', () => {
  it('sends the bearer token and a JSON body', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true }));
    await apiRequest('/v1/x', { method: 'POST', body: { a: 1 }, token: 't1' }, fetchImpl as unknown as typeof fetch);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer t1');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(init.body).toBe('{"a":1}');
  });
});

describe('readJson', () => {
  it('turns the server envelope into an ApiError with Arabic text', async () => {
    const res = jsonResponse(409, {
      error: { code: 'PERIOD_LOCKED', message_ar: 'الفترة مقفلة.', message_en: 'Locked.' },
    });
    const error = await readJson(res).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'PERIOD_LOCKED', messageAr: 'الفترة مقفلة.' });
  });

  it('falls back to a generic message when the body is not the envelope', async () => {
    const error = await readJson(new Response('oops', { status: 502 })).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 502, code: 'INTERNAL' });
  });

  it('returns undefined for 204', async () => {
    await expect(readJson(new Response(null, { status: 204 }))).resolves.toBeUndefined();
  });
});

describe('auth api', () => {
  it('posts credentials to login and returns the outcome', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { status: 'MFA_REQUIRED', mfa_token: 'm' }));
    const outcome = await login('hr@a.dev', 'secret', fetchImpl as unknown as typeof fetch);
    expect(outcome).toEqual({ status: 'MFA_REQUIRED', mfa_token: 'm' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/v1\/auth\/login$/);
    expect(JSON.parse(String(init.body))).toEqual({ identifier: 'hr@a.dev', password: 'secret' });
  });

  it('rotates the refresh token', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { access_token: 'a2', refresh_token: 'r2', token_type: 'Bearer', expires_in: 900 }),
    );
    const tokens = await refreshTokens('r1', fetchImpl as unknown as typeof fetch);
    expect(tokens.refresh_token).toBe('r2');
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ refresh_token: 'r1' });
  });
});
