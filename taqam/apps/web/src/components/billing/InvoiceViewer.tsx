'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Printer } from 'lucide-react';
import { Button, EmptyState, ErrorState, PageLoader } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import type { InvoiceDetail } from '@/lib/adminTypes';
import { InvoiceDocument } from './InvoiceDocument';

type State = { status: 'loading' } | { status: 'ok'; data: InvoiceDetail } | { status: 'missing' } | { status: 'error'; message: string };

/**
 * Toolbar + printable invoice for `?id=…` view pages (query param instead of a dynamic segment so the static demo
 * export works). Must render inside a <Suspense> boundary because it reads useSearchParams().
 * A 404 shows an empty state with a way back (retrying would not help); other errors offer a retry.
 */
export function InvoiceViewer({ endpoint, backHref, backLabel, actions }: {
  endpoint: (id: string) => string; backHref: string; backLabel: string;
  actions?: (inv: InvoiceDetail, reload: () => void) => React.ReactNode;
}) {
  const { t } = useLang();
  const id = useSearchParams().get('id') ?? '';
  const [state, setState] = useState<State>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setState((s) => (s.status === 'ok' && s.data.id === id ? s : { status: 'loading' }));
    api.get<InvoiceDetail>(endpoint(id))
      .then((data) => { if (alive) setState({ status: 'ok', data }); })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 404) setState({ status: 'missing' });
        else setState({ status: 'error', message: e instanceof ApiError ? e.display : String(e) });
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, nonce]);
  const data = state.status === 'ok' ? state.data : null;
  const back = (
    <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-primary">
      <ArrowRight className="h-4 w-4 ltr:rotate-180" />{backLabel}
    </Link>
  );
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        {back}
        {data && (
          <div className="flex flex-wrap items-center gap-2">
            {actions?.(data, reload)}
            <Button onClick={() => window.print()}><Printer className="h-4 w-4" />{t('طباعة / PDF', 'Print / PDF')}</Button>
          </div>
        )}
      </div>
      {!id ? <EmptyState title={t('لم تُحدد فاتورة', 'No invoice selected')} action={back} />
        : state.status === 'missing' ? (
          <EmptyState title={t('الفاتورة غير موجودة', 'Invoice not found')} description={t('ربما تغيّر الرابط أو لا تملك صلاحية عرض هذه الفاتورة.', 'The link may be wrong or you may not have access to this invoice.')}
            action={<Link href={backHref} className="mt-1 inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-medium text-white hover:bg-primary-600">{backLabel}</Link>} />
        )
        : state.status === 'error' ? <ErrorState message={state.message} onRetry={reload} />
        : data ? <InvoiceDocument inv={data} /> : <PageLoader />}
    </div>
  );
}
