"use client";

import { useActionState, useRef, useState } from "react";
import { createStaffAction } from "./actions";
import { FormMessage, SubmitButton } from "@/components/form-bits";

type L = Record<"name" | "role" | "branch" | "email" | "password" | "pin" | "pinHint" | "passwordHint" | "add" | "allBranches" | "OWNER" | "MANAGER" | "CASHIER", string>;

export function StaffForm({ labels, branches }: { labels: L; branches: Array<{ id: string; name: string }> }) {
  const ref = useRef<HTMLFormElement>(null);
  const [role, setRole] = useState("CASHIER");
  const [state, action] = useActionState(async (s: Parameters<typeof createStaffAction>[0], fd: FormData) => {
    const r = await createStaffAction(s, fd);
    if (!r?.error) ref.current?.reset();
    return r;
  }, undefined);
  return (
    <form ref={ref} action={action} className="card grid gap-4 p-5 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="s-name">{labels.name}</label>
        <input id="s-name" name="name" required minLength={2} className="input" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="s-role">{labels.role}</label>
          <select id="s-role" name="role" className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            {(["CASHIER", "MANAGER", "OWNER"] as const).map((r) => <option key={r} value={r}>{labels[r]}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="s-branch">{labels.branch}</label>
          <select id="s-branch" name="branchId" className="input">
            <option value="">{labels.allBranches}</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="s-pin">{labels.pin}</label>
        <input id="s-pin" name="pin" inputMode="numeric" pattern="\d{4,6}" required={role === "CASHIER"} className="input font-mono tracking-[0.4em]" dir="ltr" autoComplete="off" />
        <p className="mt-1 text-xs text-espresso-500">{labels.pinHint}</p>
      </div>
      {role !== "CASHIER" && (
        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="s-email">{labels.email}</label>
            <input id="s-email" name="email" type="email" required className="input" dir="ltr" />
          </div>
          <div>
            <label className="label" htmlFor="s-password">{labels.password}</label>
            <input id="s-password" name="password" type="password" minLength={10} required className="input" dir="ltr" autoComplete="new-password" />
            <p className="mt-1 text-xs text-espresso-500">{labels.passwordHint}</p>
          </div>
        </div>
      )}
      <div className="flex items-end sm:col-span-2"><SubmitButton>{labels.add}</SubmitButton></div>
      <div className="sm:col-span-2"><FormMessage state={state} /></div>
    </form>
  );
}
