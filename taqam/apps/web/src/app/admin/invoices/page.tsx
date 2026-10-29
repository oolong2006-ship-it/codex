'use client';
import { useEffect, useState } from 'react';
import { AlertTriangle, CircleDollarSign, Clock } from 'lucide-react';
import { Card, ErrorState, PageHeader, Pagination, Spinner, StatCard, Tabs } from '@/components/ui';
import { FilterBar, SearchInput } from '@/components/app/primitives';
import { InvoiceCards, InvoiceTable, PayInvoiceModal, VoidInvoiceModal } from '@/components/admin/BillingModals';
import { api, ApiError, type Paginated } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { money, num } from '@/lib/format';
import { INVOICE_STATUS, lbl, type Invoice, type InvoiceSummary } from '@/lib/adminTypes';

type Tab = 'ALL' | 'ISSUED' | 'OVERDUE' | 'PAID' | 'VOID';
const PAGE_SIZE = 20;

export default function InvoicesPage() {
  const { t, lang } = useLang();
  const [tab, setTab] = useState<Tab>('ALL');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<(Paginated<Invoice> & { summary: InvoiceSummary }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [voiding, setVoiding] = useState<Invoice | null>(null);

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('status') as Tab | null;
    if (s && ['ISSUED', 'OVERDUE', 'PAID', 'VOID'].includes(s)) setTab(s);
  }, []);
  useEffect(() => { const h = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(h); }, [search]);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    api.get<Paginated<Invoice> & { summary: InvoiceSummary }>('/admin/invoices', {
      status: tab === 'ALL' ? undefined : tab === 'OVERDUE' ? 'ISSUED' : tab, overdue: tab === 'OVERDUE' ? 'true' : undefined, search: q || undefined, page, pageSize: PAGE_SIZE,
    })
      .then((r) => { if (alive) setData(r); })
      .catch((e) => { if (alive) setError(e instanceof ApiError ? e.display : String(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tab, q, page, nonce]);

  const s = data?.summary;
  const refresh = () => setNonce((n) => n + 1);
  const tabs: { value: Tab; label: string }[] = [
    { value: 'ALL', label: t('الكل', 'All') },
    { value: 'ISSUED', label: lbl(INVOICE_STATUS, 'ISSUED', lang) },
    { value: 'OVERDUE', label: t('متأخرة', 'Overdue') },
    { value: 'PAID', label: lbl(INVOICE_STATUS, 'PAID', lang) },
    { value: 'VOID', label: lbl(INVOICE_STATUS, 'VOID', lang) },
  ];

  return (
    <div>
      <PageHeader title={t('الفواتير', 'Invoices')} subtitle={t('فواتير اشتراكات المنشآت والتحصيل', 'Subscription invoices and collections')} />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('مستحقة', 'Outstanding')} value={s ? money(s.outstanding.amount, { decimals: 0 }) : '—'} tone="primary" icon={<Clock className="h-5 w-5" />}
          hint={s ? t(`${num(s.outstanding.count)} فاتورة بانتظار السداد`, `${num(s.outstanding.count)} awaiting payment`) : undefined} />
        <StatCard label={t('متأخرة', 'Overdue')} value={<span className={s?.overdue.count ? 'text-danger' : undefined}>{s ? money(s.overdue.amount, { decimals: 0 }) : '—'}</span>} tone="danger" icon={<AlertTriangle className="h-5 w-5" />}
          hint={s ? t(`${num(s.overdue.count)} فاتورة تجاوزت تاريخ الاستحقاق`, `${num(s.overdue.count)} past due`) : undefined} />
        <StatCard label={t('محصّلة هذا الشهر', 'Collected this month')} value={s ? money(s.paidThisMonth.amount, { decimals: 0 }) : '—'} tone="success" icon={<CircleDollarSign className="h-5 w-5" />}
          hint={s ? t(`${num(s.paidThisMonth.count)} فاتورة مدفوعة`, `${num(s.paidThisMonth.count)} paid`) : undefined} />
      </div>
      <Card>
        <Tabs tabs={tabs} value={tab} onChange={(v) => { setTab(v); setPage(1); }} className="px-2 pt-1" />
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder={t('ابحث برقم الفاتورة أو اسم المنشأة…', 'Search number or company…')} className="sm:w-80" />
        </FilterBar>
        {error && !data ? <div className="p-4"><ErrorState message={error} onRetry={refresh} /></div>
          : !data ? <div className="flex justify-center py-16"><Spinner className="h-7 w-7" /></div>
          : (
            <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
              <div className="md:hidden"><InvoiceCards rows={data.data} showCompany onPay={setPaying} /></div>
              <div className="hidden md:block"><InvoiceTable rows={data.data} showCompany onPay={setPaying} onVoid={setVoiding} /></div>
              <Pagination page={data.page} pageSize={data.pageSize || PAGE_SIZE} total={data.total} onChange={setPage} />
            </div>
          )}
      </Card>
      <PayInvoiceModal invoice={paying} onClose={() => setPaying(null)} onDone={refresh} />
      <VoidInvoiceModal invoice={voiding} onClose={() => setVoiding(null)} onDone={refresh} />
    </div>
  );
}
