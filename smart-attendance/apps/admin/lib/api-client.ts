import { API_BASE_URL } from './config';

/** خطأ من الخادم بالصيغة الموحدة { error: { code, message_ar, message_en } }. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly messageAr: string,
    readonly messageEn: string,
  ) {
    super(messageEn);
    this.name = 'ApiError';
  }
}

export interface ApiRequest {
  method?: 'GET' | 'POST';
  body?: unknown;
  token?: string;
  query?: Record<string, string | undefined>;
}

/** يبني المسار مع الاستعلام، ويتجاهل القيم الفارغة. */
export function buildPath(path: string, query?: Record<string, string | undefined>): string {
  const entries = Object.entries(query ?? {}).filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== '');
  if (!entries.length) return path;
  return `${path}?${new URLSearchParams(entries).toString()}`;
}

export function apiRequest(path: string, req: ApiRequest = {}, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (req.token) headers.authorization = `Bearer ${req.token}`;
  if (req.body !== undefined) headers['content-type'] = 'application/json';
  return fetchImpl(`${API_BASE_URL}${buildPath(path, req.query)}`, {
    method: req.method ?? 'GET',
    headers,
    body: req.body === undefined ? undefined : JSON.stringify(req.body),
    cache: 'no-store',
  });
}

export async function toApiError(res: Response): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => null);
  const error = (body as { error?: Record<string, unknown> } | null)?.error ?? {};
  return new ApiError(
    res.status,
    String(error.code ?? 'INTERNAL'),
    String(error.message_ar ?? 'حدث خطأ غير متوقع.'),
    String(error.message_en ?? 'Unexpected error.'),
  );
}

export async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
