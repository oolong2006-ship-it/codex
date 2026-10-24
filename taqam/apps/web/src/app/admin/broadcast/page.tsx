'use client';
import clsx from 'clsx';
import { useState } from 'react';
import { Bell, CheckCircle2, Send } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, Field, Input, PageHeader, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { ConfirmModal } from '@/components/app/primitives';
import { errMsg } from '@/components/app/utils';
import { api } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { useFetch } from '@/lib/useFetch';
import { num } from '@/lib/format';
import { BROADCAST_TARGET, lbl, type AdminOverview, type BroadcastTarget } from '@/lib/adminTypes';

const TARGETS: BroadcastTarget[] = ['ALL', 'ACTIVE', 'TRIAL'];

export default function BroadcastPage() {
  const { t, lang } = useLang();
  const toast = useToast();
  const ov = useFetch(() => api.get<AdminOverview>('/admin/overview'), []);
  const [f, setF] = useState({ title: '', body: '', target: 'ALL' as BroadcastTarget });
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const c = ov.data?.companies;
  const audience = (x: BroadcastTarget) => (!c ? undefined : x === 'ACTIVE' ? c.active : x === 'TRIAL' ? c.trial : c.active + c.trial);
  const valid = f.title.trim().length > 0 && f.body.trim().length > 0;

  const send = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ sent: number }>('/admin/broadcast', { title: f.title.trim(), body: f.body.trim(), target: f.target });
      setSent(r.sent); setConfirm(false); setF({ title: '', body: '', target: f.target });
      toast(t(`تم الإرسال إلى ${r.sent} مستخدم`, `Sent to ${r.sent} users`));
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title={t('تعميم للمنشآت', 'Broadcast')} subtitle={t('أرسل إشعاراً لمالكي ومديري الموارد البشرية في المنشآت المشتركة', 'Notify owners and HR admins of subscriber companies')} />
      {sent !== null && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-success/30 bg-success-50 px-4 py-3 text-sm text-success">
          <CheckCircle2 className="h-5 w-5" />{t(`تم إرسال آخر تعميم إلى ${num(sent)} مستخدم.`, `Last broadcast delivered to ${num(sent)} users.`)}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader title={t('رسالة جديدة', 'New message')} />
          <CardBody className="space-y-4">
            <Field label={t('الجمهور', 'Audience')} required>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {TARGETS.map((x) => (
                  <button key={x} type="button" onClick={() => setF((s) => ({ ...s, target: x }))}
                    className={clsx('rounded-xl border px-3 py-2.5 text-start text-sm', f.target === x ? 'border-primary bg-primary-50 text-primary ring-1 ring-primary' : 'border-line text-ink-muted hover:border-primary-500')}>
                    <span className="block font-medium">{lbl(BROADCAST_TARGET, x, lang)}</span>
                    {audience(x) !== undefined && <span className="num block text-[11px] text-ink-soft">{t(`${audience(x)} منشأة`, `${audience(x)} companies`)}</span>}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={t('العنوان', 'Title')} required>
              <Input value={f.title} maxLength={120} onChange={(e) => setF((s) => ({ ...s, title: e.target.value }))} placeholder={t('مثال: تحديث جديد على مسير الرواتب', 'e.g. New payroll update')} />
            </Field>
            <Field label={t('نص الرسالة', 'Message')} required hint={`${f.body.length} / 1000`}>
              <Textarea value={f.body} maxLength={1000} onChange={(e) => setF((s) => ({ ...s, body: e.target.value }))} className="min-h-[150px]" />
            </Field>
            <div className="flex justify-end">
              <Button disabled={!valid} onClick={() => setConfirm(true)}><Send className="h-4 w-4 rtl:-scale-x-100" />{t('إرسال', 'Send')}</Button>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t('معاينة', 'Preview')} subtitle={t('كما يظهر في قائمة إشعارات المنشأة', 'As it appears in the company notifications')} />
          <CardBody>
            <div className="rounded-2xl border border-line bg-white shadow-soft">
              <div className="flex gap-3 bg-accent-50/60 px-4 py-3">
                <span className="mt-0.5 rounded-lg bg-night p-1.5 text-accent"><Bell className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{f.title || t('عنوان الإشعار', 'Notification title')}</span>
                  <span className="mt-0.5 block whitespace-pre-line break-words text-xs text-ink-muted">{f.body || t('نص الرسالة يظهر هنا…', 'Message body appears here…')}</span>
                  <span className="mt-1 block text-[11px] text-ink-soft">{t('الآن', 'now')} · {t('فريق طاقم', 'Taqam team')}</span>
                </span>
              </div>
            </div>
            <p className="mt-4 text-xs text-ink-soft">{t('يصل الإشعار إلى المستخدمين بدور «المالك» و«مدير الموارد البشرية» فقط.', 'Delivered to users with the Owner and HR Admin roles only.')}</p>
          </CardBody>
        </Card>
      </div>
      <ConfirmModal open={confirm} onClose={() => setConfirm(false)} onConfirm={send} loading={busy} confirmLabel={t('إرسال الآن', 'Send now')}
        title={t('تأكيد الإرسال', 'Confirm broadcast')}
        message={t(`سيُرسل «${f.title}» إلى ${lbl(BROADCAST_TARGET, f.target, 'ar')}${audience(f.target) !== undefined ? ` (${audience(f.target)} منشأة)` : ''}. لا يمكن التراجع.`,
          `“${f.title}” will be sent to ${lbl(BROADCAST_TARGET, f.target, 'en').toLowerCase()}${audience(f.target) !== undefined ? ` (${audience(f.target)})` : ''}. This cannot be undone.`)} />
    </div>
  );
}
