'use client';
import clsx from 'clsx';
import { forwardRef } from 'react';

const control = 'w-full rounded-xl border border-line bg-white px-3 text-sm text-ink placeholder:text-ink-soft focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-sand';

export function Label({ children, htmlFor, required }: { children: React.ReactNode; htmlFor?: string; required?: boolean }) {
  return <label htmlFor={htmlFor} className="field-label">{children}{required && <span className="text-danger"> *</span>}</label>;
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={clsx(control, 'h-10', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={clsx(control, 'min-h-[90px] py-2', className)} {...rest} />;
});

export function Select({ className, options, placeholder, ...rest }:
  React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <select className={clsx(control, 'h-10', className)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** Label + control + optional hint/error in one block. */
export function Field({ label, required, hint, error, children, className }:
  { label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label required={required}>{label}</Label>
      {children}
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : hint ? <p className="mt-1 text-xs text-ink-soft">{hint}</p> : null}
    </div>
  );
}
