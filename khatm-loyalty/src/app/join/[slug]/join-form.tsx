"use client";

import { useActionState } from "react";
import Link from "next/link";
import { joinAction } from "./actions";
import { FormMessage, SubmitButton } from "@/components/form-bits";

export function JoinForm({ slug, labels }: { slug: string; labels: Record<"name" | "phone" | "consent" | "marketing" | "submit" | "privacy", string> }) {
  const [state, action] = useActionState(joinAction, undefined);
  if (state?.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <div>
        <label className="label" htmlFor="name">{labels.name}</label>
        <input id="name" name="name" required minLength={2} maxLength={60} autoComplete="given-name" className="input py-3 text-lg" />
      </div>
      <div>
        <label className="label" htmlFor="phone">{labels.phone}</label>
        <input id="phone" name="phone" required type="tel" inputMode="tel" autoComplete="tel" placeholder="05XXXXXXXX" className="input py-3 text-lg tracking-wide" dir="ltr" />
      </div>
      <label className="flex items-start gap-2.5 text-sm leading-relaxed">
        <input type="checkbox" name="consent" required className="mt-1 h-4 w-4 shrink-0 accent-espresso-800" />
        <span>
          {labels.consent} — <Link href="/privacy" target="_blank" className="underline">{labels.privacy}</Link>
        </span>
      </label>
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="marketing" className="mt-1 h-4 w-4 shrink-0 accent-espresso-800" />
        <span>{labels.marketing}</span>
      </label>
      <FormMessage state={state} />
      <SubmitButton className="btn-accent w-full py-3.5 text-base">{labels.submit}</SubmitButton>
    </form>
  );
}
