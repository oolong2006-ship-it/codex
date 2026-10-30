import { COOKIE_ACCESS, COOKIE_REFRESH } from './config';
import type { TokenPair } from './auth-api';

/** خيارات ملفات الجلسة: لا تصل إلى JavaScript في المتصفح. */
export function sessionCookieOptions(maxAgeSeconds: number, secure = process.env.NODE_ENV === 'production') {
  return { httpOnly: true, sameSite: 'lax' as const, secure, path: '/', maxAge: maxAgeSeconds };
}

/** الرمز يُحمل حتى قبل انتهائه بدقيقة، فلا يصل الطلب بتوكن منتهٍ. */
export function accessMaxAge(expiresIn: number): number {
  return Math.max(60, expiresIn - 60);
}

/** رمز التحديث يعيش ما يعيشه الجهاز في الجلسة؛ الخادم هو من يلغيه عند الحاجة. */
export const REFRESH_MAX_AGE = 30 * 24 * 3600;

/** يضع رمزي الجلسة في أي كائن يدعم set (الاستجابة أو مخزن الكوكيز). */
export function applyTokenCookies(
  target: { set(name: string, value: string, options: ReturnType<typeof sessionCookieOptions>): unknown },
  tokens: TokenPair,
): void {
  target.set(COOKIE_ACCESS, tokens.access_token, sessionCookieOptions(accessMaxAge(tokens.expires_in)));
  target.set(COOKIE_REFRESH, tokens.refresh_token, sessionCookieOptions(REFRESH_MAX_AGE));
}

/** يحدّث قيم كوكيز في ترويسة Cookie الواردة، ليراها الكود اللاحق في الطلب نفسه. */
export function withCookies(header: string, values: Record<string, string>): string {
  const pairs = header
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .filter((part) => !Object.keys(values).some((name) => part.startsWith(`${name}=`)));
  for (const [name, value] of Object.entries(values)) pairs.push(`${name}=${value}`);
  return pairs.join('; ');
}
