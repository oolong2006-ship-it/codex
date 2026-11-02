'use client';
import { useState } from 'react';
import { Grid3x3, Lock } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Modal } from '@/components/ui';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { dateTime } from '@/lib/format';
import { normalizePin } from '@/lib/kiosk';
import { useAction } from './utils';

/** HR: the employee's «رمز الحضور السريع (PIN)» for the branch kiosk — status, lockout and setting a new one. */
export function KioskPinCard({ employeeId, employeeNumber }: { employeeId: string; employeeNumber: string }) {
  const { t } = useLang();
  const { data, reload } = useFetch(() => api.get<{ hasPin: boolean; lockedUntil: string | null }>(`/employees/${employeeId}/kiosk-pin`), [employeeId]);
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader title={t('رمز الحضور السريع (PIN)', 'Quick attendance PIN')}
        action={<Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Grid3x3 className="h-4 w-4" />{data?.hasPin ? t('تغيير', 'Change') : t('تعيين', 'Set')}</Button>} />
      <CardBody className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-ink-muted">{t('الحالة', 'Status')}</span>
          {data ? <Badge tone={data.hasPin ? 'success' : 'warning'}>{data.hasPin ? t('مُعيَّن', 'Set') : t('غير مُعيَّن', 'Not set')}</Badge> : <span>—</span>}
        </div>
        {data?.lockedUntil && (
          <p className="flex items-start gap-2 rounded-xl bg-warning-50 px-3 py-2 text-night">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            {t(`موقوف حتى ${dateTime(data.lockedUntil, 'ar')} بعد 5 محاولات خاطئة. تعيين رمز جديد يرفع الإيقاف.`, `Locked until ${dateTime(data.lockedUntil, 'en')} after 5 wrong tries. Setting a new PIN unlocks it.`)}
          </p>
        )}
        <p className="text-xs text-ink-soft">
          {t('يبصم الموظف على جهاز الفرع برقمه', 'The employee punches on the branch kiosk with number')} <span className="num" dir="ltr">{employeeNumber}</span> {t('وهذا الرمز. لا كاميرا ولا صور.', 'and this PIN. No camera, no photos.')}
        </p>
      </CardBody>
      {open && <SetPinModal employeeId={employeeId} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); void reload(); }} />}
    </Card>
  );
}

function SetPinModal({ employeeId, onClose, onSaved }: { employeeId: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useLang();
  const { busy, run } = useAction();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    const p = normalizePin(pin);
    if (!p) return setErr(t('الرمز يتكون من 4 إلى 6 أرقام', 'The PIN is 4 to 6 digits'));
    if (p !== normalizePin(confirm)) return setErr(t('تأكيد الرمز غير مطابق', 'PINs do not match'));
    setErr(null);
    if (await run('pin', () => api.post(`/employees/${employeeId}/kiosk-pin`, { pin: p }), t('تم حفظ الرمز وإشعار الموظف', 'PIN saved and the employee notified'))) onSaved();
  };
  return (
    <Modal open onClose={onClose} size="sm" title={t('تعيين رمز الحضور السريع', 'Set the attendance PIN')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button onClick={save} loading={busy === 'pin'}>{t('حفظ', 'Save')}</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">{t('سلّم الرمز للموظف شخصياً؛ يستطيع تغييره من «المزيد» في تطبيق الخدمة الذاتية.', 'Hand the PIN to the employee in person; they can change it under “More” in the self-service app.')}</p>
        <Field label={t('الرمز (4–6 أرقام)', 'PIN (4–6 digits)')} required>
          <Input type="password" inputMode="numeric" autoComplete="off" maxLength={6} dir="ltr" value={pin} onChange={(e) => setPin(e.target.value)} className="num text-center tracking-[0.4em]" />
        </Field>
        <Field label={t('تأكيد الرمز', 'Confirm PIN')} required error={err ?? undefined}>
          <Input type="password" inputMode="numeric" autoComplete="off" maxLength={6} dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="num text-center tracking-[0.4em]" />
        </Field>
      </div>
    </Modal>
  );
}
