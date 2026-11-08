"use client";

import { deleteCustomerAction } from "./actions";

export function DeleteCustomerButton({ id, label, confirm }: { id: string; label: string; confirm: string }) {
  return (
    <form action={deleteCustomerAction} onSubmit={(e) => { if (!window.confirm(confirm)) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <button className="text-xs font-medium text-rose-600 hover:underline">{label}</button>
    </form>
  );
}
