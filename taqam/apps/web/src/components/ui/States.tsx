'use client';
import { Inbox, Loader2, AlertTriangle } from 'lucide-react';
import { useLang } from '@/lib/i18n';

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <Loader2 className={`animate-spin text-primary-500 ${className}`} />;
}
export function PageLoader() {
  return <div className="flex min-h-[40vh] items-center justify-center"><Spinner className="h-8 w-8" /></div>;
}
export function EmptyState({ title, description, action }: { title?: string; description?: string; action?: React.ReactNode }) {
  const { t } = useLang();
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <div className="rounded-2xl bg-sand p-3"><Inbox className="h-6 w-6 text-ink-soft" /></div>
      <p className="font-medium text-ink">{title ?? t('لا توجد بيانات', 'No data yet')}</p>
      {description && <p className="max-w-sm text-sm text-ink-muted">{description}</p>}
      {action}
    </div>
  );
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useLang();
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-danger/20 bg-danger-50 px-4 py-8 text-center">
      <AlertTriangle className="h-6 w-6 text-danger" />
      <p className="text-sm text-danger">{message}</p>
      {onRetry && <button onClick={onRetry} className="text-sm font-medium text-primary underline">{t('إعادة المحاولة', 'Retry')}</button>}
    </div>
  );
}
