'use client';
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { date as fmtDate, money } from '@/lib/format';
import { label, REQUEST_STATUS, REQUEST_TYPE } from '@/lib/labels';
import { Badge, statusTone } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { NewRequestSheet, REQUEST_TYPES, requestIcon } from '@/components/ess/NewRequestSheet';
import { IconTile, ListSkeleton, PageTitle, Segmented } from '@/components/ess/primitives';
import { useConsumeParam } from '@/components/ess/hooks';
import { asArray, type EmployeeRequest, type RequestType } from '@/components/ess/types';

export default function MyRequestsPage() {
  const { t, lang } = useLang();
  const { data, loading, error, reload } = useFetch(() => api.get<unknown>('/me/requests'), []);
  const [open, setOpen] = useState(false);
  const [initialType, setInitialType] = useState<RequestType | null>(null);
  const [filter, setFilter] = useState<'all' | 'PENDING' | 'decided'>('all');
  const deep = useConsumeParam('new');
  useEffect(() => {
    if (!deep) return;
    setInitialType(REQUEST_TYPES.some((r) => r.type === deep) ? (deep as RequestType) : null);
    setOpen(true);
  }, [deep]);

  const list = asArray<EmployeeRequest>(data).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const filtered = list.filter((r) => filter === 'all' || (filter === 'PENDING' ? r.status === 'PENDING' : r.status !== 'PENDING'));

  return (
    <div className="space-y-5">
      <PageTitle title={t('طلباتي', 'My requests')} subtitle={t('تعريف، سلفة، مصروفات، خطابات…', 'Letters, loans, expenses…')}
        action={<button onClick={() => { setInitialType(null); setOpen(true); }} className="flex h-11 items-center gap-1.5 rounded-2xl bg-primary px-4 text-sm font-semibold text-white shadow-soft active:scale-95"><Plus className="h-4 w-4" />{t('طلب جديد', 'New')}</button>} />

      <Segmented value={filter} onChange={setFilter} options={[
        { value: 'all', label: t('الكل', 'All') },
        { value: 'PENDING', label: t('قيد الاعتماد', 'Pending') },
        { value: 'decided', label: t('منتهية', 'Decided') },
      ]} />

      {error && !data ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <ListSkeleton /> : filtered.length === 0 ? (
        <div className="rounded-3xl border border-line bg-white">
          <EmptyState title={t('لا توجد طلبات', 'No requests')} description={t('قدّم طلبك وتابع حالته من هنا.', 'Submit a request and track it here.')} />
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => {
            const Icon = requestIcon(r.type);
            return (
              <li key={r.id} className="rounded-3xl border border-line bg-white p-4 shadow-soft">
                <div className="flex items-start gap-3">
                  <IconTile icon={<Icon className="h-5 w-5" />} tone={statusTone(r.status)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-ink">{label(REQUEST_TYPE, r.type, lang)}</p>
                      <Badge tone={statusTone(r.status)}>{label(REQUEST_STATUS, r.status, lang)}</Badge>
                    </div>
                    {r.details && <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{r.details}</p>}
                    <div className="num mt-1.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-soft">
                      <span>{fmtDate(r.createdAt, lang)}</span>
                      {r.amount != null && r.amount > 0 && <span className="font-semibold text-ink">{money(r.amount)}</span>}
                      {r.type === 'LOAN' && typeof r.payload?.months === 'number' && <span>{t(`${r.payload.months} أشهر`, `${r.payload.months} months`)}</span>}
                    </div>
                    {(r.approverName || r.comment) && r.status !== 'PENDING' && (
                      <p className="mt-2 rounded-xl bg-sand px-3 py-2 text-[12px] text-ink-muted">
                        {r.approverName && <span className="font-medium text-ink">{r.approverName}</span>}{r.comment ? `: ${r.comment}` : ''}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <NewRequestSheet open={open} onClose={() => setOpen(false)} onCreated={reload} initialType={initialType} />
    </div>
  );
}
