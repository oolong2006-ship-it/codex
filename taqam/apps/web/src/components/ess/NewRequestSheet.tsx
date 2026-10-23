'use client';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { CalendarClock, FileBadge, FileText, HandCoins, History, MoreHorizontal, Plane, Receipt } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { money, todayISO } from '@/lib/format';
import { label, REQUEST_TYPE } from '@/lib/labels';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { FormError, Sheet, SheetButton } from './primitives';
import type { RequestType } from './types';
import { riyadhISO } from './utils';

export const REQUEST_TYPES: { type: RequestType; icon: typeof FileText }[] = [
  { type: 'SALARY_CERTIFICATE', icon: FileBadge },
  { type: 'EXPENSE_CLAIM', icon: Receipt },
  { type: 'LOAN', icon: HandCoins },
  { type: 'EXIT_REENTRY', icon: Plane },
  { type: 'ATTENDANCE_CORRECTION', icon: History },
  { type: 'LETTER', icon: FileText },
  { type: 'OTHER', icon: MoreHorizontal },
];
export const requestIcon = (type: string) => REQUEST_TYPES.find((r) => r.type === type)?.icon ?? CalendarClock;

const EMPTY = { addressedTo: '', amount: '', months: '6', description: '', departDate: '', returnDate: '', date: '', checkIn: '', checkOut: '', text: '' };

export function NewRequestSheet({ open, onClose, onCreated, initialType }:
  { open: boolean; onClose: () => void; onCreated: () => void; initialType?: RequestType | null }) {
  const { t, lang } = useLang();
  const toast = useToast();
  const [type, setType] = useState<RequestType | null>(null);
  const [f, setF] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => {
    if (open) { setType(initialType ?? null); setF({ ...EMPTY, date: todayISO() }); setError(null); }
  }, [open, initialType]);

  const typeLabel = (x: string) => label(REQUEST_TYPE, x, lang);
  const amountNum = Number(f.amount);
  const monthsNum = Number(f.months);

  const build = (): { body: Record<string, unknown> } | { error: string } => {
    if (!type) return { error: t('اختر نوع الطلب', 'Choose a request type') };
    const titleAr = label(REQUEST_TYPE, type, 'ar');
    switch (type) {
      case 'SALARY_CERTIFICATE':
        if (!f.addressedTo.trim()) return { error: t('اكتب الجهة الموجّه إليها التعريف', 'Enter who it is addressed to') };
        return { body: { type, title: `${titleAr} - ${f.addressedTo.trim()}`, details: `موجه إلى: ${f.addressedTo.trim()}`, payload: { addressedTo: f.addressedTo.trim() } } };
      case 'EXPENSE_CLAIM':
        if (!(amountNum > 0)) return { error: t('أدخل مبلغاً صحيحاً', 'Enter a valid amount') };
        if (!f.description.trim()) return { error: t('اكتب وصف المصروف', 'Describe the expense') };
        return { body: { type, title: titleAr, details: f.description.trim(), amount: amountNum } };
      case 'LOAN':
        if (!(amountNum > 0)) return { error: t('أدخل مبلغ السلفة', 'Enter the loan amount') };
        if (!(monthsNum >= 1 && monthsNum <= 24 && Number.isInteger(monthsNum))) return { error: t('عدد الأشهر بين 1 و24', 'Months must be 1–24') };
        return { body: { type, title: titleAr, details: f.text.trim() || `سلفة ${amountNum} ر.س على ${monthsNum} أشهر`, amount: amountNum, payload: { months: monthsNum } } };
      case 'EXIT_REENTRY':
        if (!f.departDate || !f.returnDate) return { error: t('حدد تاريخ السفر والعودة', 'Pick travel dates') };
        if (f.returnDate < f.departDate) return { error: t('تاريخ العودة بعد تاريخ السفر', 'Return must be after departure') };
        return { body: { type, title: titleAr, details: f.text.trim() || `السفر ${f.departDate} والعودة ${f.returnDate}`, payload: { departureDate: f.departDate, returnDate: f.returnDate } } };
      case 'ATTENDANCE_CORRECTION':
        if (!f.date || !f.checkIn || !f.checkOut) return { error: t('أدخل التاريخ ووقتي الحضور والانصراف', 'Enter date, check-in and check-out') };
        if (f.checkOut <= f.checkIn) return { error: t('وقت الانصراف بعد وقت الحضور', 'Check-out must be after check-in') };
        return { body: { type, title: `${titleAr} - ${f.date}`, details: f.text.trim() || `تصحيح حضور يوم ${f.date}: ${f.checkIn} - ${f.checkOut}`,
          payload: { date: f.date, checkIn: riyadhISO(f.date, f.checkIn), checkOut: riyadhISO(f.date, f.checkOut) } } };
      default:
        if (!f.text.trim()) return { error: t('اكتب تفاصيل الطلب', 'Enter request details') };
        return { body: { type, title: titleAr, details: f.text.trim() } };
    }
  };

  const submit = async () => {
    setError(null);
    const r = build();
    if ('error' in r) return setError(r.error);
    setSaving(true);
    try {
      await api.post('/me/requests', r.body);
      toast(t('تم إرسال الطلب', 'Request submitted'));
      onCreated(); onClose();
    } catch (e) { setError(e instanceof ApiError ? e.display : String(e)); }
    finally { setSaving(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title={type ? typeLabel(type) : t('طلب جديد', 'New request')}
      footer={type ? <SheetButton onClick={submit} loading={saving}>{t('إرسال الطلب', 'Submit request')}</SheetButton> : undefined}>
      {!type ? (
        <div className="grid grid-cols-2 gap-2.5 pb-2">
          {REQUEST_TYPES.map(({ type: rt, icon: Icon }) => (
            <button key={rt} onClick={() => setType(rt)} className="flex min-h-[84px] flex-col items-start justify-between rounded-2xl border border-line bg-white p-3 text-start transition active:scale-[.98] active:bg-primary-50">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-50 text-primary"><Icon className="h-5 w-5" /></span>
              <span className="text-sm font-semibold text-ink">{typeLabel(rt)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {!initialType && (
            <button onClick={() => setType(null)} className="text-sm font-medium text-primary-500">{t('← تغيير نوع الطلب', '← Change type')}</button>
          )}

          {type === 'SALARY_CERTIFICATE' && (
            <Field label={t('موجّه إلى', 'Addressed to')} required hint={t('مثال: بنك الراجحي، السفارة، جهة حكومية', 'e.g. a bank, an embassy')}>
              <Input value={f.addressedTo} onChange={set('addressedTo')} className="h-12" placeholder={t('إلى من يهمه الأمر', 'To whom it may concern')} />
            </Field>
          )}

          {(type === 'EXPENSE_CLAIM' || type === 'LOAN') && (
            <Field label={t('المبلغ (ر.س)', 'Amount (SAR)')} required>
              <Input type="number" inputMode="decimal" min={0} value={f.amount} onChange={set('amount')} className="num h-12 text-lg" placeholder="0" />
            </Field>
          )}

          {type === 'EXPENSE_CLAIM' && (
            <Field label={t('وصف المصروف', 'Description')} required>
              <Textarea value={f.description} onChange={set('description')} placeholder={t('مثال: شراء مستلزمات للفرع', 'e.g. supplies for the branch')} />
            </Field>
          )}

          {type === 'LOAN' && (
            <>
              <Field label={t('عدد أشهر السداد', 'Repayment months')} required>
                <div className="flex flex-wrap gap-2">
                  {[3, 6, 10, 12].map((m) => (
                    <button key={m} type="button" onClick={() => setF((s) => ({ ...s, months: String(m) }))}
                      className={clsx('num h-11 min-w-[56px] rounded-xl border px-3 text-sm font-semibold', String(m) === f.months ? 'border-primary bg-primary text-white' : 'border-line bg-white text-ink')}>{m}</button>
                  ))}
                  <Input type="number" inputMode="numeric" min={1} max={24} value={f.months} onChange={set('months')} className="num h-11 w-20 text-center" />
                </div>
              </Field>
              {amountNum > 0 && monthsNum > 0 && (
                <p className="rounded-2xl bg-accent-50 px-3 py-2.5 text-sm text-ink">
                  {t('القسط الشهري التقريبي', 'Approx. monthly installment')}: <span className="num font-bold">{money(amountNum / monthsNum)}</span>
                </p>
              )}
              <Field label={t('ملاحظات', 'Notes')}><Textarea value={f.text} onChange={set('text')} placeholder={t('اختياري', 'Optional')} /></Field>
            </>
          )}

          {type === 'EXIT_REENTRY' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('تاريخ السفر', 'Departure')} required><Input type="date" value={f.departDate} min={todayISO()} onChange={set('departDate')} className="h-12" /></Field>
                <Field label={t('تاريخ العودة', 'Return')} required><Input type="date" value={f.returnDate} min={f.departDate || todayISO()} onChange={set('returnDate')} className="h-12" /></Field>
              </div>
              <Field label={t('ملاحظات', 'Notes')}><Textarea value={f.text} onChange={set('text')} placeholder={t('اختياري — الوجهة أو سبب السفر', 'Optional — destination or reason')} /></Field>
            </>
          )}

          {type === 'ATTENDANCE_CORRECTION' && (
            <>
              <Field label={t('التاريخ', 'Date')} required><Input type="date" value={f.date} max={todayISO()} onChange={set('date')} className="h-12" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('وقت الحضور', 'Check-in')} required><Input type="time" value={f.checkIn} onChange={set('checkIn')} className="num h-12" /></Field>
                <Field label={t('وقت الانصراف', 'Check-out')} required><Input type="time" value={f.checkOut} onChange={set('checkOut')} className="num h-12" /></Field>
              </div>
              <Field label={t('السبب', 'Reason')}><Textarea value={f.text} onChange={set('text')} placeholder={t('مثال: نسيت تسجيل البصمة', 'e.g. forgot to punch')} /></Field>
            </>
          )}

          {(type === 'LETTER' || type === 'OTHER') && (
            <Field label={t('تفاصيل الطلب', 'Details')} required>
              <Textarea value={f.text} onChange={set('text')} className="min-h-[130px]" placeholder={type === 'LETTER' ? t('نوع الخطاب والجهة والغرض منه', 'Letter type, recipient and purpose') : t('اكتب طلبك', 'Describe your request')} />
            </Field>
          )}

          <FormError message={error} />
        </div>
      )}
    </Sheet>
  );
}
