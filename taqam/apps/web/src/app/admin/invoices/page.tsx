'use client';
import { useEffect, useState } from 'react';
import { AlertTriangle, CircleDollarSign, Clock } from 'lucide-react';
import { Card, ErrorState, PageHeader, Pagination, Spinner, StatCard, Tabs } from '@/components/ui';
import { FilterBar, SearchInput } from '@/components/app/primitives';
import { CreditNoteModal, InvoiceCards, InvoiceTable, PayInvoiceModal } from '@/components/admin/BillingModals';
import { api, ApiError, type Paginated } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { money, num } from '@/lib/format';
import { INVOICE_STATUS, lbl, type Invoice, type InvoiceSummary } from '@/lib/adminTypes';

type Tab = 'ALL' | 'ISSUED' | 'OVERDUE' | 'PAID' | 'CREDITED' | 'CREDIT_NOTE';
const TABS: Tab[] = ['ALL', 'ISSUED', 'OVERDUE', 'PAID', 'CREDITED', 'CREDIT_NOTE'];
const PAGE_SIZE = 20;

/** List query per tab (docs/ADMIN_PORTAL.md v2.1: type=INVOICE|CREDIT_NOTE, status=ISSUED|PAID|CREDITED, overdue=true|false). */
function tabQuery(tab: Tab): Record<string, string | undefined> {
  switch (tab) {
    case 'ISSUED': return { status: 'ISSUED', type: 'INVOICE' };
    case 'OVERDUE': return { status: 'ISSUED', type: 'INVOICE', overdue: 'true' };
    case 'PAID': return { status: 'PAID' };
    case 'CREDITED': return { status: 'CREDITED' };
    case 'CREDIT_NOTE': return { type: 'CREDIT_NOTE' };
    default: return {};
  }
}

export default function InvoicesPage() {
  const { t, lang } = useLang();
  // null until the URL (?status=) has been read, so the first request already uses the right tab (no double fetch).
  const [tab, setTab] = useState<Tab | null>(null);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<(Paginated<Invoice> & { summary: InvoiceSummary }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [crediting, setCrediting] = useState<Invoice | null>(null);

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('status') as Tab | null;
    setTab(s && TABS.includes(s) ? s : 'ALL');
  }, []);
  // Same-value state updates are no-ops, so the initial run does not trigger a second fetch.
  useEffect(() => { const h = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(h); }, [search]);
  useEffect(() => {
    if (!tab) return;
    let alive = true;
    setLoading(true); setError(null);
    api.get<Paginated<Invoice> & { summary: InvoiceSummary }>('/admin/invoices', { ...tabQuery(tab), search: q || undefined, page, pageSize: PAGE_SIZE })
      .then((r) => { if (alive) setData(r); })
      .catch((e) => { if (alive) setError(e instanceof ApiError ? e.display : String(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tab, q, page, nonce]);

  const changeTab = (v: Tab) => {
    setTab(v); setPage(1);
    try {
      const url = new URL(window.location.href);
      if (v === 'ALL') url.searchParams.delete('status'); else url.searchParams.set('status', v);
      window.history.replaceState(window.history.state, '', url.toString());
    } catch { /* ignore */ }
  };
  const s = data?.summary;
  const refresh = () => setNonce((n) => n + 1);
  const tabs: { value: Tab; label: string }[] = [
    { value: 'ALL', label: t('الكل', 'All') },
    { value: 'ISSUED', label: lbl(INVOICE_STATUS, 'ISSUED', lang) },
    { value: 'OVERDUE', label: t('متأخرة', 'Overdue') },
    { value: 'PAID', label: lbl(INVOICE_STATUS, 'PAID', lang) },
    { value: 'CREDITED', label: lbl(INVOICE_STATUS, 'CREDITED', lang) },
    { value: 'CREDIT_NOTE', label: t('الإشعارات الدائنة', 'Credit notes') },
  ];

  return (
    <div>
      <PageHeader title={t('الفواتير', 'Invoices')} subtitle={t('فواتير اشتراكات المنشآت والإشعارات الدائنة والتحصيل', 'Subscription invoices, credit notes and collections')} />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('مستحقة', 'Outstanding')} value={s ? money(s.outstanding.amount, { decimals: 0 }) : '—'} tone="primary" icon={<Clock className="h-5 w-5" />}
          hint={s ? t(`${num(s.outstanding.count)} فاتورة بانتظار السداد`, `${num(s.outstanding.count)} awaiting payment`) : undefined} />
        <StatCard label={t('متأخرة', 'Overdue')} value={<span className={s?.overdue.count ? 'text-danger' : undefined}>{s ? money(s.overdue.amount, { decimals: 0 }) : '—'}</span>} tone="danger" icon={<AlertTriangle className="h-5 w-5" />}
          hint={s ? t(`${num(s.overdue.count)} فاتورة تجاوزت تاريخ الاستحقاق`, `${num(s.overdue.count)} past due`) : undefined} />
        <StatCard label={t('محصّلة هذا الشهر', 'Collected this month')} value={s ? money(s.paidThisMonth.amount, { decimals: 0 }) : '—'} tone="success" icon={<CircleDollarSign className="h-5 w-5" />}
          hint={s ? t(`${num(s.paidThisMonth.count)} فاتورة مدفوعة`, `${num(s.paidThisMonth.count)} paid`) : undefined} />
      </div>
      <Card>
        <Tabs tabs={tabs} value={tab ?? 'ALL'} onChange={changeTab} className="px-2 pt-1" />
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder={t('ابحث برقم الفاتورة أو اسم المنشأة…', 'Search number or company…')} className="sm:w-80" />
        </FilterBar>
        {error && data && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b border-danger/20 bg-danger-50 px-4 py-2.5 text-sm text-danger">
            <span>{t('تعذر تحديث القائمة — البيانات المعروضة قد تكون قديمة.', 'Could not refresh the list — showing older data.')} {error}</span>
            <button type="button" onClick={refresh} className="font-medium text-primary underline">{t('إعادة المحاولة', 'Retry')}</button>
          </div>
        )}
        {error && !data ? <div className="p-4"><ErrorState message={error} onRetry={refresh} /></div>
          : !data ? <div className="flex justify-center py-16"><Spinner className="h-7 w-7" /></div>
          : (
            <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={loading}>
              <div className="md:hidden"><InvoiceCards rows={data.data} showCompany onPay={setPaying} onCredit={setCrediting} /></div>
              <div className="hidden md:block"><InvoiceTable rows={data.data} showCompany onPay={setPaying} onCredit={setCrediting} /></div>
              <Pagination page={data.page} pageSize={data.pageSize || PAGE_SIZE} total={data.total} onChange={setPage} />
            </div>
          )}
      </Card>
      <PayInvoiceModal invoice={paying} onClose={() => setPaying(null)} onDone={refresh} />
      <CreditNoteModal invoice={crediting} onClose={() => setCrediting(null)} onDone={refresh} />
    </div>
  );
}
