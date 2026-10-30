'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { enrollMfa, login, verifyMfa, type LoginOutcome } from '../../lib/auth-api';
import { COOKIE_MFA, COOKIE_MFA_SETUP } from '../../lib/config';
import { applyTokenCookies, sessionCookieOptions } from '../../lib/cookies';
import { messageOf } from '../../lib/server-api';

export interface LoginState {
  error?: string;
}

const MFA_WINDOW_SECONDS = 300;

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const identifier = String(formData.get('identifier') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!identifier || !password) return { error: 'أدخل البريد أو الجوال وكلمة المرور.' };

  let outcome: LoginOutcome;
  try {
    outcome = await login(identifier, password);
  } catch (error) {
    return { error: messageOf(error) };
  }

  const store = await cookies();
  if (outcome.status === 'OK') {
    applyTokenCookies(store, outcome);
    redirect('/');
  }

  store.set(COOKIE_MFA, outcome.mfa_token, sessionCookieOptions(MFA_WINDOW_SECONDS));
  if (outcome.status === 'MFA_ENROLLMENT_REQUIRED') {
    try {
      const setup = await enrollMfa(outcome.mfa_token);
      store.set(COOKIE_MFA_SETUP, JSON.stringify(setup), sessionCookieOptions(MFA_WINDOW_SECONDS));
    } catch (error) {
      return { error: messageOf(error) };
    }
    redirect('/login/mfa?mode=setup');
  }
  redirect('/login/mfa');
}

export async function mfaAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const code = String(formData.get('code') ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return { error: 'أدخل الرمز المكوّن من 6 أرقام.' };

  const store = await cookies();
  const mfaToken = store.get(COOKIE_MFA)?.value;
  if (!mfaToken) redirect('/login');

  let tokens: Awaited<ReturnType<typeof verifyMfa>>;
  try {
    tokens = await verifyMfa(mfaToken, code);
  } catch (error) {
    return { error: messageOf(error) };
  }
  applyTokenCookies(store, tokens);
  store.delete(COOKIE_MFA);
  store.delete(COOKIE_MFA_SETUP);
  redirect('/');
}
