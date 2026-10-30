'use client';

import { useActionState } from 'react';
import { mfaAction, type LoginState } from './actions';

const initial: LoginState = {};

export function MfaForm() {
  const [state, action, pending] = useActionState(mfaAction, initial);
  return (
    <form action={action} className="stack">
      <label className="field">
        <span>رمز التحقق (6 أرقام)</span>
        <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" required dir="ltr" />
      </label>
      {state.error ? <p role="alert" className="notice error">{state.error}</p> : null}
      <button type="submit" disabled={pending}>{pending ? 'جارٍ التحقق…' : 'تأكيد'}</button>
    </form>
  );
}
