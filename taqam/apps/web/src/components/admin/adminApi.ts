// Small additions to the shared API client that the admin portal needs.
import { API_URL, ApiError, getToken } from '@/lib/api';
import { IS_DEMO } from '@/lib/paths';

/** DELETE with a JSON body (the shared `api.del` sends none; DELETE /admin/companies/:id needs `{ confirmName }`). */
export async function delWithBody<T>(path: string, body: unknown): Promise<T> {
  if (IS_DEMO) {
    const { demoFetch } = await import('@/demo/client');
    const res = await demoFetch('DELETE', path, { body, query: undefined, token: getToken() });
    if (res.status >= 400) {
      const d = (res.data || {}) as { message?: string | string[]; messageAr?: string };
      throw new ApiError(res.status, Array.isArray(d.message) ? d.message.join('، ') : d.message || `HTTP ${res.status}`, d.messageAr, res.data);
    }
    return res.data as T;
  }
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Network error', 'تعذر الاتصال بالخادم');
  }
  const text = await res.text();
  let data: unknown;
  try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }
  if (!res.ok) {
    const d = (data || {}) as { message?: string | string[]; messageAr?: string };
    throw new ApiError(res.status, Array.isArray(d.message) ? d.message.join('، ') : d.message || res.statusText, d.messageAr, data);
  }
  return data as T;
}

/** `YYYY-MM-DD` for date inputs from an ISO string. */
export const dayOf = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');
/** Integer or null from an input value. */
export const intOrNull = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.round(Number(v))));
export const numOrNull = (v: string) => (v.trim() === '' ? null : Math.max(0, Number(v)));
