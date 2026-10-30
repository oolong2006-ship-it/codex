import { NextRequest, NextResponse } from 'next/server';
import { refreshTokens } from './lib/auth-api';
import { COOKIE_ACCESS, COOKIE_MFA, COOKIE_MFA_SETUP, COOKIE_REFRESH } from './lib/config';
import { applyTokenCookies, withCookies } from './lib/cookies';
import { sessionAction } from './lib/session-policy';

function redirectToLogin(req: NextRequest): NextResponse {
  return NextResponse.redirect(new URL('/login', req.url));
}

/**
 * تجديد رمز الوصول عند الحاجة. الرمز الجديد يُمرَّر إلى الطلب نفسه عبر الترويسة،
 * فتراه الصفحات في العرض، ويُحفظ في الاستجابة للطلبات اللاحقة.
 */
export async function middleware(req: NextRequest): Promise<NextResponse> {
  const isPublic = req.nextUrl.pathname.startsWith('/login');
  const refresh = req.cookies.get(COOKIE_REFRESH)?.value;
  const action = sessionAction({
    isPublic,
    hasAccess: Boolean(req.cookies.get(COOKIE_ACCESS)?.value),
    hasRefresh: Boolean(refresh),
  });

  if (action === 'allow') return NextResponse.next();
  if (action === 'login' || !refresh) return redirectToLogin(req);

  try {
    const tokens = await refreshTokens(refresh);
    const headers = new Headers(req.headers);
    headers.set(
      'cookie',
      withCookies(req.headers.get('cookie') ?? '', {
        [COOKIE_ACCESS]: tokens.access_token,
        [COOKIE_REFRESH]: tokens.refresh_token,
      }),
    );
    const res = NextResponse.next({ request: { headers } });
    applyTokenCookies(res.cookies, tokens);
    return res;
  } catch {
    const res = redirectToLogin(req);
    res.cookies.delete(COOKIE_ACCESS);
    res.cookies.delete(COOKIE_REFRESH);
    res.cookies.delete(COOKIE_MFA);
    res.cookies.delete(COOKIE_MFA_SETUP);
    return res;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
