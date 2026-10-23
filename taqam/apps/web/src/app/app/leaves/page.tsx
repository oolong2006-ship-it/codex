'use client';
import { useEffect, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Pagination, Select, Table, Tabs, Textarea, type Column } from '@/components/ui';
import { Async, Avatar, DecisionModal, FilterBar, StatusBadge } from '@/components/app/primitives';
import { useBranches, useEmployeeOptions, useLeaveTypes } from '@/components/app/hooks';
import { can, ADMIN, useAction } from '@/components/app/utils';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { date, num } from '@/lib/format';
import { REQUEST_STATUS } from '@/lib/labels';
import type { LeaveBalance, LeaveRequest } from '@/lib/types';

type StatusTab = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'ALL';
const PAGE_SIZE = 20;

export default function LeavesPage() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const [tab, setTab] = useState<StatusTab>('PENDING');
  const [branchId, setBranchId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [decision, setDecision] = useState<{ row: LeaveRequest; mode: 'approve' | 'reject' } | null>(null);
  const [creating, setCreating] = useState(false);
  const { options: branchOpts } = useBranches();
  const { busy, run } = useAction();
  const { data, loading, error, reload } = useFetch(
    () => api.get<Paginated<LeaveRequest>>('/leaves', { status: tab === 'ALL' ? undefined : tab, branchId, from, to, page, pageSize: PAGE_SIZE }),
    [tab, branchId, from, to, page],
  );
  const pending = useFetch(() => api.get<Paginated<LeaveRequest>>('/leaves', { status: 'PENDING', pageSize: 1 }), []);
  useEffect(() => { setPage(1); }, [tab, branchId, from, to]);

  const decide = async (comment: string) => {
    if (!decision) return;
    const { row, mode } = decision;
    const ok = await run('decide', () => api.post(`/leaves/${row.id}/${mode}`, { comment: comment || undefined }),
      mode === 'approve' ? t('تم اعتماد الإجازة', 'Leave approved') : t('تم رفض الإجازة', 'Leave rejected'));
    if (ok) { setDecision(null); reload(); pending.reload(); }
  };

  const columns: Column<LeaveRequest>[] = [
    { key: 'emp', header: t('الموظف', 'Employee'), render: (l) => (
      <div className="flex items-center gap-2.5"><Avatar name={l.employee?.name ?? '?'} size="sm" />
        <div><p className="font-medium text-ink">{l.employee?.name}</p><p className="text-xs text-ink-soft">{l.employee?.branchName ?? ''}</p></div></div>
    ) },
    { key: 'type', header: t('النوع', 'Type'), render: (l) => (lang === 'ar' ? l.leaveType?.nameAr : l.leaveType?.nameEn || l.leaveType?.nameAr) ?? '—' },
    { key: 'period', header: t('الفترة', 'Period'), render: (l) => <span className="text-ink-muted">{date(l.startDate, lang)} {t('←', '→')} {date(l.endDate, lang)}</span> },
    { key: 'days', header: t('الأيام', 'Days'), render: (l) => <span className="num font-semibold">{num(l.days)}</span> },
    { key: 'reason', header: t('السبب', 'Reason'), className: 'max-w-[220px] truncate', render: (l) => <span className="text-ink-muted" title={l.reason ?? ''}>{l.reason || '—'}</span> },
    { key: 'status', header: t('الحالة', 'Status'), render: (l) => (
      <div><StatusBadge map={REQUEST_STATUS} value={l.status} />{l.approverName && <p className="mt-0.5 text-[11px] text-ink-soft">{l.approverName}{l.comment ? ` — ${l.comment}` : ''}</p>}</div>
    ) },
    { key: 'act', header: '', className: 'text-end', render: (l) => l.status === 'PENDING' ? (
      <div className="flex justify-end gap-1.5">
        <Button size="sm" onClick={() => setDecision({ row: l, mode: 'approve' })}><Check className="h-4 w-4" />{t('اعتماد', 'Approve')}</Button>
        <Button size="sm" variant="secondary" className="!text-danger" onClick={() => setDecision({ row: l, mode: 'reject' })}><X className="h-4 w-4" />{t('رفض', 'Reject')}</Button>
      </div>
    ) : null },
  ];

  const tabs: { value: StatusTab; label: string; count?: number }[] = [
    { value: 'PENDING', label: t('قيد الاعتماد', 'Pending'), count: pending.data?.total },
    { value: 'APPROVED', label: t('معتمدة', 'Approved') },
    { value: 'REJECTED', label: t('مرفوضة', 'Rejected') },
    { value: 'CANCELLED', label: t('ملغاة', 'Cancelled') },
    { value: 'ALL', label: t('الكل', 'All') },
  ];

  return (
    <>
      <PageHeader title={t('الإجازات', 'Leaves')} subtitle={t('اعتماد طلبات الإجازة ومتابعة الأرصدة', 'Approve leave requests and track balances')}
        actions={can(user, ADMIN) && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />{t('إجازة نيابة عن موظف', 'Leave on behalf')}</Button>} />
      <Card>
        <Tabs tabs={tabs} value={tab} onChange={setTab} className="px-2" />
        <FilterBar>
          {user?.role !== 'BRANCH_MANAGER' && <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} options={branchOpts} placeholder={t('كل الفروع', 'All branches')} className="sm:w-48" />}
          <div className="flex items-center gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" aria-label="from" />
            <span className="text-ink-soft">—</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" aria-label="to" />
          </div>
          {(from || to || branchId) && <Button variant="ghost" size="sm" onClick={() => { setFrom(''); setTo(''); setBranchId(''); }}>{t('مسح', 'Clear')}</Button>}
        </FilterBar>
        <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
          <div className={loading ? 'opacity-60' : ''}>
            <Table columns={columns} rows={data?.data ?? []} rowKey={(l) => l.id}
              empty={<EmptyState title={tab === 'PENDING' ? t('لا توجد طلبات معلقة 🎉', 'Nothing pending 🎉') : t('لا توجد طلبات', 'No requests')} />} />
            {data && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />}
          </div>
        </Async>
      </Card>
      <DecisionModal open={!!decision} mode={decision?.mode ?? 'approve'} onClose={() => setDecision(null)} onSubmit={decide} loading={busy === 'decide'}
        summary={decision && <>
          <p className="font-medium">{decision.row.employee?.name}</p>
          <p className="text-ink-muted">{lang === 'ar' ? decision.row.leaveType?.nameAr : decision.row.leaveType?.nameEn} · {date(decision.row.startDate, lang)} {t('←', '→')} {date(decision.row.endDate, lang)} · <span className="num">{decision.row.days}</span> {t('يوم', 'days')}</p>
        </>} />
      {creating && <CreateLeaveModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); pending.reload(); }} />}
    </>
  );
}

function CreateLeaveModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t, lang } = useLang();
  const { busy, run } = useAction();
  const { options: empOpts } = useEmployeeOptions();
  const { options: typeOpts } = useLeaveTypes();
  const [f, setF] = useState({ employeeId: '', leaveTypeId: '', startDate: '', endDate: '', reason: '' });
  const balances = useFetch(() => (f.employeeId ? api.get<LeaveBalance[]>('/leaves/balances', { employeeId: f.employeeId }) : Promise.resolve(null)), [f.employeeId]);
  const bal = balances.data?.find((b) => b.leaveTypeId === f.leaveTypeId);
  const valid = f.employeeId && f.leaveTypeId && f.startDate && f.endDate && f.endDate >= f.startDate;
  const save = async () => {
    if (!valid) return;
    if (await run('save', () => api.post('/leaves', { ...f, reason: f.reason || undefined }), t('تم تسجيل الإجازة', 'Leave created'))) onSaved();
  };
  return (
    <Modal open onClose={onClose} title={t('تسجيل إجازة نيابة عن موظف', 'Create leave on behalf')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button onClick={save} loading={busy === 'save'} disabled={!valid}>{t('حفظ', 'Save')}</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('الموظف', 'Employee')} required className="sm:col-span-2"><Select value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })} options={empOpts} placeholder={t('اختر موظفاً', 'Select employee')} /></Field>
        <Field label={t('نوع الإجازة', 'Leave type')} required className="sm:col-span-2"><Select value={f.leaveTypeId} onChange={(e) => setF({ ...f, leaveTypeId: e.target.value })} options={typeOpts} placeholder={t('اختر النوع', 'Select type')} /></Field>
        {bal && (
          <div className="flex items-center justify-between rounded-xl bg-primary-50 px-4 py-2.5 text-sm sm:col-span-2">
            <span className="text-ink-muted">{t('الرصيد المتاح', 'Available balance')} — {lang === 'ar' ? bal.nameAr : bal.nameEn || bal.nameAr}</span>
            <span className="num font-bold text-primary">{bal.balance === null ? t('غير محدود', 'Unlimited') : `${num(bal.balance, 1)} ${t('يوم', 'days')}`}</span>
          </div>
        )}
        <Field label={t('من تاريخ', 'From')} required><Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value, endDate: f.endDate && f.endDate < e.target.value ? e.target.value : f.endDate })} /></Field>
        <Field label={t('إلى تاريخ', 'To')} required><Input type="date" value={f.endDate} min={f.startDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
        <Field label={t('السبب', 'Reason')} className="sm:col-span-2"><Textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      </div>
      <p className="mt-3 text-xs text-ink-soft">{t('تُحتسب الأيام تلقائياً باستثناء عطلة نهاية الأسبوع والعطل الرسمية.', 'Days are computed excluding weekends and public holidays.')}</p>
    </Modal>
  );
}
