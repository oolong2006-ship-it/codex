'use client';
import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Table, Textarea, StatCard, type Column, type Tone } from '@/components/ui';
import { Async, ConfirmModal, FilterBar, SearchInput } from '@/components/app/primitives';
import { SubNav, PAYROLL_NAV } from '@/components/app/SubNav';
import { useEmployeeOptions } from '@/components/app/hooks';
import { useAction } from '@/components/app/utils';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { currentPeriod, money, period } from '@/lib/format';
import type { Adjustment, AdjustmentType } from '@/lib/types';

const ADJ_TYPE: Record<AdjustmentType, [string, string, Tone, 1 | -1]> = {
  BONUS: ['مكافأة', 'Bonus', 'success', 1], COMMISSION: ['عمولة', 'Commission', 'success', 1], ALLOWANCE: ['بدل إضافي', 'Allowance', 'info', 1],
  DEDUCTION: ['خصم', 'Deduction', 'danger', -1], PENALTY: ['جزاء', 'Penalty', 'danger', -1],
};

export default function AdjustmentsPage() {
  const { t, lang } = useLang();
  const [p, setP] = useState(currentPeriod());
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [del, setDel] = useState<Adjustment | null>(null);
  const { busy, run } = useAction();
  const { data, loading, error, reload } = useFetch(() => api.get<Adjustment[] | { data: Adjustment[] }>('/payroll/adjustments', { period: p }), [p]);
  const all = useMemo(() => (Array.isArray(data) ? data : data?.data ?? []).filter((a) => !p || a.period === p), [data, p]);
  const rows = all.filter((a) => (!type || a.type === type) && (!q || (a.employee?.name ?? '').toLowerCase().includes(q.toLowerCase())));
  const additions = all.filter((a) => ADJ_TYPE[a.type]?.[3] === 1).reduce((s, a) => s + a.amount, 0);
  const deductions = all.filter((a) => ADJ_TYPE[a.type]?.[3] === -1).reduce((s, a) => s + a.amount, 0);

  const remove = async () => { if (del && await run('del', () => api.del(`/payroll/adjustments/${del.id}`), t('تم الحذف', 'Deleted'))) { setDel(null); reload(); } };
  const columns: Column<Adjustment>[] = [
    { key: 'emp', header: t('الموظف', 'Employee'), render: (a) => <span className="font-medium text-ink">{a.employee?.name ?? '—'}</span> },
    { key: 'type', header: t('النوع', 'Type'), render: (a) => <Badge tone={ADJ_TYPE[a.type]?.[2] ?? 'neutral'}>{ADJ_TYPE[a.type]?.[lang === 'ar' ? 0 : 1] ?? a.type}</Badge> },
    { key: 'period', header: t('الفترة', 'Period'), render: (a) => period(a.period, lang) },
    { key: 'amount', header: t('المبلغ', 'Amount'), render: (a) => <span className={`num font-semibold ${ADJ_TYPE[a.type]?.[3] === -1 ? 'text-danger' : 'text-success'}`}>{ADJ_TYPE[a.type]?.[3] === -1 ? '−' : '+'}{money(a.amount)}</span> },
    { key: 'note', header: t('ملاحظة', 'Note'), className: 'max-w-[260px] truncate', render: (a) => <span className="text-ink-muted">{a.note || '—'}</span> },
    { key: 'act', header: '', className: 'text-end', render: (a) => <button onClick={() => setDel(a)} className="rounded-lg p-1.5 text-ink-soft hover:bg-danger-50 hover:text-danger" aria-label="delete"><Trash2 className="h-4 w-4" /></button> },
  ];

  return (
    <>
      <PageHeader title={t('الإضافات والخصومات', 'Adjustments')} subtitle={t('مكافآت وعمولات وجزاءات تُطبق على مسير الشهر', 'Bonuses, commissions and penalties applied to the month’s run')}
        actions={<Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" />{t('إضافة تسوية', 'Add adjustment')}</Button>} />
      <SubNav items={PAYROLL_NAV} />
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('إجمالي الإضافات', 'Total additions')} value={money(additions)} tone="success" />
        <StatCard label={t('إجمالي الخصومات', 'Total deductions')} value={money(deductions)} tone="danger" />
        <StatCard label={t('عدد التسويات', 'Count')} value={all.length} />
      </div>
      <Card>
        <FilterBar>
          <Input type="month" value={p} onChange={(e) => setP(e.target.value)} className="sm:w-44" />
          <Select value={type} onChange={(e) => setType(e.target.value)} placeholder={t('كل الأنواع', 'All types')} className="sm:w-44"
            options={Object.entries(ADJ_TYPE).map(([v, l]) => ({ value: v, label: lang === 'ar' ? l[0] : l[1] }))} />
          <SearchInput value={q} onChange={setQ} placeholder={t('بحث بالموظف', 'Search employee')} className="sm:w-56" />
        </FilterBar>
        <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
          <Table columns={columns} rows={rows} rowKey={(a) => a.id} empty={<EmptyState title={t('لا توجد تسويات لهذه الفترة', 'No adjustments for this period')} />} />
        </Async>
      </Card>
      {adding && <AdjModal defaultPeriod={p} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
      <ConfirmModal open={!!del} onClose={() => setDel(null)} onConfirm={remove} danger loading={busy === 'del'} title={t('حذف التسوية', 'Delete adjustment')}
        message={t('حذف هذه التسوية؟ يجب إعادة احتساب المسير إن كان محسوباً.', 'Delete this adjustment? Recalculate the run if already calculated.')} confirmLabel={t('حذف', 'Delete')} />
    </>
  );
}

function AdjModal({ defaultPeriod, onClose, onSaved }: { defaultPeriod: string; onClose: () => void; onSaved: () => void }) {
  const { t, lang } = useLang();
  const { busy, run } = useAction();
  const { options } = useEmployeeOptions();
  const [f, setF] = useState({ employeeId: '', period: defaultPeriod, type: 'BONUS', amount: '', note: '' });
  const valid = f.employeeId && f.period && Number(f.amount) > 0;
  const save = async () => { if (valid && await run('save', () => api.post('/payroll/adjustments', { ...f, amount: Number(f.amount) }), t('تمت الإضافة', 'Added'))) onSaved(); };
  return (
    <Modal open onClose={onClose} title={t('تسوية جديدة', 'New adjustment')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button onClick={save} loading={busy === 'save'} disabled={!valid}>{t('حفظ', 'Save')}</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('الموظف', 'Employee')} required className="sm:col-span-2"><Select value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })} options={options} placeholder={t('اختر موظفاً', 'Select employee')} /></Field>
        <Field label={t('النوع', 'Type')} required><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} options={Object.entries(ADJ_TYPE).map(([v, l]) => ({ value: v, label: lang === 'ar' ? l[0] : l[1] }))} /></Field>
        <Field label={t('الفترة', 'Period')} required><Input type="month" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} /></Field>
        <Field label={t('المبلغ (ر.س)', 'Amount (SAR)')} required className="sm:col-span-2"><Input type="number" min={0} step="0.01" dir="ltr" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label={t('ملاحظة', 'Note')} className="sm:col-span-2"><Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
