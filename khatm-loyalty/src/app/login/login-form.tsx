"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";
import { FormMessage, SubmitButton } from "@/components/form-bits";

export function LoginForm({ labels }: { labels: { email: string; password: string; submit: string } }) {
  const [state, action] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">{labels.email}</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" dir="ltr" />
      </div>
      <div>
        <label className="label" htmlFor="password">{labels.password}</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" dir="ltr" />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full py-3">{labels.submit}</SubmitButton>
    </form>
  );
}
