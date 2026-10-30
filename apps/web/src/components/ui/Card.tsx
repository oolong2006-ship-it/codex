import { HTMLAttributes } from 'react';
import { cx } from '@/lib/format';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        'rounded border border-border bg-surface shadow-sm',
        className,
      )}
      {...rest}
    />
  );
}
