// Thin fetch client for the Taqam API (see docs/API_CONTRACT.md).
// In the static demo build (NEXT_PUBLIC_DEMO=1) every call is answered by an in-browser mock (src/demo), loaded lazily.
import { IS_DEMO } from './paths';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4100/api';
const TOKEN_KEY = 'taqam.token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage unavailable */ }
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public messageAr?: string, public body?: unknown) {
    super(message);
  }
  /** Best message for the UI (Arabic first). */
  get display() { return this.messageAr || this.message; }
}

type Query = Record<string, string | number | boolean | null | undefined>;
function qs(query?: Query) {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  if (IS_DEMO) return demoRequest<T>(method, path, body, query);
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}${qs(query)}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, 'Network error', 'تعذر الاتصال بالخادم');
  }
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/login')) {
    setToken(null);
  }
  const text = await res.text();
  const data = text ? safeJson(text) : undefined;
  if (!res.ok) {
    const d = (data || {}) as { message?: string | string[]; messageAr?: string };
    const msg = Array.isArray(d.message) ? d.message.join('، ') : d.message || res.statusText;
    throw new ApiError(res.status, msg, d.messageAr, data);
  }
  return data as T;
}
function safeJson(t: string) { try { return JSON.parse(t); } catch { return t; } }

// ---------- demo mode (no backend) ----------
let demoModule: Promise<typeof import('@/demo/client')> | null = null;
const loadDemo = () => (demoModule ??= import('@/demo/client'));

async function demoCall(method: string, path: string, body?: unknown, query?: Query) {
  const { demoFetch } = await loadDemo();
  const res = await demoFetch(method, path, { body, query, token: getToken() });
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/login')) setToken(null);
  if (res.status >= 400) {
    const d = (res.data || {}) as { message?: string | string[]; messageAr?: string };
    const msg = Array.isArray(d.message) ? d.message.join('، ') : d.message || `HTTP ${res.status}`;
    throw new ApiError(res.status, msg, d.messageAr, res.data);
  }
  return res.data;
}
async function demoRequest<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  return (await demoCall(method, path, body, query)) as T;
}
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
  /** Download a file (CSV etc.) with auth and trigger a browser save. */
  async download(path: string, filename: string, query?: Query) {
    if (IS_DEMO) {
      const data = await demoCall('GET', path, undefined, query);
      saveBlob(new Blob([typeof data === 'string' ? data : JSON.stringify(data)], { type: 'text/csv;charset=utf-8' }), filename);
      return;
    }
    const token = getToken();
    const res = await fetch(`${API_URL}${path}${qs(query)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) {
      const t = await res.text();
      const d = (safeJson(t) || {}) as { message?: string; messageAr?: string };
      throw new ApiError(res.status, d.message || res.statusText, d.messageAr, d);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  },
};

export interface Paginated<T> { data: T[]; total: number; page: number; pageSize: number; }
