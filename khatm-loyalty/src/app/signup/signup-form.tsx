"use client";

import { useActionState, useState } from "react";
import { signupAction } from "../login/actions";
import { FormMessage, SubmitButton } from "@/components/form-bits";

type L = Record<"businessName" | "slug" | "slugHint" | "ownerName" | "email" | "password" | "branchName" | "city" | "submit", string>;

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

export function SignupForm({ labels }: { labels: L }) {
  const [state, action] = useActionState(signupAction, undefined);
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="businessName">{labels.businessName}</label>
        <input id="businessName" name="businessName" required minLength={2} className="input" onChange={(e) => !touched && setSlug(slugify(e.target.value))} />
      </div>
      <div>
        <label className="label" htmlFor="slug">{labels.slug}</label>
        <input id="slug" name="slug" required pattern="[a-z0-9][a-z0-9\-]{2,40}" className="input font-mono" dir="ltr" value={slug} onChange={(e) => { setTouched(true); setSlug(e.target.value.toLowerCase()); }} />
        <p className="mt-1 text-xs text-espresso-500">{labels.slugHint}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="branchName">{labels.branchName}</label>
          <input id="branchName" name="branchName" required minLength={2} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="city">{labels.city}</label>
          <input id="city" name="city" className="input" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="ownerName">{labels.ownerName}</label>
        <input id="ownerName" name="ownerName" required minLength={2} className="input" autoComplete="name" />
      </div>
      <div>
        <label className="label" htmlFor="email">{labels.email}</label>
        <input id="email" name="email" type="email" required className="input" dir="ltr" autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="password">{labels.password}</label>
        <input id="password" name="password" type="password" required minLength={10} className="input" dir="ltr" autoComplete="new-password" />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-accent w-full py-3">{labels.submit}</SubmitButton>
    </form>
  );
}
