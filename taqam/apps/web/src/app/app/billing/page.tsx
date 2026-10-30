'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { CalendarClock, Eye, Mail, Phone, ReceiptText, ShieldCheck, Users } from 'lucide-react';
import { Card, CardHeader, EmptyState, PageHeader, Pagination, Table, type Column } from '@/components/ui';
import { Async } from '@/components/app/primitives';
import { CompanyStatusChip, DaysLeft, PlanBadge, SeatBar } from '@/components/admin/primitives';
import { InvoiceStatusChip, invoicePeriod } from '@/components/billing/InvoiceDocument';
import { CONTACT } from '@/components/marketing/data';
import { api, type Paginated } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { useFetch } from '@/lib/useFetch';
import { date, money, num } from '@/lib/format';
import { BILLING_CYCLE, lbl, type BillingSubscription, type Invoice } from '@/lib/adminTypes';

const viewHref = (id: string) => `/app/billing/view?id=${encodeURIComponent(id)}`;

type Due = { outstanding: { count: number; amount: number }; overdue: { count: number; amount: number } };
const sumDue = (rows: Invoice[]): Due => {
  const open = rows.filter((i) => i.status === 'ISSUED' && i.documentType !== 'CREDIT_NOTE');
  const agg = (xs: Invoice[]) => ({ count: xs.length, amount: Math.round(xs.reduce((a, i) => a + i.total, 0) * 100) / 100 });
  return { outstanding: agg(open), overdue: agg(open.filter((i) => i.overdue)) };
};

/**
 * Amount due for the whole account — never only the visible page. Uses `outstanding`/`overdue` from
 * /billing/subscription; an API that doesn't send them falls back to one unpaginated-in-practice request
 * (pageSize=100: a company has at most a few unpaid invoices, and 100 covers 8+ years of monthly history).
 */
function useDue(sub: BillingSubscription | null) {
  const [fallback, setFallback] = useState<Due | null>(null);
  const has = !!sub?.outstanding;
  useEffect(() => {
    if (!sub || has) return;
    let alive = true;
    api.get<Paginated<Invoice>>('/billing/invoices', { page: 1, pageSize: 100 }).then((r) => { if (alive) setFallback(sumDue(r.data)); }).catch(() => {});
    return () => { alive = false; };
  }, [sub, has]);
  if (sub?.outstanding) return { outstanding: sub.outstanding, overdue: sub.overdue ?? { count: 0, amount: 0 } };
  return fallback;
}

export default function BillingPage() {
  const { t } = useLang();
  const sub = useFetch(() => api.get<BillingSubscription>('/billing/subscription'), []);
  const [page, setPage] = useState(1);
  const inv = useFetch(() => api.get<Paginated<Invoice>>('/billing/invoices', { page, pageSize: 20 }), [page]);
  const due = useDue(sub.data);
  return (
    <div>
      <PageHeader title={t('الاشتراك والفواتير', 'Subscription & billing')} subtitle={t('باقة منشأتك في شؤون وفواتير الاشتراك', 'Your Shuoon plan and subscription invoices')} />
      <div className="space-y-6">
        <Async loading={sub.loading} error={sub.error} onRetry={sub.reload} hasData={!!sub.data}>
          {sub.data && <SubscriptionCard s={sub.data} due={due} />}
        </Async>
        <Card>
          <CardHeader title={t('الفواتير', 'Invoices')} subtitle={t('اضغط على الفاتورة لعرضها أو طباعتها', 'Open an invoice to view or print it')} />
          <Async loading={inv.loading} error={inv.error} onRetry={inv.reload} hasData={!!inv.data}>
            {inv.data && <>
              <InvoiceRows rows={inv.data.data} />
              <Pagination page={inv.data.page} pageSize={inv.data.pageSize || 20} total={inv.data.total} onChange={setPage} />
            </>}
          </Async>
        </Card>
      </div>
    </div>
  );
}

function SubscriptionCard({ s, due: d }: { s: BillingSubscription; due: Due | null }) {
  const { t, lang } = useLang();
  const end = s.status === 'TRIAL' ? s.trialEndsAt : s.subscriptionEndsAt;
  const due = d?.outstanding.amount ?? 0;
  const count = d?.outstanding.count ?? 0;
  const overdue = (d?.overdue.count ?? 0) > 0;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="relative overflow-hidden !border-night !bg-night p-6 text-white lg:col-span-2">
        <div className="taqam-pattern pointer-events-none absolute inset-0 opacity-25" aria-hidden />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-accent" />
            <p className="text-sm text-white/70">{t('باقتك الحالية', 'Your plan')}</p>
            <CompanyStatusChip status={s.status} className="ms-auto" />
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
            <span className="[&>span]:!border-white/20 [&>span]:!bg-white/10 [&>span]:!text-base [&>span]:!text-white"><PlanBadge plan={s.plan} /></span>
            <span className="text-sm text-white/70">{lbl(BILLING_CYCLE, s.billingCycle, lang)}</span>
          </div>
          <p className="num mt-4 text-3xl font-bold">
            {s.effectivePrice != null ? money(s.effectivePrice) : t('حسب الاتفاق', 'Negotiated')}
            {s.effectivePrice != null && <span className="ms-2 text-sm font-normal text-white/60">{t('للموظف / شهرياً', 'per employee / month')}</span>}
          </p>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Tile icon={<CalendarClock className="h-4 w-4" />} label={s.status === 'TRIAL' ? t('تنتهي التجربة', 'Trial ends') : t('ينتهي الاشتراك', 'Renews / ends')}
              value={end ? date(end, lang) : t('مفتوح', 'Open-ended')} />
            <Tile icon={<CalendarClock className="h-4 w-4" />} label={t('الأيام المتبقية', 'Days left')} value={<span className="[&>span]:!text-white"><DaysLeft days={s.daysLeft} /></span>} />
            <Tile icon={<Users className="h-4 w-4" />} label={t('الموظفون النشطون', 'Active employees')}
              value={<span className="num">{num(s.activeEmployees)}{s.maxEmployees ? <span className="text-white/60"> / {num(s.maxEmployees)}</span> : ''}</span>} />
          </div>
        </div>
      </Card>
      <div className="space-y-4">
        <Card className={clsx('p-5', overdue && 'border-danger/40')}>
          <p className="text-sm text-ink-muted">{t('المستحق عليك', 'Amount due')}</p>
          <p className={clsx('num mt-1 text-2xl font-bold', overdue ? 'text-danger' : 'text-ink')}>{d ? money(due) : '—'}</p>
          <p className="mt-1 text-xs text-ink-soft">
            {!d ? '\u00a0' : count
              ? t(`${count === 1 ? 'فاتورة واحدة غير مدفوعة' : count === 2 ? 'فاتورتان غير مدفوعتين' : `${count} فواتير غير مدفوعة`}${overdue ? ' — بعضها متأخر' : ''}`, `${count} unpaid${overdue ? ' — some overdue' : ''}`)
              : t('لا توجد فواتير مستحقة — شكراً لك', 'Nothing due — thank you')}
          </p>
        </Card>
        <Card className="p-5">
          <p className="mb-2 text-sm text-ink-muted">{t('المقاعد المستخدمة', 'Seats used')}</p>
          <SeatBar used={s.activeEmployees} max={s.maxEmployees} />
          <div className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm">
            <p className="text-xs text-ink-soft">{t('للترقية أو التجديد تواصل معنا', 'To upgrade or renew, contact us')}</p>
            <a href={`mailto:${CONTACT.email}`} className="flex items-center gap-2 text-primary-500 hover:underline" dir="ltr"><Mail className="h-4 w-4" />{CONTACT.email}</a>
            <a href={CONTACT.phoneHref} className="flex items-center gap-2 text-primary-500 hover:underline" dir="ltr"><Phone className="h-4 w-4" />{CONTACT.phone}</a>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/[.07] p-3 ring-1 ring-white/10">
      <p className="flex items-center gap-1.5 text-xs text-white/60">{icon}{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function OwnerTotal({ i, className }: { i: Invoice; className?: string }) {
  if (i.documentType === 'CREDIT_NOTE') return <span className={clsx('num whitespace-nowrap font-semibold text-info', className)}>− {money(i.total)}</span>;
  return <span className={clsx('num whitespace-nowrap font-semibold', i.status === 'CREDITED' && 'text-ink-soft line-through', className)}>{money(i.total)}</span>;
}

function InvoiceRows({ rows }: { rows: Invoice[] }) {
  const { t, lang } = useLang();
  const cols: Column<Invoice>[] = [
    { key: 'number', header: t('الرقم', 'Number'), render: (i) => (
      <div className="leading-tight">
        <Link href={viewHref(i.id)} className="num font-semibold text-primary-500 hover:underline" dir="ltr">{i.number}</Link>
        {i.documentType === 'CREDIT_NOTE' && i.creditsNumber && <p className="text-[11px] text-ink-soft">{t('إشعار دائن يخص', 'Credit note for')} <span className="num" dir="ltr">{i.creditsNumber}</span></p>}
      </div>
    ) },
    { key: 'period', header: t('الفترة', 'Period'), render: (i) => <span className="text-xs">{invoicePeriod(i, lang)}</span> },
    { key: 'issued', header: t('تاريخ الإصدار', 'Issued'), render: (i) => <span className="text-xs text-ink-muted">{date(i.issueDate, lang)}</span> },
    { key: 'due', header: t('الاستحقاق', 'Due'), render: (i) => i.documentType === 'CREDIT_NOTE' ? <span className="text-xs text-ink-soft">—</span> : <span className={clsx('text-xs', i.overdue ? 'font-semibold text-danger' : 'text-ink-muted')}>{date(i.dueDate, lang)}</span> },
    { key: 'total', header: t('الإجمالي', 'Total'), render: (i) => <OwnerTotal i={i} /> },
    { key: 'status', header: t('الحالة', 'Status'), render: (i) => <InvoiceStatusChip inv={i} /> },
    { key: 'act', header: '', className: 'text-end', render: (i) => (
      <Link href={viewHref(i.id)} className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium text-primary hover:bg-primary-50"><Eye className="h-4 w-4" />{t('عرض', 'View')}</Link>
    ) },
  ];
  const empty = <EmptyState title={t('لا توجد فواتير بعد', 'No invoices yet')} description={t('ستظهر فواتير اشتراكك هنا عند إصدارها', 'Your subscription invoices will appear here')} />;
  return (
    <>
      <ul className="divide-y divide-line md:hidden">
        {rows.map((i) => (
          <li key={i.id}>
            <Link href={viewHref(i.id)} className="flex items-center gap-3 px-4 py-3 active:bg-primary-50/50">
              <ReceiptText className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="num text-sm font-semibold text-ink" dir="ltr">{i.number}</p>
                <p className="truncate text-xs text-ink-soft">{invoicePeriod(i, lang)}</p>
              </div>
              <div className="flex flex-col items-end gap-1"><OwnerTotal i={i} className="text-sm font-bold" /><InvoiceStatusChip inv={i} /></div>
            </Link>
          </li>
        ))}
        {!rows.length && empty}
      </ul>
      <div className="hidden md:block"><Table columns={cols} rows={rows} rowKey={(i) => i.id} empty={empty} /></div>
    </>
  );
}
