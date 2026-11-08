"use client";

import { useActionState, useRef } from "react";
import { createBranchAction } from "./actions";
import { FormMessage, SubmitButton } from "@/components/form-bits";

export function BranchForm({ labels }: { labels: { name: string; city: string; add: string } }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(async (s: Parameters<typeof createBranchAction>[0], fd: FormData) => {
    const r = await createBranchAction(s, fd);
    if (!r?.error) ref.current?.reset();
    return r;
  }, undefined);
  return (
    <form ref={ref} action={action} className="card grid gap-3 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div>
        <label className="label" htmlFor="b-name">{labels.name}</label>
        <input id="b-name" name="name" required minLength={2} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="b-city">{labels.city}</label>
        <input id="b-city" name="city" className="input" />
      </div>
      <SubmitButton>{labels.add}</SubmitButton>
      <div className="sm:col-span-3"><FormMessage state={state} /></div>
    </form>
  );
}
