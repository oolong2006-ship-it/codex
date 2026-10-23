'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-600 shadow-soft',
  accent: 'bg-accent text-primary hover:bg-accent-600 hover:text-white shadow-soft',
  secondary: 'bg-white text-primary border border-line hover:border-primary-500 hover:bg-primary-50',
  ghost: 'text-primary hover:bg-primary-50',
  danger: 'bg-danger text-white hover:opacity-90',
};
const sizes: Record<Size, string> = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-base' };
const base = 'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap';

export function Button({ variant = 'primary', size = 'md', loading, className, children, ...rest }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button className={clsx(base, variants[variant], sizes[size], className)} disabled={loading || rest.disabled} {...rest}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant = 'primary', size = 'md', className, children }:
  { href: string; variant?: Variant; size?: Size; className?: string; children: React.ReactNode }) {
  return <Link href={href} className={clsx(base, variants[variant], sizes[size], className)}>{children}</Link>;
}
