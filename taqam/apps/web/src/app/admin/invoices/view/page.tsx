'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { Ban, Building2, CheckCircle2 } from 'lucide-react';
import { Button, PageLoader } from '@/components/ui';
import { InvoiceViewer } from '@/components/billing/InvoiceViewer';
import { PayInvoiceModal, VoidInvoiceModal } from '@/components/admin/BillingModals';
import { useLang } from '@/lib/i18n';
import type { Invoice, InvoiceDetail } from '@/lib/adminTypes';

function Actions({ inv, reload }: { inv: InvoiceDetail; reload: () => void }) {
  const { t } = useLang();
  const [modal, setModal] = useState<'pay' | 'void' | null>(null);
  const asInvoice = inv as Invoice;
  return (
    <>
      <Link href={`/admin/companies/${inv.companyId}?tab=invoices`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-medium text-primary hover:border-primary-500 hover:bg-primary-50">
        <Building2 className="h-4 w-4" />{t('المنشأة', 'Company')}
      </Link>
      {inv.status === 'ISSUED' && <>
        <Button variant="secondary" className="!text-danger hover:!border-danger hover:!bg-danger-50" onClick={() => setModal('void')}><Ban className="h-4 w-4" />{t('إلغاء', 'Void')}</Button>
        <Button variant="accent" onClick={() => setModal('pay')}><CheckCircle2 className="h-4 w-4" />{t('تسجيل الدفع', 'Record payment')}</Button>
      </>}
      <PayInvoiceModal invoice={modal === 'pay' ? asInvoice : null} onClose={() => setModal(null)} onDone={reload} />
      <VoidInvoiceModal invoice={modal === 'void' ? asInvoice : null} onClose={() => setModal(null)} onDone={reload} />
    </>
  );
}

export default function AdminInvoiceViewPage() {
  const { t } = useLang();
  return (
    <Suspense fallback={<PageLoader />}>
      <InvoiceViewer endpoint={(id) => `/admin/invoices/${encodeURIComponent(id)}`} backHref="/admin/invoices" backLabel={t('الفواتير', 'Invoices')}
        actions={(inv, reload) => <Actions inv={inv} reload={reload} />} />
    </Suspense>
  );
}
