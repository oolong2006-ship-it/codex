'use client';
import clsx from 'clsx';
import { useId, useState } from 'react';
import { Plus } from 'lucide-react';
import type { T2 } from './data';
import { useT2 } from './primitives';

export function Faq({ items, className }: { items: { q: T2; a: T2 }[]; className?: string }) {
  const { tt } = useT2();
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();
  return (
    <div className={clsx('divide-y divide-line rounded-2xl border border-line bg-white shadow-soft', className)}>
      {items.map((it, i) => {
        const isOpen = open === i;
        const id = `${base}-${i}`;
        return (
          <div key={i}>
            <h3>
              <button type="button" aria-expanded={isOpen} aria-controls={id} onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-start text-base font-semibold text-ink transition-colors hover:text-primary focus-visible:bg-primary-50 focus-visible:outline-none sm:px-6 sm:py-5">
                <span>{tt(it.q)}</span>
                <span className={clsx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all',
                  isOpen ? 'rotate-45 border-accent bg-accent text-primary' : 'border-line text-primary-500')}>
                  <Plus className="h-4 w-4" aria-hidden />
                </span>
              </button>
            </h3>
            <div id={id} role="region" hidden={!isOpen} className="px-5 pb-5 text-sm leading-7 text-ink-muted sm:px-6">
              {tt(it.a)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
