'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';
/** Exported for the contrast test (src/lib/brand.test.ts): accent hover is white on accent-600 (navy on it is 2.7:1). */
export const BUTTON_VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-600 shadow-soft',
  accent: 'bg-accent text-night hover:bg-accent-600 hover:text-white shadow-soft',
  secondary: 'bg-white text-primary border border-line hover:border-primary-500 hover:bg-primary-50',
  ghost: 'text-primary hover:bg-primary-50',
  danger: 'bg-danger text-white hover:opacity-90',
};
const variants = BUTTON_VARIANTS;
const sizes: Record<Size, string> = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-base' };
const base = 'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap';

/**
 * `loading` always disables the button — `disabled` is applied after the spread so a caller's `disabled={false}`
 * cannot re-enable it mid-request (a double click on «إصدار الفاتورة» used to issue two invoices).
 */
export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button {...rest} className={clsx(base, variants[variant], sizes[size], className)} disabled={!!loading || !!disabled} aria-busy={loading || undefined}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant = 'primary', size = 'md', className, children }:
  { href: string; variant?: Variant; size?: Size; className?: string; children: React.ReactNode }) {
  return <Link href={href} className={clsx(base, variants[variant], sizes[size], className)}>{children}</Link>;
}
