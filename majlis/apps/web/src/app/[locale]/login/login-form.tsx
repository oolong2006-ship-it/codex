"use client";

import { t, type Locale } from "@majlis/i18n";
import { useActionState } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { loginAction } from "./actions";

export function LoginForm({ locale }: { locale: Locale }) {
  const [state, action, pending] = useActionState(loginAction.bind(null, locale), { error: false });
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label={t(locale, "auth.email")}>
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          dir="ltr"
          className={inputClass}
        />
      </Field>
      <Field label={t(locale, "auth.password")}>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          dir="ltr"
          className={inputClass}
        />
      </Field>
      {state.error && (
        <p role="alert" className="text-red-700">
          {t(locale, "auth.invalid")}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {t(locale, "auth.submit")}
      </Button>
    </form>
  );
}
