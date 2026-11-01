import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_ID_KEY, getDeviceId, resetDeviceIdForTests } from './device';
import { api } from './api';

const store = new Map<string, string>();
const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
beforeEach(() => {
  store.clear();
  resetDeviceIdForTests();
  vi.stubGlobal('window', { localStorage: storage });
});
afterEach(() => vi.unstubAllGlobals());

describe('device id (ESS device binding)', () => {
  it('generates a random id once and keeps it in localStorage shuoon.deviceId', () => {
    expect(DEVICE_ID_KEY).toBe('shuoon.deviceId');
    const id = getDeviceId();
    expect(id).toMatch(/^[A-Za-z0-9-]{16,64}$/);
    expect(store.get('shuoon.deviceId')).toBe(id);
    resetDeviceIdForTests();
    expect(getDeviceId()).toBe(id);
  });

  it('reuses an id already stored on this device', () => {
    store.set('shuoon.deviceId', 'existing-device-id-123');
    expect(getDeviceId()).toBe('existing-device-id-123');
  });

  it('two devices get different ids', () => {
    const a = getDeviceId();
    store.clear();
    resetDeviceIdForTests();
    expect(getDeviceId()).not.toBe(a);
  });

  it('still works (for this session) when storage throws', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => {} } });
    const id = getDeviceId();
    expect(id).toMatch(/^[A-Za-z0-9-]{16,64}$/);
    expect(getDeviceId()).toBe(id);
  });
});

describe('api client sends X-Device-Id on ESS punches only', () => {
  const ok = () => vi.fn(async () => new Response('{}', { status: 200 }));
  const headersOf = (m: ReturnType<typeof ok>, i = 0) => ((m.mock.calls[i] as unknown as [string, RequestInit])[1].headers ?? {}) as Record<string, string>;

  it('check-in and check-out carry the stored device id', async () => {
    const f = ok();
    vi.stubGlobal('fetch', f);
    await api.post('/me/attendance/check-in', { lat: 1, lng: 2 });
    await api.post('/me/attendance/check-out', { lat: 1, lng: 2 });
    const id = store.get('shuoon.deviceId');
    expect(id).toMatch(/^[A-Za-z0-9-]{16,64}$/);
    expect(headersOf(f, 0)['X-Device-Id']).toBe(id);
    expect(headersOf(f, 1)['X-Device-Id']).toBe(id);
  });

  it('other calls do not', async () => {
    const f = ok();
    vi.stubGlobal('fetch', f);
    await api.get('/me/home');
    await api.post('/me/leaves', {});
    expect(headersOf(f, 0)['X-Device-Id']).toBeUndefined();
    expect(headersOf(f, 1)['X-Device-Id']).toBeUndefined();
  });
});
