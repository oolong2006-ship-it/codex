'use client';
import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Pagination, Select, Table, Tabs, type Column } from '@/components/ui';
import { Async, Avatar, DecisionModal, FilterBar, KV, StatusBadge } from '@/components/app/primitives';
import { useAction } from '@/components/app/utils';
import { api, type Paginated } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { date, money } from '@/lib/format';
import { REQUEST_STATUS, REQUEST_TYPE, label } from '@/lib/labels';
import type { EmployeeRequest } from '@/lib/types';

type StatusTab = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
const PAGE_SIZE = 20;

const PAYLOAD_LABELS: Record<string, [string, string]> = {
  months: ['عدد الأشهر', 'Months'], date: ['التاريخ', 'Date'], checkIn: ['وقت الدخول', 'Check-in'], checkOut: ['وقت الخروج', 'Check-out'],
  addressedTo: ['موجه إلى', 'Addressed to'], destination: ['الوجهة', 'Destination'], travelDate: ['تاريخ السفر', 'Travel date'],
  returnDate: ['تاريخ العودة', 'Return date'], reason: ['السبب', 'Reason'], category: ['الفئة', 'Category'], language: ['اللغة', 'Language'],
};
function fmtPayload(k: string, v: unknown, lang: 'ar' | 'en'): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' });
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return date(v, lang);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export default function RequestsPage() {
  const { t, lang } = useLang();
  const [tab, setTab] = useState<StatusTab>('PENDING');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [view, setView] = useState<EmployeeRequest | null>(null);
  const [decision, setDecision] = useState<{ row: EmployeeRequest; mode: 'approve' | 'reject' } | null>(null);
  const { busy, run } = useAction();
  const { data, loading, error, reload } = useFetch(
    () => api.get<Paginated<EmployeeRequest>>('/requests', { status: tab === 'ALL' ? undefined : tab, type, page, pageSize: PAGE_SIZE }), [tab, type, page]);
  const pending = useFetch(() => api.get<Paginated<EmployeeRequest>>('/requests', { status: 'PENDING', pageSize: 1 }), []);
  useEffect(() => { setPage(1); }, [tab, type]);

  const decide = async (comment: string) => {
    if (!decision) return;
    const { row, mode } = decision;
    const ok = await run('decide', () => api.post(`/requests/${row.id}/${mode}`, { comment: comment || undefined }),
      mode === 'approve' ? t('تم اعتماد الطلب', 'Request approved') : t('تم رفض الطلب', 'Request rejected'));
    if (ok) { setDecision(null); setView(null); reload(); pending.reload(); }
  };

  const columns: Column<EmployeeRequest>[] = [
    { key: 'emp', header: t('الموظف', 'Employee'), render: (r) => (
      <div className="flex items-center gap-2.5"><Avatar name={r.employee?.name ?? '?'} size="sm" />
        <div><p className="font-medium text-ink">{r.employee?.name}</p><p className="text-xs text-ink-soft">{r.employee?.branchName ?? ''}</p></div></div>
    ) },
    { key: 'type', header: t('النوع', 'Type'), render: (r) => <Badge tone="primary">{label(REQUEST_TYPE, r.type, lang)}</Badge> },
    { key: 'title', header: t('العنوان', 'Title'), className: 'max-w-[240px] truncate', render: (r) => <span className="text-ink">{r.title}</span> },
    { key: 'amount', header: t('المبلغ', 'Amount'), render: (r) => r.amount ? <span className="num">{money(r.amount)}</span> : <span className="text-ink-soft">—</span> },
    { key: 'date', header: t('التاريخ', 'Date'), render: (r) => <span className="text-ink-muted">{date(r.createdAt, lang)}</span> },
    { key: 'status', header: t('الحالة', 'Status'), render: (r) => <StatusBadge map={REQUEST_STATUS} value={r.status} /> },
    { key: 'act', header: '', className: 'text-end', render: (r) => r.status === 'PENDING' ? (
      <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
        <Button size="sm" onClick={() => setDecision({ row: r, mode: 'approve' })}><Check className="h-4 w-4" /></Button>
        <Button size="sm" variant="secondary" className="!text-danger" onClick={() => setDecision({ row: r, mode: 'reject' })}><X className="h-4 w-4" /></Button>
      </div>
    ) : null },
  ];
  const tabs: { value: StatusTab; label: string; count?: number }[] = [
    { value: 'PENDING', label: t('قيد الاعتماد', 'Pending'), count: pending.data?.total },
    { value: 'APPROVED', label: t('معتمدة', 'Approved') },
    { value: 'REJECTED', label: t('مرفوضة', 'Rejected') },
    { value: 'ALL', label: t('الكل', 'All') },
  ];

  return (
    <>
      <PageHeader title={t('طلبات الموظفين', 'Employee requests')} subtitle={t('تعريف بالراتب، سلف، مصروفات، خروج وعودة، تصحيح حضور', 'Salary certificates, loans, expenses, exit/re-entry, corrections')} />
      <Card>
        <Tabs tabs={tabs} value={tab} onChange={setTab} className="px-2" />
        <FilterBar>
          <Select value={type} onChange={(e) => setType(e.target.value)} placeholder={t('كل الأنواع', 'All types')} className="sm:w-56"
            options={Object.entries(REQUEST_TYPE).map(([v, l]) => ({ value: v, label: lang === 'ar' ? l[0] : l[1] }))} />
        </FilterBar>
        <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
          <div className={loading ? 'opacity-60' : ''}>
            <Table columns={columns} rows={data?.data ?? []} rowKey={(r) => r.id} onRowClick={setView} empty={<EmptyState title={t('لا توجد طلبات', 'No requests')} />} />
            {data && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />}
          </div>
        </Async>
      </Card>

      <Modal open={!!view} onClose={() => setView(null)} title={view ? label(REQUEST_TYPE, view.type, lang) : ''}
        footer={view?.status === 'PENDING' ? <>
          <Button variant="secondary" className="!text-danger" onClick={() => setDecision({ row: view, mode: 'reject' })}><X className="h-4 w-4" />{t('رفض', 'Reject')}</Button>
          <Button onClick={() => setDecision({ row: view, mode: 'approve' })}><Check className="h-4 w-4" />{t('اعتماد', 'Approve')}</Button>
        </> : undefined}>
        {view && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Avatar name={view.employee?.name ?? '?'} />
              <div className="flex-1"><p className="font-semibold text-ink">{view.employee?.name}</p><p className="text-xs text-ink-soft">{view.employee?.branchName}</p></div>
              <StatusBadge map={REQUEST_STATUS} value={view.status} />
            </div>
            <div>
              <p className="font-medium text-ink">{view.title}</p>
              {view.details && <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">{view.details}</p>}
            </div>
            <KV items={[
              { label: t('تاريخ الطلب', 'Submitted'), value: date(view.createdAt, lang) },
              ...(view.amount ? [{ label: t('المبلغ', 'Amount'), value: <span className="num">{money(view.amount)}</span> }] : []),
              ...Object.entries(view.payload ?? {}).map(([k, v]) => ({ label: PAYLOAD_LABELS[k] ? PAYLOAD_LABELS[k][lang === 'ar' ? 0 : 1] : k, value: fmtPayload(k, v, lang) })),
              ...(view.approverName ? [{ label: t('القرار بواسطة', 'Decided by'), value: `${view.approverName} · ${date(view.decidedAt, lang)}` }] : []),
              ...(view.comment ? [{ label: t('التعليق', 'Comment'), value: view.comment }] : []),
            ]} />
            {view.status === 'PENDING' && view.type === 'LOAN' && <p className="rounded-xl bg-info-50 p-3 text-xs text-info">{t('اعتماد طلب السلفة سينشئ سلفة نشطة تُخصم أقساطها من الرواتب.', 'Approving creates an active loan deducted from payroll.')}</p>}
            {view.status === 'PENDING' && view.type === 'ATTENDANCE_CORRECTION' && <p className="rounded-xl bg-info-50 p-3 text-xs text-info">{t('اعتماد الطلب سيحدّث سجل الحضور لهذا اليوم.', 'Approving updates the attendance record for that day.')}</p>}
          </div>
        )}
      </Modal>
      <DecisionModal open={!!decision} mode={decision?.mode ?? 'approve'} onClose={() => setDecision(null)} onSubmit={decide} loading={busy === 'decide'}
        summary={decision && <><p className="font-medium">{decision.row.employee?.name}</p><p className="text-ink-muted">{label(REQUEST_TYPE, decision.row.type, lang)} — {decision.row.title}</p></>} />
    </>
  );
}
