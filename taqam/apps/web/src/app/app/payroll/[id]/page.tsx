'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowRight, BadgeCheck, Calculator, CheckCircle2, Download, FileCheck2, RefreshCw, Trash2, AlertTriangle, Banknote, Info } from 'lucide-react';
import { Button, Card, CardBody, EmptyState, Modal, PageHeader, Select, StatCard, Table, useToast, type Column } from '@/components/ui';
import { Async, ConfirmModal, FilterBar, SearchInput, StatusBadge, Stepper } from '@/components/app/primitives';
import { PayslipModal } from '@/components/app/PayslipModal';
import { useAction, errMsg } from '@/components/app/utils';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { date, money, num, period } from '@/lib/format';
import { PAYROLL_STATUS } from '@/lib/labels';
import type { Payslip, PayrollRunDetail } from '@/lib/types';

type Confirm = 'calculate' | 'approve' | 'mark-paid' | 'delete' | null;

export default function PayrollRunPage() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useLang();
  const router = useRouter();
  const toast = useToast();
  const { data: run, loading, error, reload } = useFetch(() => api.get<PayrollRunDetail>(`/payroll/runs/${id}`), [id]);
  const { busy, run: act } = useAction();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [slip, setSlip] = useState<Payslip | null>(null);
  const [q, setQ] = useState('');
  const [branch, setBranch] = useState('');
  const [wpsErrors, setWpsErrors] = useState<{ employeeNumber: string; messageAr: string }[] | null>(null);
  const [wpsBusy, setWpsBusy] = useState(false);

  const branches = useMemo(() => Array.from(new Set((run?.payslips ?? []).map((p) => p.employee.branchName).filter(Boolean))) as string[], [run]);
  const slips = useMemo(() => (run?.payslips ?? []).filter((p) =>
    (!branch || p.employee.branchName === branch) &&
    (!q || p.employee.name.toLowerCase().includes(q.toLowerCase()) || p.employee.employeeNumber.toLowerCase().includes(q.toLowerCase()))), [run, q, branch]);

  const doAction = async (a: Exclude<Confirm, null>) => {
    const msgs = { calculate: t('تم احتساب الرواتب', 'Payroll calculated'), approve: t('تم اعتماد المسير', 'Run approved'), 'mark-paid': t('تم تسجيل الدفع وإشعار الموظفين', 'Marked paid; employees notified'), delete: t('تم حذف المسير', 'Run deleted') };
    const ok = await act(a, () => (a === 'delete' ? api.del(`/payroll/runs/${id}`) : api.post(`/payroll/runs/${id}/${a}`)), msgs[a]);
    setConfirm(null);
    if (ok) { if (a === 'delete') router.push('/app/payroll'); else reload(); }
  };

  const wps = async () => {
    if (!run) return;
    setWpsBusy(true);
    try {
      try {
        const v = await api.get<{ errors?: { employeeNumber: string; messageAr: string }[] } | string>(`/payroll/runs/${id}/wps`, { validate: 1 });
        if (v && typeof v === 'object' && v.errors?.length) { setWpsErrors(v.errors); return; }
      } catch (e) {
        if (e instanceof ApiError && e.status === 400) {
          const errs = (e.body as { errors?: { employeeNumber: string; messageAr: string }[] })?.errors;
          if (errs?.length) { setWpsErrors(errs); return; }
        }
        throw e;
      }
      await api.download(`/payroll/runs/${id}/wps`, `WPS-${run.period}.csv`);
      toast(t('تم تنزيل ملف حماية الأجور', 'WPS file downloaded'));
    } catch (e) { toast(errMsg(e), 'error'); } finally { setWpsBusy(false); }
  };

  const columns: Column<Payslip>[] = [
    { key: 'emp', header: t('الموظف', 'Employee'), render: (p) => (
      <div><p className="font-medium text-ink">{p.employee.name}</p><p className="num text-xs text-ink-soft">{p.employee.employeeNumber} · {p.employee.branchName}</p></div>
    ) },
    { key: 'days', header: t('الأيام', 'Days'), render: (p) => <span className="num">{p.payableDays}</span> },
    { key: 'gross', header: t('الإجمالي', 'Gross'), render: (p) => <span className="num">{money(p.gross)}</span> },
    { key: 'gosi', header: t('التأمينات', 'GOSI'), render: (p) => <span className="num text-ink-muted">{money(p.gosiEmployee)}</span> },
    { key: 'ded', header: t('الاستقطاعات', 'Deductions'), render: (p) => <span className="num text-danger">{money(p.totalDeductions)}</span> },
    { key: 'net', header: t('الصافي', 'Net'), render: (p) => <span className="num font-semibold text-primary">{money(p.net)}</span> },
    { key: 'iban', header: 'IBAN', render: (p) => p.employee.iban ? <span className="num text-xs text-ink-soft" dir="ltr">…{p.employee.iban.slice(-6)}</span> : <span className="text-xs text-danger">{t('مفقود', 'Missing')}</span> },
    { key: 'notes', header: '', render: (p) => p.notes?.length ? <span title={p.notes.join("\n")}><Info className="h-4 w-4 text-info" /></span> : null },
  ];

  const steps = [
    { key: 'DRAFT', label: t('مسودة', 'Draft') }, { key: 'CALCULATED', label: t('محسوب', 'Calculated') },
    { key: 'APPROVED', label: t('معتمد', 'Approved') }, { key: 'PAID', label: t('مدفوع', 'Paid') },
  ];
  const confirmText: Record<Exclude<Confirm, null>, { title: string; msg: string; label: string; danger?: boolean }> = {
    calculate: { title: t('احتساب الرواتب', 'Calculate payroll'), msg: t('سيتم احتساب قسائم جميع الموظفين النشطين من الحضور والإجازات والتسويات والسلف. ستُستبدل أي حسابات سابقة.', 'Payslips for all active employees will be computed from attendance, leave, adjustments and loans. Previous calculations are replaced.'), label: t('احتساب', 'Calculate') },
    approve: { title: t('اعتماد المسير', 'Approve run'), msg: t('بعد الاعتماد لا يمكن تعديل المسير، وستُخصم أقساط السلف.', 'Once approved the run is locked and loan installments are deducted.'), label: t('اعتماد', 'Approve') },
    'mark-paid': { title: t('تسجيل الدفع', 'Mark as paid'), msg: t('تأكيد أن الرواتب حُوّلت للبنك. سيتم إشعار الموظفين بقسائمهم.', 'Confirm salaries were transferred. Employees will be notified.'), label: t('تأكيد الدفع', 'Mark paid') },
    delete: { title: t('حذف المسير', 'Delete run'), msg: t('سيتم حذف المسير وجميع القسائم المرتبطة به.', 'The run and all its payslips will be deleted.'), label: t('حذف', 'Delete'), danger: true },
  };

  return (
    <>
      <Link href="/app/payroll" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-primary"><ArrowRight className="h-4 w-4 ltr:rotate-180" />{t('مسيرات الرواتب', 'Payroll runs')}</Link>
      <Async loading={loading} error={error} onRetry={reload} hasData={!!run}>
        {run && (
          <>
            <PageHeader title={`${t('مسير رواتب', 'Payroll')} ${period(run.period, lang)}`}
              subtitle={run.approvedByName ? `${t('اعتمده', 'Approved by')} ${run.approvedByName} · ${date(run.approvedAt, lang)}` : `${t('أنشئ في', 'Created')} ${date(run.createdAt, lang)}`}
              actions={<>
                {(run.status === 'DRAFT' || run.status === 'CALCULATED') && <>
                  <Button variant="ghost" className="!text-danger" onClick={() => setConfirm('delete')}><Trash2 className="h-4 w-4" />{t('حذف', 'Delete')}</Button>
                  <Button variant={run.status === 'DRAFT' ? 'primary' : 'secondary'} onClick={() => setConfirm('calculate')} loading={busy === 'calculate'}>
                    {run.status === 'DRAFT' ? <Calculator className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}{run.status === 'DRAFT' ? t('احتساب', 'Calculate') : t('إعادة الاحتساب', 'Recalculate')}
                  </Button>
                </>}
                {run.status === 'CALCULATED' && <Button onClick={() => setConfirm('approve')} loading={busy === 'approve'}><BadgeCheck className="h-4 w-4" />{t('اعتماد', 'Approve')}</Button>}
                {(run.status === 'APPROVED' || run.status === 'PAID') && <Button variant="secondary" onClick={wps} loading={wpsBusy}><Download className="h-4 w-4" />{t('ملف حماية الأجور', 'WPS file')}</Button>}
                {run.status === 'APPROVED' && <Button variant="accent" onClick={() => setConfirm('mark-paid')} loading={busy === 'mark-paid'}><Banknote className="h-4 w-4" />{t('تسجيل الدفع', 'Mark paid')}</Button>}
              </>} />
            <Card className="mb-6"><CardBody className="overflow-x-auto"><div className="min-w-[420px]"><Stepper steps={steps} current={run.status} /></div></CardBody></Card>
            <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
              <StatCard label={t('الموظفون', 'Employees')} value={num(run.employeesCount)} />
              <StatCard label={t('إجمالي الرواتب', 'Total gross')} value={money(run.totalGross, { decimals: 0 })} tone="info" />
              <StatCard label={t('الاستقطاعات', 'Deductions')} value={money(run.totalDeductions, { decimals: 0 })} tone="danger" />
              <StatCard label={t('صافي الرواتب', 'Total net')} value={money(run.totalNet, { decimals: 0 })} tone="success" />
              <StatCard label={t('تكلفة المنشأة', 'Employer cost')} value={money(run.totalEmployerCost, { decimals: 0 })} hint={`${t('تأمينات المنشأة', 'Employer GOSI')} ${money(run.totalGosiEmployer, { decimals: 0 })}`} tone="accent" className="col-span-2 lg:col-span-1" />
            </div>
            {run.status === 'DRAFT' && !run.payslips.length ? (
              <Card><EmptyState title={t('المسير لم يُحتسب بعد', 'Run not calculated yet')} description={t('اضغط "احتساب" لإنشاء قسائم الرواتب', 'Press "Calculate" to generate payslips')}
                action={<Button size="sm" onClick={() => setConfirm('calculate')}><Calculator className="h-4 w-4" />{t('احتساب', 'Calculate')}</Button>} /></Card>
            ) : (
              <Card>
                <FilterBar>
                  <SearchInput value={q} onChange={setQ} placeholder={t('بحث بالاسم أو الرقم', 'Search name or number')} className="sm:w-64" />
                  {branches.length > 1 && <Select value={branch} onChange={(e) => setBranch(e.target.value)} options={branches.map((b) => ({ value: b, label: b }))} placeholder={t('كل الفروع', 'All branches')} className="sm:w-48" />}
                  <span className="text-sm text-ink-muted sm:ms-auto"><span className="num">{slips.length}</span> {t('قسيمة', 'payslips')} · <span className="num font-semibold text-primary">{money(slips.reduce((a, s) => a + s.net, 0))}</span></span>
                </FilterBar>
                <Table columns={columns} rows={slips} rowKey={(p) => p.id} onRowClick={setSlip} empty={<EmptyState />} />
              </Card>
            )}
          </>
        )}
      </Async>
      {confirm && (
        <ConfirmModal open onClose={() => setConfirm(null)} onConfirm={() => doAction(confirm)} loading={busy === confirm} danger={confirmText[confirm].danger}
          title={confirmText[confirm].title} message={confirmText[confirm].msg} confirmLabel={confirmText[confirm].label} />
      )}
      <PayslipModal payslip={slip} onClose={() => setSlip(null)} />
      <Modal open={!!wpsErrors} onClose={() => setWpsErrors(null)} title={t('أخطاء في ملف حماية الأجور', 'WPS validation errors')}
        footer={<Button variant="secondary" onClick={() => setWpsErrors(null)}>{t('إغلاق', 'Close')}</Button>}>
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-danger-50 p-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{t('يجب تصحيح البيانات التالية قبل تنزيل الملف (عادةً الآيبان أو رقم الهوية).', 'Fix the following before downloading (usually IBAN or ID).')}
        </div>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {wpsErrors?.map((e, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="num font-medium text-ink">{e.employeeNumber}</span><span className="text-ink-muted">{e.messageAr}</span>
            </li>
          ))}
        </ul>
      </Modal>
      {run?.status === 'PAID' && (
        <p className="mt-4 flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" />{t('تم دفع هذا المسير في', 'Paid on')} {date(run.paidAt, lang)} <FileCheck2 className="h-4 w-4" /></p>
      )}
    </>
  );
}
