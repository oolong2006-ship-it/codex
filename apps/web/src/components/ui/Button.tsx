import { ButtonHTMLAttributes } from 'react';
import { cx } from '@/lib/format';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-contrast hover:opacity-90',
  secondary: 'bg-surface-2 text-text border border-border hover:bg-surface-3',
  danger: 'bg-danger text-white hover:opacity-90',
  ghost: 'text-text hover:bg-surface-2',
};

const SIZES: Record<Size, string> = {
  sm: 'text-xs px-2.5 py-1.5 rounded-sm',
  md: 'text-sm px-4 py-2 rounded',
  lg: 'text-md px-5 py-3 rounded font-bold',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 font-semibold transition active:scale-[.98] disabled:opacity-60 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  );
}
