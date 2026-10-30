import { cookies } from 'next/headers';
import { ApiError, apiRequest, readJson, type ApiRequest } from './api-client';
import { COOKIE_ACCESS } from './config';

/** يستدعي الخادم بتوكن الجلسة من الكوكيز. بلا توكن: خطأ 401 يحوّل المستخدم لتسجيل الدخول. */
export async function serverApi<T>(path: string, req: Omit<ApiRequest, 'token'> = {}): Promise<T> {
  const token = (await cookies()).get(COOKIE_ACCESS)?.value;
  if (!token) throw new ApiError(401, 'AUTH_UNAUTHENTICATED', 'سجّل الدخول للمتابعة.', 'Please sign in to continue.');
  return readJson<T>(await apiRequest(path, { ...req, token }));
}

export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/** رسالة مفهومة بالعربية لأي خطأ يُعرض للمستخدم. */
export function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.messageAr;
  return 'تعذر الاتصال بالخادم. حاول مرة أخرى.';
}
