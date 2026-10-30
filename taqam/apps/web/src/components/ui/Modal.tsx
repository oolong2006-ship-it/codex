'use client';
import { X } from 'lucide-react';
import { useId } from 'react';
import clsx from 'clsx';
import { useLang } from '@/lib/i18n';
import { useDialog } from './useDialog';

export function Modal({ open, onClose, title, children, footer, size = 'md' }:
  { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const { t } = useLang();
  const titleId = useId();
  const ref = useDialog<HTMLDivElement>(open, onClose);
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-primary/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div ref={ref} tabIndex={-1} className={clsx('flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-lift outline-none sm:rounded-2xl', w)}
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-ink-muted hover:bg-sand" aria-label={t('إغلاق', 'Close')}><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4" data-dialog-body>{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}
