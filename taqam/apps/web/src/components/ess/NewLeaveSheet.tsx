'use client';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { todayISO } from '@/lib/format';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { FormError, Sheet, SheetButton, Skeleton } from './primitives';
import { asArray, type LeaveBalance, type LeaveType } from './types';
import { estimateLeaveDays } from './utils';

export function NewLeaveSheet({ open, onClose, onCreated, balances }:
  { open: boolean; onClose: () => void; onCreated: () => void; balances: LeaveBalance[] }) {
  const { t, lang } = useLang();
  const toast = useToast();
  const [types, setTypes] = useState<LeaveType[] | null>(null);
  const [typesError, setTypesError] = useState<string | null>(null);
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStart] = useState('');
  const [endDate, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (!startDate) { const d = todayISO(); setStart(d); setEnd(d); }
    if (types) return;
    api.get<unknown>('/leave-types')
      .then((r) => { const list = asArray<LeaveType>(r); setTypes(list); if (!leaveTypeId && list[0]) setLeaveTypeId((list.find((x) => x.code === 'ANNUAL') ?? list[0]).id); })
      .catch((e) => setTypesError(e instanceof ApiError ? e.display : String(e)));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const est = useMemo(() => estimateLeaveDays(startDate, endDate), [startDate, endDate]);
  const bal = balances.find((b) => b.leaveTypeId === leaveTypeId);
  const over = bal?.balance != null && est.working > bal.balance;

  const submit = async () => {
    setError(null);
    if (!leaveTypeId) return setError(t('اختر نوع الإجازة', 'Choose a leave type'));
    if (!startDate || !endDate) return setError(t('حدد تاريخ البداية والنهاية', 'Pick start and end dates'));
    if (endDate < startDate) return setError(t('تاريخ النهاية يجب أن يكون بعد البداية', 'End date must be after start'));
    setSaving(true);
    try {
      await api.post('/me/leaves', { leaveTypeId, startDate, endDate, reason: reason.trim() });
      toast(t('تم إرسال طلب الإجازة', 'Leave request submitted'));
      setReason('');
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.display : String(e));
    } finally { setSaving(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('طلب إجازة جديد', 'New leave request')}
      footer={<SheetButton onClick={submit} loading={saving}>{t('إرسال الطلب', 'Submit request')}</SheetButton>}>
      <div className="space-y-4">
        <div>
          <p className="field-label">{t('نوع الإجازة', 'Leave type')}</p>
          {typesError ? <FormError message={typesError} /> : !types ? (
            <div className="grid grid-cols-2 gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {types.map((lt) => {
                const b = balances.find((x) => x.leaveTypeId === lt.id);
                const active = lt.id === leaveTypeId;
                return (
                  <button key={lt.id} type="button" onClick={() => setLeaveTypeId(lt.id)}
                    className={clsx('min-h-[56px] rounded-2xl border px-3 py-2 text-start transition',
                      active ? 'border-primary bg-primary-50 ring-2 ring-primary-100' : 'border-line bg-white')}>
                    <span className={clsx('block text-sm font-semibold', active ? 'text-primary' : 'text-ink')}>{lang === 'ar' ? lt.nameAr : lt.nameEn || lt.nameAr}</span>
                    <span className="num block text-[11px] text-ink-muted">
                      {b?.balance != null ? t(`الرصيد ${b.balance} يوم`, `${b.balance} days left`) : lt.paid ? t('مدفوعة', 'Paid') : t('غير مدفوعة', 'Unpaid')}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('من', 'From')} required>
            <Input type="date" value={startDate} onChange={(e) => { setStart(e.target.value); if (!endDate || e.target.value > endDate) setEnd(e.target.value); }} className="h-12" />
          </Field>
          <Field label={t('إلى', 'To')} required>
            <Input type="date" value={endDate} min={startDate} onChange={(e) => setEnd(e.target.value)} className="h-12" />
          </Field>
        </div>

        <div className={clsx('flex items-center gap-3 rounded-2xl p-3', over ? 'bg-danger-50 text-danger' : 'bg-accent-50 text-ink')}>
          <CalendarRange className={clsx('h-6 w-6 shrink-0', over ? 'text-danger' : 'text-accent-600')} />
          <div className="text-sm">
            <p className="font-semibold"><span className="num text-lg">{est.working}</span> {t('يوم عمل تقريباً', 'working days (est.)')}
              <span className="num text-ink-muted"> · {est.calendar} {t('يوم تقويمي', 'calendar days')}</span></p>
            <p className="text-xs opacity-80">{over ? t('المدة أكبر من رصيدك المتاح', 'Exceeds your available balance') : t('تقدير لا يشمل العطل الرسمية، ويحتسب النظام العدد النهائي.', 'Estimate excludes public holidays; final count is computed by the system.')}</p>
          </div>
        </div>

        <Field label={t('السبب', 'Reason')}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('اختياري — اكتب سبب الإجازة', 'Optional')} />
        </Field>
        <FormError message={error} />
      </div>
    </Sheet>
  );
}
