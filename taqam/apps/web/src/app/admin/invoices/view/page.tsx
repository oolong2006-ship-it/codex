'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { Building2, CheckCircle2, FileMinus2 } from 'lucide-react';
import { Button, PageLoader } from '@/components/ui';
import { InvoiceViewer } from '@/components/billing/InvoiceViewer';
import { CreditNoteModal, PayInvoiceModal, canCredit, invoiceHref, isPayable } from '@/components/admin/BillingModals';
import { useRouter } from 'next/navigation';
import { useLang } from '@/lib/i18n';
import type { Invoice, InvoiceDetail } from '@/lib/adminTypes';

function Actions({ inv, reload }: { inv: InvoiceDetail; reload: () => void }) {
  const { t } = useLang();
  const router = useRouter();
  const [modal, setModal] = useState<'pay' | 'credit' | null>(null);
  const asInvoice = inv as Invoice;
  return (
    <>
      <Link href={`/admin/companies/${inv.companyId}?tab=invoices`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-medium text-primary hover:border-primary-500 hover:bg-primary-50">
        <Building2 className="h-4 w-4" />{t('المنشأة', 'Company')}
      </Link>
      {inv.documentType === 'CREDIT_NOTE' && inv.creditsInvoiceId && (
        <Link href={invoiceHref(inv.creditsInvoiceId)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-medium text-primary hover:border-primary-500 hover:bg-primary-50">
          {t('الفاتورة الأصلية', 'Original invoice')} <span className="num" dir="ltr">{inv.creditsNumber}</span>
        </Link>
      )}
      {canCredit(inv) && <Button variant="secondary" className="!text-danger hover:!border-danger hover:!bg-danger-50" onClick={() => setModal('credit')}><FileMinus2 className="h-4 w-4" />{t('إشعار دائن', 'Credit note')}</Button>}
      {isPayable(inv) && <Button variant="accent" onClick={() => setModal('pay')}><CheckCircle2 className="h-4 w-4" />{t('تسجيل الدفع', 'Record payment')}</Button>}
      <PayInvoiceModal invoice={modal === 'pay' ? asInvoice : null} onClose={() => setModal(null)} onDone={reload} />
      <CreditNoteModal invoice={modal === 'credit' ? asInvoice : null} onClose={() => setModal(null)} onDone={(cn) => router.push(invoiceHref(cn.id))} />
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
