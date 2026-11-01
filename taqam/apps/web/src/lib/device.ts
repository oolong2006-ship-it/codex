/**
 * ESS device binding: a random id generated once per browser and kept in localStorage. It identifies the
 * phone an employee punches from (sent as X-Device-Id on check-in/out). Nothing about the person — no photos.
 */
export const DEVICE_ID_KEY = 'shuoon.deviceId';
const VALID = /^[A-Za-z0-9._:-]{8,128}$/;

let cached: string | null = null;

function randomId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** This browser's device id (created on first use). If storage is blocked it lives for this session only. */
export function getDeviceId(): string {
  if (cached) return cached;
  let stored: string | null = null;
  try { stored = typeof window !== 'undefined' ? window.localStorage.getItem(DEVICE_ID_KEY) : null; } catch { /* storage blocked */ }
  if (stored && VALID.test(stored)) return (cached = stored);
  const id = randomId();
  try { if (typeof window !== 'undefined') window.localStorage.setItem(DEVICE_ID_KEY, id); } catch { /* storage blocked: session-only id */ }
  return (cached = id);
}

/** Test hook: forget the in-memory copy so the next call re-reads storage. */
export function resetDeviceIdForTests() {
  cached = null;
}
