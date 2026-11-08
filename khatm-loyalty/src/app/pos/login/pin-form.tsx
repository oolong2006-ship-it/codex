"use client";

import { useActionState } from "react";
import { pinLoginAction } from "../actions";
import { FormMessage, SubmitButton } from "@/components/form-bits";

export function PinForm({ labels, defaultMerchant }: { labels: Record<"merchant" | "pin" | "submit", string>; defaultMerchant?: string }) {
  const [state, action] = useActionState(pinLoginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="merchant">{labels.merchant}</label>
        <input id="merchant" name="merchant" required defaultValue={defaultMerchant} autoCapitalize="none" autoCorrect="off" className="input font-mono" dir="ltr" />
      </div>
      <div>
        <label className="label" htmlFor="pin">{labels.pin}</label>
        <input id="pin" name="pin" type="password" inputMode="numeric" pattern="\d{4,6}" required autoComplete="off" className="input text-center font-mono text-2xl tracking-[0.6em]" dir="ltr" />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full py-3.5 text-base">{labels.submit}</SubmitButton>
    </form>
  );
}
