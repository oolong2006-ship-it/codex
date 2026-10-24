'use client';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect } from 'react';
import { useLang } from '@/lib/i18n';
import { period as fmtPeriod } from '@/lib/format';
import { shiftPeriod } from './utils';

/** Native-feeling bottom sheet constrained to the phone column. */
export function Sheet({ open, onClose, title, children, footer }:
  { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-primary/40 backdrop-blur-[2px] print:hidden" onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
        className="ess-sheet flex max-h-[90dvh] w-full max-w-[440px] flex-col rounded-t-[28px] bg-white shadow-lift">
        <div className="flex justify-center pt-2.5"><span className="h-1.5 w-10 rounded-full bg-sand-300" /></div>
        <div className="flex items-center justify-between px-5 pb-2 pt-2">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full text-ink-muted hover:bg-sand" aria-label="close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-line px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-xl bg-sand-200', className)} />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4">
          <Skeleton className="h-11 w-11 rounded-2xl" />
          <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3 w-1/3" /></div>
        </div>
      ))}
    </div>
  );
}

/** Circular progress ring. value/max clamped. */
export function Ring({ value, max, size = 76, stroke = 8, color = '#FFB547', track = '#E8EEEB', children }:
  { value: number; max: number; size?: number; stroke?: number; color?: string; track?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function Section({ title, action, children, className }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx('space-y-3', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between px-1">
          {title && <h2 className="text-[15px] font-bold text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 px-1 pt-1">
      <div>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }:
  { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
  return (
    <div className={clsx('flex rounded-2xl bg-sand-200 p-1', className)}>
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={clsx('h-10 flex-1 rounded-xl text-sm font-medium transition-all',
            value === o.value ? 'bg-white text-primary shadow-soft' : 'text-ink-muted')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function MonthPicker({ value, onChange, max }: { value: string; onChange: (p: string) => void; max?: string }) {
  const { lang, dir, t } = useLang();
  const canNext = !max || value < max;
  // In RTL "previous" visually sits on the right.
  const PrevIcon = dir === 'rtl' ? ChevronRight : ChevronLeft;
  const NextIcon = dir === 'rtl' ? ChevronLeft : ChevronRight;
  return (
    <div className="flex items-center justify-between rounded-2xl border border-line bg-white p-1.5 shadow-soft">
      <button onClick={() => onChange(shiftPeriod(value, -1))} className="grid h-11 w-11 place-items-center rounded-xl text-primary hover:bg-primary-50" aria-label={t('الشهر السابق', 'Previous month')}>
        <PrevIcon className="h-5 w-5" />
      </button>
      <span className="text-base font-semibold text-ink">{fmtPeriod(value, lang)}</span>
      <button onClick={() => canNext && onChange(shiftPeriod(value, 1))} disabled={!canNext}
        className="grid h-11 w-11 place-items-center rounded-xl text-primary hover:bg-primary-50 disabled:opacity-30" aria-label={t('الشهر التالي', 'Next month')}>
        <NextIcon className="h-5 w-5" />
      </button>
    </div>
  );
}

/** Coloured rounded icon tile. */
export function IconTile({ icon, tone = 'primary', className }: { icon: React.ReactNode; tone?: 'primary' | 'accent' | 'success' | 'danger' | 'info' | 'warning' | 'neutral'; className?: string }) {
  const map = {
    primary: 'bg-primary-50 text-primary', accent: 'bg-accent-50 text-accent-600', success: 'bg-success-50 text-success',
    danger: 'bg-danger-50 text-danger', info: 'bg-info-50 text-info', warning: 'bg-warning-50 text-warning', neutral: 'bg-sand text-ink-muted',
  }[tone];
  return <div className={clsx('grid h-11 w-11 shrink-0 place-items-center rounded-2xl', map, className)}>{icon}</div>;
}

/** Full-width primary submit button for sheets. */
export function SheetButton({ loading, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button {...rest} disabled={loading || rest.disabled}
      className={clsx('flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-white shadow-soft transition active:scale-[.99] disabled:opacity-50', rest.className)}>
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
      {children}
    </button>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="rounded-xl bg-danger-50 px-3 py-2.5 text-sm text-danger" role="alert">{message}</p>;
}
