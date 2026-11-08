"use client";

import { deleteMyDataAction } from "./actions";

export function DeleteMyData({ serial, k, label, confirm }: { serial: string; k: string; label: string; confirm: string }) {
  return (
    <form action={deleteMyDataAction} onSubmit={(e) => { if (!window.confirm(confirm)) e.preventDefault(); }}>
      <input type="hidden" name="serial" value={serial} />
      <input type="hidden" name="k" value={k} />
      <button className="text-xs text-espresso-500 underline-offset-4 hover:text-rose-600 hover:underline">{label}</button>
    </form>
  );
}
