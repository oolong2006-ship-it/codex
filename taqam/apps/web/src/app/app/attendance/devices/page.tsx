'use client';
import { useState } from 'react';
import { Check, RotateCcw, ShieldCheck, Smartphone, X } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Table, type Column } from '@/components/ui';
import { Async, Avatar, ConfirmModal, SearchInput } from '@/components/app/primitives';
import { SubNav, ATTENDANCE_NAV } from '@/components/app/SubNav';
import { useAction } from '@/components/app/utils';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { date, time } from '@/lib/format';
import { DEVICE_STATUS, label } from '@/lib/labels';
import { describeDevice } from '@/lib/devices';
import type { EmployeeDeviceRow } from '@/lib/types';

type Confirm = { kind: 'approve' | 'reject'; row: EmployeeDeviceRow } | { kind: 'reset'; row: EmployeeDeviceRow } | null;

/** «الأجهزة بانتظار الاعتماد» — ESS device binding requests (spec §6). A device is a random browser id; no photos, ever. */
export default function DevicesPage() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const isBM = user?.role === 'BRANCH_MANAGER';
  const pending = useFetch(() => api.get<EmployeeDeviceRow[]>('/devices', { status: 'PENDING' }), []);
  const active = useFetch(() => api.get<EmployeeDeviceRow[]>('/devices', { status: 'ACTIVE' }), []);
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState<Confirm>(null);
  const { busy, run } = useAction();
  const reload = () => { pending.reload(); active.reload(); };

  const act = async () => {
    if (!confirm) return;
    const { kind, row } = confirm;
    const ok = kind === 'reset'
      ? await run('reset', () => api.del(`/employees/${row.employeeId}/devices`), t('تمت إعادة التعيين — أول بصمة قادمة تربط الجهاز', 'Reset — the next punch binds the device'))
      : await run(kind, () => api.post(`/devices/${row.id}/${kind}`), kind === 'approve' ? t('تم اعتماد الجهاز الجديد', 'New device approved') : t('تم رفض الجهاز', 'Device rejected'));
    if (ok) { setConfirm(null); reload(); }
  };

  const device = (r: EmployeeDeviceRow) => (
    <div className="flex items-center gap-2 text-ink-muted">
      <Smartphone className="h-4 w-4 shrink-0 text-ink-soft" />
      <span>{describeDevice(r.userAgent) || t('جهاز', 'Device')}</span>
      <span className="num text-xs text-ink-soft" dir="ltr">…{r.deviceIdSuffix}</span>
    </div>
  );
  const employee = (r: EmployeeDeviceRow) => (
    <div className="flex items-center gap-2.5">
      <Avatar name={r.employeeName} size="sm" />
      <div>
        <p className="font-medium text-ink">{r.employeeName} <span className="num text-xs text-ink-soft">#{r.employeeNumber}</span></p>
        {!isBM && <p className="text-xs text-ink-soft">{r.branchName ?? ''}</p>}
      </div>
    </div>
  );

  const pendingCols: Column<EmployeeDeviceRow>[] = [
    { key: 'emp', header: t('الموظف', 'Employee'), render: employee },
    { key: 'dev', header: t('الجهاز الجديد', 'New device'), render: device },
    { key: 'at', header: t('أول محاولة', 'Requested'), render: (r) => <span className="num text-ink-muted">{date(r.createdAt, lang)} · {time(r.createdAt)}</span> },
    { key: 'act', header: '', className: 'text-end', render: (r) => (
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={() => setConfirm({ kind: 'reject', row: r })}><X className="h-4 w-4" />{t('رفض', 'Reject')}</Button>
        <Button size="sm" onClick={() => setConfirm({ kind: 'approve', row: r })}><Check className="h-4 w-4" />{t('اعتماد', 'Approve')}</Button>
      </div>
    ) },
  ];

  const activeRows = (active.data ?? []).filter((r) => !q || r.employeeName.includes(q) || r.employeeNumber.includes(q));
  const activeCols: Column<EmployeeDeviceRow>[] = [
    { key: 'emp', header: t('الموظف', 'Employee'), render: employee },
    { key: 'dev', header: t('الجهاز المعتمد', 'Bound device'), render: device },
    { key: 'status', header: t('الحالة', 'Status'), render: (r) => <Badge tone="success">{label(DEVICE_STATUS, r.status, lang)}{r.approvedById ? ` · ${t('اعتمدته الموارد البشرية', 'HR approved')}` : ''}</Badge> },
    { key: 'used', header: t('آخر بصمة', 'Last punch'), render: (r) => <span className="num text-ink-muted">{r.lastUsedAt ? `${date(r.lastUsedAt, lang)} · ${time(r.lastUsedAt)}` : '—'}</span> },
    { key: 'act', header: '', className: 'text-end', render: (r) => (
      <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'reset', row: r })}><RotateCcw className="h-4 w-4" />{t('إعادة تعيين', 'Reset')}</Button>
    ) },
  ];

  const pendingRows = pending.data ?? [];
  const confirmText = confirm && ({
    approve: { title: t('اعتماد الجهاز الجديد', 'Approve new device'), msg: t(`سيصبح هذا الجهاز الوحيد المسموح لـ ${confirm.row.employeeName} بالبصمة منه، ويُلغى الجهاز السابق.`, `This becomes the only device ${confirm.row.employeeName} can punch from; the old one is revoked.`) },
    reject: { title: t('رفض الجهاز', 'Reject device'), msg: t('سيبقى الجهاز الحالي هو المعتمد، ولن يستطيع الموظف البصمة من الجهاز الجديد.', 'The current device stays bound; the new one cannot punch.') },
    reset: { title: t('إعادة تعيين أجهزة الموظف', 'Reset employee devices'), msg: t(`تُحذف أجهزة ${confirm.row.employeeName} المسجلة، وأول بصمة قادمة تربط الجهاز الذي يستخدمه (مثلاً عند فقدان الجوال).`, `All devices of ${confirm.row.employeeName} are cleared; the next punch binds the device used (e.g. a lost phone).`) },
  })[confirm.kind];

  return (
    <>
      <PageHeader title={t('الأجهزة بانتظار الاعتماد', 'Devices awaiting approval')}
        subtitle={t('أول بصمة تسجّل متصفح الموظف على جواله، والبصمة من متصفح آخر تحتاج اعتمادك — بلا صور ولا كاميرا', 'The first punch registers the employee’s phone browser; punching from another browser needs your approval — no photos, no camera')} />
      <SubNav items={ATTENDANCE_NAV} />
      <div className="mb-5 rounded-2xl border border-line bg-sand p-4 text-sm text-ink-muted">
        <p>{t('تغيير المتصفح أو مسح بيانات الموقع يُعدّ جهازاً جديداً.', 'Switching browser or clearing site data counts as a new device.')}</p>
        <p className="mt-1">{t('لمستخدمي iPhone: أضف التطبيق إلى الشاشة الرئيسية (مشاركة ← إضافة إلى الشاشة الرئيسية) حتى لا يُمسح تسجيل الجهاز.', 'iPhone users: add the app to the home screen (Share → Add to Home Screen) so the device registration is not cleared.')}</p>
      </div>
      <div className="space-y-6">
        <Card>
          <CardHeader title={<span className="flex items-center gap-2">{t('طلبات الأجهزة الجديدة', 'New device requests')}{pendingRows.length > 0 && <Badge tone="warning">{pendingRows.length}</Badge>}</span>}
            subtitle={t('تظهر عندما يحاول الموظف البصمة من جهاز غير جهازه المسجل', 'Shown when an employee tries to punch from a device other than the registered one')} />
          <Async loading={pending.loading} error={pending.error} onRetry={pending.reload} hasData={!!pending.data}>
            <Table columns={pendingCols} rows={pendingRows} rowKey={(r) => r.id}
              empty={<EmptyState title={t('لا توجد أجهزة بانتظار الاعتماد', 'No devices awaiting approval')} description={t('أول بصمة لكل موظف تربط جهازه تلقائياً.', 'Each employee’s first punch binds their device automatically.')} />} />
          </Async>
        </Card>
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-success" />{t('الأجهزة المعتمدة', 'Bound devices')}</span>}
            action={<SearchInput value={q} onChange={setQ} placeholder={t('بحث بالاسم أو الرقم', 'Search name or number')} className="sm:w-56" />} />
          <Async loading={active.loading} error={active.error} onRetry={active.reload} hasData={!!active.data}>
            <Table columns={activeCols} rows={activeRows} rowKey={(r) => r.id} />
          </Async>
        </Card>
      </div>
      <ConfirmModal open={!!confirm} onClose={() => setConfirm(null)} onConfirm={act} loading={!!busy}
        title={confirmText?.title ?? ''} message={confirmText?.msg} danger={confirm?.kind !== 'approve'}
        confirmLabel={confirm?.kind === 'approve' ? t('اعتماد', 'Approve') : confirm?.kind === 'reject' ? t('رفض', 'Reject') : t('إعادة تعيين', 'Reset')} />
    </>
  );
}
