'use client';

import { useActionState } from 'react';
import { loginAction, type LoginState } from './actions';

const initial: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="stack">
      <label className="field">
        <span>البريد أو رقم الجوال</span>
        <input name="identifier" autoComplete="username" required dir="ltr" />
      </label>
      <label className="field">
        <span>كلمة المرور</span>
        <input name="password" type="password" autoComplete="current-password" required dir="ltr" />
      </label>
      {state.error ? <p role="alert" className="notice error">{state.error}</p> : null}
      <button type="submit" disabled={pending}>{pending ? 'جارٍ الدخول…' : 'دخول'}</button>
    </form>
  );
}
