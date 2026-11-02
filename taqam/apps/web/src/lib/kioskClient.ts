/** Kiosk screen client: X-Kiosk-Token auth, token storage. Rules live in ./kiosk. */
import { ApiError, API_URL } from './api';
import { IS_DEMO } from './paths';
import { isKioskToken } from './kiosk';

export const KIOSK_TOKEN_KEY = 'shuoon.kioskToken';

export function getKioskToken(): string | null {
  try {
    const t = typeof window !== 'undefined' ? window.localStorage.getItem(KIOSK_TOKEN_KEY) : null;
    return t && isKioskToken(t) ? t : null;
  } catch {
    return null;
  }
}
export function setKioskToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(KIOSK_TOKEN_KEY, token.trim().toLowerCase());
    else window.localStorage.removeItem(KIOSK_TOKEN_KEY);
  } catch { /* storage unavailable: the screen asks for the code again next time */ }
}

export interface KioskInfo { branchName: string; companyName: string; branchCode: string; codeExpiresInSeconds: number }
export interface KioskPunchResult { action: 'IN' | 'OUT'; employeeName: string; time: string; lateMinutes: number }

/** Kiosk calls carry X-Kiosk-Token and never the user session (a 401 here never logs anyone out). */
export async function kioskRequest<T>(method: 'GET' | 'POST', path: string, token: string, body?: unknown): Promise<T> {
  let status: number;
  let data: unknown;
  if (IS_DEMO) {
    const { demoFetch } = await import('@/demo/client');
    const res = await demoFetch(method, path, { body, token: null, headers: { 'X-Kiosk-Token': token } });
    status = res.status;
    data = res.data;
  } else {
    let res: Response;
    try {
      res = await fetch(`${API_URL}${path}`, {
        method,
        headers: { Accept: 'application/json', 'X-Kiosk-Token': token, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(0, 'Network error', 'تعذر الاتصال بالخادم');
    }
    status = res.status;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }
  }
  if (status >= 400) {
    const d = (data || {}) as { message?: string | string[]; messageAr?: string };
    const msg = Array.isArray(d.message) ? d.message.join('، ') : d.message || `HTTP ${status}`;
    throw new ApiError(status, msg, d.messageAr, data);
  }
  return data as T;
}

/** True when the API says this kiosk token is unknown or revoked (the screen returns to pairing). */
export const isTokenRejected = (e: unknown) =>
  e instanceof ApiError && e.status === 401 && (e.body as { code?: string } | undefined)?.code === 'KIOSK_TOKEN_INVALID';
