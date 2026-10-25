'use client';
import { useEffect, useState } from 'react';
import { CalendarDays, Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { date as fmtDate } from '@/lib/format';
import { label, REQUEST_STATUS } from '@/lib/labels';
import { Badge, statusTone } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { NewLeaveSheet } from '@/components/ess/NewLeaveSheet';
import { IconTile, ListSkeleton, PageTitle, Ring, Section, Segmented, Skeleton } from '@/components/ess/primitives';
import { useConsumeParam } from '@/components/ess/hooks';
import type { LeaveRequest, MyLeaves } from '@/components/ess/types';

const RING_COLORS = ['#14D1C3', '#0E7490', '#0369A1', '#1B7F53', '#C2412D', '#5B6B80'];

export default function MyLeavesPage() {
  const { t, lang } = useLang();
  const toast = useToast();
  const { data, loading, error, reload } = useFetch(() => api.get<MyLeaves>('/me/leaves'), []);
  const [sheet, setSheet] = useState(false);
  const [filter, setFilter] = useState<'all' | 'PENDING' | 'decided'>('all');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const deepNew = useConsumeParam('new');
  useEffect(() => { if (deepNew) setSheet(true); }, [deepNew]);

  const list = (Array.isArray(data) ? data : data?.data ?? []) as LeaveRequest[];
  const balances = data && !Array.isArray(data) ? data.balances ?? [] : [];
  const filtered = list.filter((l) => filter === 'all' || (filter === 'PENDING' ? l.status === 'PENDING' : l.status !== 'PENDING'));

  const cancel = async (l: LeaveRequest) => {
    if (!window.confirm(t('هل تريد إلغاء طلب الإجازة؟', 'Cancel this leave request?'))) return;
    setCancelling(l.id);
    try { await api.post(`/me/leaves/${l.id}/cancel`); toast(t('تم إلغاء الطلب', 'Request cancelled')); void reload(); }
    catch (e) { toast(e instanceof ApiError ? e.display : String(e), 'error'); }
    finally { setCancelling(null); }
  };

  return (
    <div className="space-y-5">
      <PageTitle title={t('الإجازات', 'Leaves')} subtitle={t('أرصدتك وطلباتك', 'Your balances & requests')}
        action={<button onClick={() => setSheet(true)} className="flex h-11 items-center gap-1.5 rounded-2xl bg-primary px-4 text-sm font-semibold text-white shadow-soft active:scale-95"><Plus className="h-4 w-4" />{t('طلب إجازة', 'New leave')}</button>} />

      {error && !data ? <ErrorState message={error} onRetry={reload} /> : (
        <>
          {/* Balances */}
          <div className="ess-scroll-x -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
            {loading && !data ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-[132px] w-[150px] shrink-0 rounded-3xl" />)
              : balances.length === 0 ? <p className="text-sm text-ink-muted">{t('لا توجد أرصدة', 'No balances')}</p>
              : balances.map((b, i) => (
                <div key={b.leaveTypeId} className="flex w-[150px] shrink-0 snap-start flex-col items-center rounded-3xl border border-line bg-white p-4 text-center shadow-soft">
                  {b.entitlement != null && b.balance != null ? (
                    <Ring value={b.balance} max={b.entitlement} size={64} stroke={7} color={RING_COLORS[i % RING_COLORS.length]}>
                      <span className="num text-base font-bold text-ink">{Math.round(b.balance * 10) / 10}</span>
                    </Ring>
                  ) : (
                    <div className="grid h-16 w-16 place-items-center rounded-full bg-sand"><span className="num text-base font-bold text-ink">{b.taken}</span></div>
                  )}
                  <p className="mt-2 line-clamp-1 text-sm font-semibold text-ink">{lang === 'ar' ? b.nameAr : b.nameEn || b.nameAr}</p>
                  <p className="num text-[11px] text-ink-muted">
                    {b.entitlement != null ? t(`من ${b.entitlement} · مستخدم ${b.taken}`, `of ${b.entitlement} · used ${b.taken}`) : t(`مستخدم ${b.taken} يوم`, `used ${b.taken} d`)}
                  </p>
                </div>
              ))}
          </div>

          <Section title={t('طلباتي', 'My requests')}>
            <Segmented value={filter} onChange={setFilter} options={[
              { value: 'all', label: t('الكل', 'All') },
              { value: 'PENDING', label: t('قيد الاعتماد', 'Pending') },
              { value: 'decided', label: t('منتهية', 'Decided') },
            ]} />
            {loading && !data ? <ListSkeleton /> : filtered.length === 0 ? (
              <div className="rounded-3xl border border-line bg-white">
                <EmptyState title={t('لا توجد طلبات إجازة', 'No leave requests')} description={t('اطلب إجازتك القادمة بضغطة واحدة.', 'Request your next leave in one tap.')} />
              </div>
            ) : (
              <ul className="space-y-3">
                {filtered.map((l) => (
                  <li key={l.id} className="rounded-3xl border border-line bg-white p-4 shadow-soft">
                    <div className="flex items-start gap-3">
                      <IconTile icon={<CalendarDays className="h-5 w-5" />} tone={statusTone(l.status)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-ink">{l.leaveType ? (lang === 'ar' ? l.leaveType.nameAr : l.leaveType.nameEn || l.leaveType.nameAr) : t('إجازة', 'Leave')}</p>
                          <Badge tone={statusTone(l.status)}>{label(REQUEST_STATUS, l.status, lang)}</Badge>
                        </div>
                        <p className="num mt-1 text-sm text-ink-muted">{fmtDate(l.startDate, lang)} – {fmtDate(l.endDate, lang)} · <span className="font-semibold text-ink">{l.days}</span> {t('يوم', 'd')}</p>
                        {l.reason && <p className="mt-1 line-clamp-2 text-[13px] text-ink-soft">{l.reason}</p>}
                        {(l.approverName || l.comment) && l.status !== 'PENDING' && (
                          <p className="mt-2 rounded-xl bg-sand px-3 py-2 text-[12px] text-ink-muted">
                            {l.approverName && <span className="font-medium text-ink">{l.approverName}</span>}{l.comment ? `: ${l.comment}` : ''}
                          </p>
                        )}
                        {l.status === 'PENDING' && (
                          <button onClick={() => cancel(l)} disabled={cancelling === l.id}
                            className="mt-3 h-10 rounded-xl border border-danger/30 px-4 text-sm font-medium text-danger disabled:opacity-50">
                            {cancelling === l.id ? t('جارٍ الإلغاء…', 'Cancelling…') : t('إلغاء الطلب', 'Cancel request')}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      <NewLeaveSheet open={sheet} onClose={() => setSheet(false)} onCreated={reload} balances={balances} />
    </div>
  );
}
