'use client';
import { useMemo, useState } from 'react';
import { Info, PlayCircle } from 'lucide-react';
import { Button, Card, PageHeader, Pagination, Select } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { Async, FilterBar } from '@/components/app/primitives';
import { errMsg } from '@/components/app/utils';
import { EmailDrawer, EmailList } from '@/components/admin/BillingModals';
import { api, type Paginated } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { useFetch } from '@/lib/useFetch';
import { EMAIL_STATUS, EMAIL_STATUSES, EMAIL_TYPE, EMAIL_TYPES, companyName, lbl, type AdminCompany, type EmailLog } from '@/lib/adminTypes';

const PAGE_SIZE = 25;

export default function EmailsPage() {
  const { t, lang } = useLang();
  const toast = useToast();
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<EmailLog | null>(null);
  const [running, setRunning] = useState(false);
  const { data, loading, error, reload } = useFetch(
    () => api.get<Paginated<EmailLog>>('/admin/emails', { type: type || undefined, status: status || undefined, companyId: companyId || undefined, page, pageSize: PAGE_SIZE }),
    [type, status, companyId, page],
  );
  const companies = useFetch(() => api.get<Paginated<AdminCompany>>('/admin/companies', { sort: 'name', pageSize: 200 }), []);
  const companyOpts = useMemo(() => (companies.data?.data ?? []).map((c) => ({ value: c.id, label: companyName(c, lang) })), [companies.data, lang]);
  const logged = !!data?.data.some((e) => e.status === 'LOGGED');

  const run = async () => {
    setRunning(true);
    try {
      const r = await api.post<{ sent: number }>('/admin/reminders/run', {});
      toast(r.sent ? t(`تم إرسال ${r.sent} تذكير`, `${r.sent} reminder(s) sent`) : t('لا توجد تذكيرات مستحقة اليوم', 'No reminders due today'));
      if (page !== 1) setPage(1); else void reload();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setRunning(false); }
  };

  return (
    <div>
      <PageHeader title={t('الرسائل', 'Emails')} subtitle={t('سجل رسائل التذكير والفواتير المرسلة لمالكي المنشآت', 'Reminder and invoice emails sent to company owners')}
        actions={<Button onClick={run} loading={running}><PlayCircle className="h-4 w-4" />{t('تشغيل التذكيرات الآن', 'Run reminders now')}</Button>} />
      {logged && (
        <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-info/25 bg-info-50 px-4 py-3 text-sm text-info">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">{t('لم يُضبط خادم البريد بعد؛ الرسائل محفوظة ولم تُرسل', 'No mail server configured yet; emails are stored, not sent')}</p>
            <p className="mt-0.5 text-xs text-info/80">{t('اضبط متغيرات SMTP_HOST وما يتبعها على الخادم لتُرسل الرسائل فعلياً. التذكيرات التلقائية تعمل يومياً الساعة 9:00 صباحاً بتوقيت الرياض.', 'Set SMTP_HOST and related variables on the server to deliver mail. Automatic reminders run daily at 09:00 Riyadh time.')}</p>
          </div>
        </div>
      )}
      <Card>
        <FilterBar>
          <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} placeholder={t('كل الأنواع', 'All types')}
            options={EMAIL_TYPES.map((x) => ({ value: x, label: lbl(EMAIL_TYPE, x, lang) }))} className="sm:w-52" />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder={t('كل الحالات', 'All statuses')}
            options={EMAIL_STATUSES.map((x) => ({ value: x, label: lbl(EMAIL_STATUS, x, lang) }))} className="sm:w-48" />
          <Select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setPage(1); }} placeholder={t('كل المنشآت', 'All companies')} options={companyOpts} className="sm:w-64" />
        </FilterBar>
        <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
          {data && <div className={loading ? 'opacity-60' : ''}><EmailList rows={data.data} showCompany onOpen={setOpen} /></div>}
        </Async>
        {data && <Pagination page={data.page} pageSize={data.pageSize || PAGE_SIZE} total={data.total} onChange={setPage} />}
      </Card>
      <EmailDrawer email={open} onClose={() => setOpen(null)} />
    </div>
  );
}
