'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowDownUp, CheckCircle2 } from 'lucide-react';
import { Button, Card, EmptyState, ErrorState, PageHeader, Select, Spinner, Tabs, type Column, Table, Pagination } from '@/components/ui';
import { FilterBar, SearchInput } from '@/components/app/primitives';
import { ActivateModal } from '@/components/admin/CompanyModals';
import { CompanyStatusChip, DaysLeft, PlanBadge, SeatBar, timeAgo } from '@/components/admin/primitives';
import { api, ApiError, type Paginated } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { money } from '@/lib/format';
import { BILLING_CYCLE, COMPANY_STATUS, COMPANY_STATUSES, PLAN, PLANS, companyName, lbl, type AdminCompany, type AdminOverview, type CompanyStatus } from '@/lib/adminTypes';

type StatusTab = 'ALL' | CompanyStatus;
type Sort = 'createdAt' | 'name' | 'employees' | 'lastActivityAt';
const PAGE_SIZE = 20;
const COUNT_KEY: Record<CompanyStatus, keyof AdminOverview['companies']> = { PENDING: 'pending', TRIAL: 'trial', ACTIVE: 'active', SUSPENDED: 'suspended', EXPIRED: 'expired' };

export default function CompaniesPage() {
  const { t, lang } = useLang();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<StatusTab>('ALL');
  const [plan, setPlan] = useState('');
  const [sort, setSort] = useState<Sort>('createdAt');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<AdminCompany> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<AdminOverview['companies'] | null>(null);
  const [activate, setActivate] = useState<AdminCompany | null>(null);
  const [nonce, setNonce] = useState(0);

  // Initial filters from the URL (?status=PENDING&plan=…&q=…)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get('status');
    if (s && (COMPANY_STATUSES as string[]).includes(s)) setStatus(s as CompanyStatus);
    const pl = p.get('plan'); if (pl && (PLANS as string[]).includes(pl)) setPlan(pl);
    const so = p.get('sort'); if (so && ['createdAt', 'name', 'employees', 'lastActivityAt'].includes(so)) setSort(so as Sort);
    const qq = p.get('q'); if (qq) { setSearch(qq); setQ(qq); }
    setReady(true);
  }, []);

  useEffect(() => { const h = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(h); }, [search]);

  useEffect(() => {
    if (!ready) return;
    const p = new URLSearchParams();
    if (status !== 'ALL') p.set('status', status);
    if (plan) p.set('plan', plan);
    if (sort !== 'createdAt') p.set('sort', sort);
    if (q) p.set('q', q);
    const s = p.toString();
    try { window.history.replaceState(window.history.state, '', `${window.location.pathname}${s ? `?${s}` : ''}`); } catch { /* ignore */ }
    let alive = true;
    setLoading(true); setError(null);
    api.get<Paginated<AdminCompany>>('/admin/companies', { status: status === 'ALL' ? undefined : status, plan: plan || undefined, search: q || undefined, sort, page, pageSize: PAGE_SIZE })
      .then((r) => { if (alive) setData(r); })
      .catch((e) => { if (alive) setError(e instanceof ApiError ? e.display : String(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [ready, status, plan, sort, q, page, nonce]);

  useEffect(() => {
    api.get<AdminOverview>('/admin/overview').then((r) => setCounts(r.companies)).catch(() => {});
  }, [nonce]);

  const tabs: { value: StatusTab; label: string; count?: number }[] = [
    { value: 'ALL', label: t('الكل', 'All'), count: counts?.total },
    ...COMPANY_STATUSES.map((s) => ({ value: s as StatusTab, label: lbl(COMPANY_STATUS, s, lang), count: counts?.[COUNT_KEY[s]] })),
  ];
  const go = (c: AdminCompany) => router.push(`/admin/companies/${c.id}`);

  const columns: Column<AdminCompany>[] = [
    { key: 'name', header: t('المنشأة', 'Company'), render: (c) => (
      <div className="min-w-[180px] max-w-[260px]">
        <p className="truncate font-medium text-ink">{companyName(c, lang)}</p>
        <p className="truncate text-xs text-ink-soft" dir="ltr">{c.ownerEmail || '—'}</p>
      </div>
    ) },
    { key: 'status', header: t('الحالة', 'Status'), render: (c) => <CompanyStatusChip status={c.status} /> },
    { key: 'plan', header: t('الباقة', 'Plan'), render: (c) => (
      <div className="flex flex-col items-start gap-0.5"><PlanBadge plan={c.plan} /><span className="text-[11px] text-ink-soft">{lbl(BILLING_CYCLE, c.billingCycle, lang)}</span></div>
    ) },
    { key: 'seats', header: t('الموظفون / الحد', 'Employees / seats'), render: (c) => <SeatBar used={c.activeEmployees} max={c.maxEmployees} className="w-28" /> },
    { key: 'mrr', header: t('الإيراد الشهري', 'MRR'), render: (c) => <span className="num">{c.mrr ? money(c.mrr, { decimals: 0 }) : <span className="text-ink-soft">—</span>}</span> },
    { key: 'days', header: t('المتبقي', 'Days left'), render: (c) => <DaysLeft days={c.daysLeft} /> },
    { key: 'activity', header: t('آخر نشاط', 'Last activity'), render: (c) => <span className="text-xs text-ink-muted">{timeAgo(c.lastActivityAt, lang)}</span> },
    { key: 'created', header: t('التسجيل', 'Signed up'), render: (c) => <span className="text-xs text-ink-muted">{timeAgo(c.createdAt, lang)}</span> },
    { key: 'act', header: '', render: (c) => c.status === 'PENDING'
      ? <Button size="sm" onClick={(e) => { e.stopPropagation(); setActivate(c); }}><CheckCircle2 className="h-4 w-4" />{t('تفعيل', 'Activate')}</Button>
      : null },
  ];

  const sortOpts = [
    { value: 'createdAt', label: t('الأحدث تسجيلاً', 'Newest') },
    { value: 'name', label: t('الاسم', 'Name') },
    { value: 'employees', label: t('عدد الموظفين', 'Employees') },
    { value: 'lastActivityAt', label: t('آخر نشاط', 'Last activity') },
  ];

  return (
    <div>
      <PageHeader title={t('المنشآت المشتركة', 'Companies')} subtitle={t('جميع المنشآت على المنصة وحالة اشتراكاتها', 'Every company on the platform and its subscription')} />
      <Card>
        <Tabs tabs={tabs} value={status} onChange={(v) => { setStatus(v); setPage(1); }} className="px-2 pt-1" />
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder={t('ابحث بالاسم أو البريد أو السجل التجاري…', 'Search name, email or CR…')} className="sm:w-80" />
          <Select value={plan} onChange={(e) => { setPlan(e.target.value); setPage(1); }} placeholder={t('كل الباقات', 'All plans')}
            options={PLANS.map((p) => ({ value: p, label: lbl(PLAN, p, lang) }))} className="sm:w-44" />
          <div className="flex items-center gap-2 sm:ms-auto">
            <ArrowDownUp className="h-4 w-4 shrink-0 text-ink-soft" />
            <Select value={sort} onChange={(e) => { setSort(e.target.value as Sort); setPage(1); }} options={sortOpts} className="sm:w-44" aria-label={t('ترتيب', 'Sort')} />
          </div>
        </FilterBar>
        {error && !data ? <div className="p-4"><ErrorState message={error} onRetry={() => setNonce((n) => n + 1)} /></div>
          : !data ? <div className="flex justify-center py-16"><Spinner className="h-7 w-7" /></div>
          : (
            <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
              {/* Mobile cards */}
              <ul className="divide-y divide-line md:hidden">
                {data.data.map((c) => (
                  <li key={c.id}>
                    <Link href={`/admin/companies/${c.id}`} className="block px-4 py-3 active:bg-primary-50/50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{companyName(c, lang)}</p>
                          <p className="truncate text-xs text-ink-soft">{c.ownerName} · {timeAgo(c.lastActivityAt, lang)}</p>
                        </div>
                        <CompanyStatusChip status={c.status} />
                      </div>
                      <div className="mt-2 flex items-end justify-between gap-3">
                        <SeatBar used={c.activeEmployees} max={c.maxEmployees} className="w-32" />
                        <div className="flex items-center gap-2"><PlanBadge plan={c.plan} /><DaysLeft days={c.daysLeft} /></div>
                      </div>
                      {c.status === 'PENDING' && (
                        <Button size="sm" className="mt-2 w-full" onClick={(e) => { e.preventDefault(); setActivate(c); }}><CheckCircle2 className="h-4 w-4" />{t('تفعيل', 'Activate')}</Button>
                      )}
                    </Link>
                  </li>
                ))}
                {!data.data.length && <EmptyState title={t('لا توجد منشآت مطابقة', 'No matching companies')} />}
              </ul>
              <div className="hidden md:block">
                <Table columns={columns} rows={data.data} rowKey={(c) => c.id} onRowClick={go}
                  empty={<EmptyState title={t('لا توجد منشآت مطابقة', 'No matching companies')} description={t('جرّب تغيير الفلاتر أو البحث', 'Try different filters or search')} />} />
              </div>
              <Pagination page={data.page} pageSize={data.pageSize || PAGE_SIZE} total={data.total} onChange={setPage} />
            </div>
          )}
      </Card>
      <ActivateModal company={activate} open={!!activate} onClose={() => setActivate(null)} onDone={() => setNonce((n) => n + 1)} />
    </div>
  );
}
