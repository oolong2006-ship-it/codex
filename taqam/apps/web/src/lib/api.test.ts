import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_TOKEN_KEY, changePassword, endSession, getToken, setToken, startSession } from './api';

// Minimal browser surface: api.ts reads the token from window.localStorage.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
});
afterEach(() => vi.unstubAllGlobals());

const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('changePassword', () => {
  it('stores the fresh token the server returns so the session survives the revocation', async () => {
    setToken('old-token');
    const fetchMock = reply(200, { ok: true, accessToken: 'new-token' });
    vi.stubGlobal('fetch', fetchMock);
    await changePassword('Old#Passw0rd', 'N3w#Passw0rd');
    expect(getToken()).toBe('new-token');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/auth\/change-password$/);
    expect(JSON.parse(String(init.body))).toEqual({ currentPassword: 'Old#Passw0rd', newPassword: 'N3w#Passw0rd' });
  });

  it('keeps the current token when the server returns none (e.g. impersonation)', async () => {
    setToken('old-token');
    vi.stubGlobal('fetch', reply(200, { ok: true }));
    await changePassword('a', 'b');
    expect(getToken()).toBe('old-token');
  });

  it('rejects with the Arabic message on a wrong current password and keeps the token', async () => {
    setToken('old-token');
    vi.stubGlobal('fetch', reply(400, { statusCode: 400, message: 'Wrong password', messageAr: 'كلمة المرور الحالية غير صحيحة' }));
    await expect(changePassword('bad', 'N3w#Passw0rd')).rejects.toMatchObject({ display: 'كلمة المرور الحالية غير صحيحة' });
    expect(getToken()).toBe('old-token');
  });
});

describe('session start / end clears the impersonation admin token', () => {
  it('login/register (startSession) stores the new token and removes the stored admin token', () => {
    store.set(ADMIN_TOKEN_KEY, 'admin-token');
    setToken('owner-token-from-impersonation');
    startSession('fresh-token');
    expect(getToken()).toBe('fresh-token');
    expect(store.has(ADMIN_TOKEN_KEY)).toBe(false);
  });
  it('logout (endSession) removes both tokens', () => {
    store.set(ADMIN_TOKEN_KEY, 'admin-token');
    setToken('owner-token');
    endSession();
    expect(getToken()).toBeNull();
    expect(store.has(ADMIN_TOKEN_KEY)).toBe(false);
  });
  it('uses the key the impersonation banner reads', () => {
    expect(ADMIN_TOKEN_KEY).toBe('taqam.adminToken');
  });
});
