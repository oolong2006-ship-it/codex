'use client';
import Link from 'next/link';
import { CalendarPlus, ChevronLeft, ChevronRight, History, FileBadge, HandCoins, Hourglass, Megaphone, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { date as fmtDate, money, period as fmtPeriod } from '@/lib/format';
import { ErrorState } from '@/components/ui/States';
import { CheckInCard } from '@/components/ess/CheckInCard';
import { IconTile, Ring, Section, Skeleton } from '@/components/ess/primitives';
import type { MeHome } from '@/components/ess/types';

export default function MeHomePage() {
  const { t, lang, dir } = useLang();
  const { data, loading, error, reload } = useFetch(() => api.get<MeHome>('/me/home'), []);
  const Chevron = dir === 'rtl' ? ChevronLeft : ChevronRight;

  if (loading && !data) return <HomeSkeleton />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const lb = data.leaveBalance;
  const balance = typeof lb === 'number' ? lb : lb?.balance ?? 0;
  const entitlement = typeof lb === 'object' && lb ? (lb.entitlementPerYear ?? lb.accrued ?? 21) : Math.max(21, balance);
  const pending = Array.isArray(data.pendingRequests) ? data.pendingRequests.length : Number(data.pendingRequests ?? 0);

  const quick = [
    { href: '/me/leaves?new=1', icon: CalendarPlus, ar: 'طلب إجازة', en: 'Request leave', tone: 'primary' as const },
    { href: '/me/requests?new=SALARY_CERTIFICATE', icon: FileBadge, ar: 'تعريف بالراتب', en: 'Salary letter', tone: 'info' as const },
    { href: '/me/requests?new=LOAN', icon: HandCoins, ar: 'طلب سلفة', en: 'Request loan', tone: 'accent' as const },
    { href: '/me/requests?new=ATTENDANCE_CORRECTION', icon: History, ar: 'تصحيح حضور', en: 'Fix attendance', tone: 'success' as const },
  ];

  return (
    <div className="space-y-6">
      <CheckInCard home={data} onChanged={reload} />

      {/* Glance stats */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/me/leaves" className="col-span-2 flex items-center gap-4 rounded-3xl border border-line bg-white p-4 shadow-soft active:scale-[.99]">
          <Ring value={balance} max={entitlement} size={78}>
            <span className="leading-none">
              <span className="num block text-xl font-bold text-ink">{Math.round(balance * 10) / 10}</span>
              <span className="text-[10px] text-ink-muted">{t('يوم', 'days')}</span>
            </span>
          </Ring>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink-muted">{t('رصيد الإجازة السنوية', 'Annual leave balance')}</p>
            <p className="mt-0.5 text-base font-semibold text-ink">{t(`متاح ${Math.round(balance * 10) / 10} من ${entitlement} يوماً`, `${Math.round(balance * 10) / 10} of ${entitlement} days available`)}</p>
            <p className="mt-1 text-xs font-medium text-primary-500">{t('اطلب إجازة ←', 'Request leave →')}</p>
          </div>
        </Link>

        <Link href={data.lastPayslip ? `/me/payslips/${data.lastPayslip.id}` : '/me/payslips'} className="rounded-3xl border border-line bg-white p-4 shadow-soft active:scale-[.99]">
          <IconTile icon={<Wallet className="h-5 w-5" />} tone="accent" />
          <p className="mt-3 text-xs text-ink-muted">{data.lastPayslip ? `${t('صافي راتب', 'Net pay')} ${fmtPeriod(data.lastPayslip.period, lang)}` : t('آخر راتب', 'Last payslip')}</p>
          <p className="num mt-0.5 text-lg font-bold text-ink">{data.lastPayslip ? money(data.lastPayslip.net, { decimals: 0 }) : '—'}</p>
        </Link>

        <Link href="/me/requests" className="rounded-3xl border border-line bg-white p-4 shadow-soft active:scale-[.99]">
          <IconTile icon={<Hourglass className="h-5 w-5" />} tone="warning" />
          <p className="mt-3 text-xs text-ink-muted">{t('طلبات قيد الاعتماد', 'Pending requests')}</p>
          <p className="num mt-0.5 text-lg font-bold text-ink">{pending}</p>
        </Link>
      </div>

      {/* Quick actions */}
      <Section title={t('إجراءات سريعة', 'Quick actions')}>
        <div className="grid grid-cols-4 gap-2">
          {quick.map((q) => (
            <Link key={q.href} href={q.href} className="flex flex-col items-center gap-2 rounded-2xl py-2 text-center active:scale-95">
              <IconTile icon={<q.icon className="h-6 w-6" />} tone={q.tone} className="h-14 w-14 rounded-[20px] border border-line bg-white shadow-soft" />
              <span className="text-[12px] font-medium leading-tight text-ink">{t(q.ar, q.en)}</span>
            </Link>
          ))}
        </div>
      </Section>

      {/* Announcements */}
      <Section title={t('إعلانات المنشأة', 'Announcements')}>
        {data.announcements?.length ? (
          <ul className="space-y-3">
            {data.announcements.slice(0, 5).map((a) => (
              <li key={a.id} className="rounded-3xl border border-line bg-white p-4 shadow-soft">
                <div className="flex items-start gap-3">
                  <IconTile icon={<Megaphone className="h-5 w-5" />} tone="primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-ink">{a.title}</p>
                      <span className="num shrink-0 text-[11px] text-ink-soft">{fmtDate(a.createdAt, lang)}</span>
                    </div>
                    <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-ink-muted">{a.body}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-3xl border border-dashed border-line bg-white/60 p-6 text-center text-sm text-ink-muted">{t('لا توجد إعلانات حالياً', 'No announcements right now')}</div>
        )}
      </Section>

      <Link href="/me/requests" className="flex items-center justify-between rounded-3xl border border-line bg-white px-4 py-4 text-sm font-medium text-primary shadow-soft">
        {t('كل طلباتي', 'All my requests')}
        <Chevron className="h-5 w-5" />
      </Link>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-[28px] bg-primary p-5">
        <Skeleton className="h-9 w-40 bg-white/15" />
        <Skeleton className="h-4 w-32 bg-white/10" />
        <Skeleton className="h-11 w-full bg-white/10" />
        <div className="flex justify-center py-3"><Skeleton className="h-44 w-44 rounded-full bg-white/15" /></div>
        <Skeleton className="h-16 w-full bg-white/10" />
      </div>
      <Skeleton className="h-[110px] w-full rounded-3xl" />
      <div className="grid grid-cols-2 gap-3"><Skeleton className="h-32 rounded-3xl" /><Skeleton className="h-32 rounded-3xl" /></div>
      <div className="grid grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
    </div>
  );
}
