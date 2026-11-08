"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className = "btn-primary", pendingLabel }: { children: React.ReactNode; className?: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? (pendingLabel ?? "…") : children}
    </button>
  );
}

export function FormMessage({ state }: { state?: { error?: string; ok?: string } }) {
  if (!state) return null;
  if (state.error)
    return (
      <p role="alert" className="rounded-xl border border-rose-600/20 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-600">
        {state.error}
      </p>
    );
  if (state.ok)
    return (
      <p role="status" className="rounded-xl border border-mint-600/20 bg-mint-50 px-3.5 py-2.5 text-sm text-mint-600">
        {state.ok}
      </p>
    );
  return null;
}
