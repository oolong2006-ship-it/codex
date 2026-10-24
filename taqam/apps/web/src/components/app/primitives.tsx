'use client';
import clsx from 'clsx';
import { Check, Search } from 'lucide-react';
import { useState } from 'react';
import { Badge, statusTone, Button, Modal, Textarea, Field, PageLoader, ErrorState, Card } from '@/components/ui';
import { useLang } from '@/lib/i18n';
import { label } from '@/lib/labels';
import { initials } from '@/lib/format';

type L = Record<string, [string, string]>;

export function StatusBadge({ map, value, className }: { map: L; value: string | null | undefined; className?: string }) {
  const { lang } = useLang();
  return <Badge tone={statusTone(value)} className={className}>{label(map, value, lang)}</Badge>;
}

const AVATAR_COLORS = ['#0C1F24', '#0B7A6B', '#E89A22', '#2F6F9F', '#1B7F53', '#C2412D', '#6B5B95', '#16313A'];
export function Avatar({ name, color, size = 'md', className }: { name: string; color?: string | null; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const c = color || AVATAR_COLORS[Math.abs([...(name || '?')].reduce((a, ch) => a + ch.charCodeAt(0), 0)) % AVATAR_COLORS.length];
  const s = { sm: 'h-7 w-7 text-[11px]', md: 'h-9 w-9 text-xs', lg: 'h-12 w-12 text-base', xl: 'h-16 w-16 text-xl' }[size];
  return (
    <span className={clsx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', s, className)} style={{ backgroundColor: c }}>
      {initials(name || '?')}
    </span>
  );
}

/** Shows a loader / error / children for a useFetch result. */
export function Async({ loading, error, onRetry, children, hasData }: { loading: boolean; error: string | null; onRetry?: () => void; children: React.ReactNode; hasData?: boolean }) {
  if (error && !hasData) return <ErrorState message={error} onRetry={onRetry} />;
  if (loading && !hasData) return <PageLoader />;
  return <>{children}</>;
}

export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx('flex flex-col gap-2 border-b border-line p-4 sm:flex-row sm:flex-wrap sm:items-center', className)}>{children}</div>;
}

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={clsx('relative', className)}>
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-line bg-white pe-3 ps-9 text-sm placeholder:text-ink-soft focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100" />
    </div>
  );
}

/** Key/value grid. */
export function KV({ items, cols = 2 }: { items: { label: string; value: React.ReactNode }[]; cols?: 2 | 3 }) {
  return (
    <dl className={clsx('grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2', cols === 3 && 'lg:grid-cols-3')}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs text-ink-soft">{i.label}</dt>
          <dd className="mt-0.5 break-words text-sm font-medium text-ink">{i.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel, danger, loading, children }:
  { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message?: React.ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean; children?: React.ReactNode }) {
  const { t } = useLang();
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel ?? t('تأكيد', 'Confirm')}</Button>
      </>}>
      {message && <div className="text-sm text-ink-muted">{message}</div>}
      {children}
    </Modal>
  );
}

/** Approve / reject with optional comment. */
export function DecisionModal({ open, mode, onClose, onSubmit, loading, summary }:
  { open: boolean; mode: 'approve' | 'reject'; onClose: () => void; onSubmit: (comment: string) => void; loading?: boolean; summary?: React.ReactNode }) {
  const { t } = useLang();
  const [comment, setComment] = useState('');
  const approve = mode === 'approve';
  return (
    <Modal open={open} onClose={() => { setComment(''); onClose(); }} title={approve ? t('اعتماد الطلب', 'Approve request') : t('رفض الطلب', 'Reject request')} size="sm"
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button>
        <Button variant={approve ? 'primary' : 'danger'} loading={loading} onClick={() => { onSubmit(comment); setComment(''); }}>
          {approve ? t('اعتماد', 'Approve') : t('رفض', 'Reject')}
        </Button>
      </>}>
      {summary && <div className="mb-4 rounded-xl bg-sand p-3 text-sm">{summary}</div>}
      <Field label={t('تعليق (اختياري)', 'Comment (optional)')}>
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('أضف ملاحظة للموظف…', 'Add a note for the employee…')} />
      </Field>
    </Modal>
  );
}

/** Horizontal status stepper. */
export function Stepper({ steps, current }: { steps: { key: string; label: string }[]; current: string }) {
  const idx = steps.findIndex((s) => s.key === current);
  return (
    <ol className="flex w-full items-center">
      {steps.map((s, i) => {
        const done = i < idx; const active = i === idx;
        return (
          <li key={s.key} className={clsx('flex items-center', i < steps.length - 1 && 'flex-1')}>
            <div className="flex flex-col items-center gap-1.5">
              <span className={clsx('flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold',
                done && 'border-primary bg-primary text-white', active && 'border-accent bg-accent text-night', !done && !active && 'border-line bg-white text-ink-soft')}>
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={clsx('whitespace-nowrap text-xs', active ? 'font-semibold text-primary' : 'text-ink-muted')}>{s.label}</span>
            </div>
            {i < steps.length - 1 && <span className={clsx('mx-2 mb-5 h-0.5 flex-1 rounded', i < idx ? 'bg-primary' : 'bg-line')} />}
          </li>
        );
      })}
    </ol>
  );
}

/** Semi-circle gauge (0..100). */
export function Gauge({ value, label: lbl, color = '#0B7A6B', size = 180 }: { value: number; label?: React.ReactNode; color?: string; size?: number }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const r = 70; const c = Math.PI * r;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size * 0.62 }}>
      <svg viewBox="0 0 180 110" className="h-full w-full">
        <path d="M20 95 A70 70 0 0 1 160 95" fill="none" stroke="#E8EEEB" strokeWidth="16" strokeLinecap="round" />
        <path d="M20 95 A70 70 0 0 1 160 95" fill="none" stroke={color} strokeWidth="16" strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`} style={{ transition: 'stroke-dasharray .6s ease' }} />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className="num text-3xl font-bold text-ink" dir="ltr">{v.toFixed(1)}%</div>
        {lbl && <div className="text-xs text-ink-muted">{lbl}</div>}
      </div>
    </div>
  );
}

export const BAND_COLOR: Record<string, string> = { PLATINUM: '#0C1F24', HIGH_GREEN: '#1B7F53', MID_GREEN: '#5BAE7E', LOW_GREEN: '#D99A1E', RED: '#C2412D' };

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 mt-2 flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-ink">{children}</h3>
      {action}
    </div>
  );
}

export function NoAccess() {
  const { t } = useLang();
  return (
    <Card className="mx-auto mt-10 max-w-md p-8 text-center">
      <p className="text-lg font-semibold text-ink">{t('لا تملك صلاحية الوصول', 'Access denied')}</p>
      <p className="mt-2 text-sm text-ink-muted">{t('هذه الصفحة غير متاحة لدورك الحالي.', 'This page is not available for your role.')}</p>
    </Card>
  );
}

/** Small toggle chip group. */
export function Chips<T extends string>({ options, value, onChange }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} type="button"
          className={clsx('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            value === o.value ? 'border-primary bg-primary text-white' : 'border-line bg-white text-ink-muted hover:border-primary-500')}>
          {o.label}
          {o.count !== undefined && <span className={clsx('num rounded-full px-1.5', value === o.value ? 'bg-white/20' : 'bg-sand-200')}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label: lbl }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={clsx('relative h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-primary-500' : 'bg-sand-300')}>
        <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'start-[22px]' : 'start-0.5')} />
      </button>
      {lbl}
    </label>
  );
}
