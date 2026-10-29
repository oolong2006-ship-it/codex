'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Printer } from 'lucide-react';
import { Button, EmptyState } from '@/components/ui';
import { Async } from '@/components/app/primitives';
import { api } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { useFetch } from '@/lib/useFetch';
import type { InvoiceDetail } from '@/lib/adminTypes';
import { InvoiceDocument } from './InvoiceDocument';

/**
 * Toolbar + printable invoice for `?id=…` view pages (query param instead of a dynamic segment so the static demo
 * export works). Must render inside a <Suspense> boundary because it reads useSearchParams().
 */
export function InvoiceViewer({ endpoint, backHref, backLabel, actions }: {
  endpoint: (id: string) => string; backHref: string; backLabel: string;
  actions?: (inv: InvoiceDetail, reload: () => void) => React.ReactNode;
}) {
  const { t } = useLang();
  const id = useSearchParams().get('id') ?? '';
  const { data, loading, error, reload } = useFetch(() => (id ? api.get<InvoiceDetail>(endpoint(id)) : Promise.resolve(null)), [id]);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-primary">
          <ArrowRight className="h-4 w-4 ltr:rotate-180" />{backLabel}
        </Link>
        {data && (
          <div className="flex flex-wrap items-center gap-2">
            {actions?.(data, () => void reload())}
            <Button onClick={() => window.print()}><Printer className="h-4 w-4" />{t('طباعة / PDF', 'Print / PDF')}</Button>
          </div>
        )}
      </div>
      {!id ? <EmptyState title={t('لم تُحدد فاتورة', 'No invoice selected')} />
        : (
          <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
            {data && <InvoiceDocument inv={data} />}
          </Async>
        )}
    </div>
  );
}
