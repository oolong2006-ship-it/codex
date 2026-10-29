'use client';
import { Suspense } from 'react';
import { PageLoader } from '@/components/ui';
import { InvoiceViewer } from '@/components/billing/InvoiceViewer';
import { useLang } from '@/lib/i18n';

export default function OwnerInvoiceViewPage() {
  const { t } = useLang();
  return (
    <Suspense fallback={<PageLoader />}>
      <InvoiceViewer endpoint={(id) => `/billing/invoices/${encodeURIComponent(id)}`} backHref="/app/billing" backLabel={t('الاشتراك والفواتير', 'Subscription & billing')} />
    </Suspense>
  );
}
