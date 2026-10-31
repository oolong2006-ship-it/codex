'use client';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Info, ShieldCheck } from 'lucide-react';
import { Badge, Card, CardBody, CardHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { date, dateTime } from '@/lib/format';
import { groupWpsIssues, WPS_CHECK_TITLE, WPS_ISSUE_EN, wpsStatusLabel } from '@/lib/wps-check';
import type { WpsCheck } from '@/lib/types';

/** «فحص الملف قبل الرفع إلى مُدد» — refetches whenever the run is reloaded or the file is exported again. */
export function WpsCheckPanel({ runId, run, exports }: { runId: string; run: unknown; exports: number }) {
  const { t, lang } = useLang();
  const { data: c, loading, error } = useFetch(() => api.get<WpsCheck>(`/payroll/runs/${runId}/wps-check`), [runId, run, exports]);
  const status = c ? wpsStatusLabel(c.errors) : null;

  return (
    <Card className="mb-6">
      <CardHeader title={t(WPS_CHECK_TITLE.ar, WPS_CHECK_TITLE.en)}
        subtitle={c ? `${t('تاريخ الصرف', 'Payment date')} ${date(c.scheduledPaymentDate, lang)} · ${c.exportedAt ? `${t('آخر تصدير للملف', 'File last exported')} ${dateTime(c.exportedAt, lang)}` : t('لم يُصدَّر الملف بعد', 'File not exported yet')}` : undefined}
        action={status && c ? (
          <Badge tone={c.ready ? 'success' : 'danger'} className="!text-sm">
            {c.ready ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{t(status.ar, status.en)}
          </Badge>
        ) : undefined} />
      <CardBody>
        {error && !c ? <p className="text-sm text-danger">{error}</p>
          : loading && !c ? <p className="text-sm text-ink-muted">{t('جارٍ الفحص…', 'Checking…')}</p>
          : c && !c.issues.length ? (
            <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" />{t('لا توجد ملاحظات — الملف مطابق لمتطلبات مُدد', 'No issues — the file meets Mudad requirements')}</p>
          ) : c && (
            <div className="space-y-4">
              {groupWpsIssues(c.issues).map((g) => (
                <section key={g.severity}>
                  <h3 className={`mb-2 flex items-center gap-1.5 text-sm font-semibold ${g.severity === 'ERROR' ? 'text-danger' : 'text-warning'}`}>
                    {g.severity === 'ERROR' ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                    {g.severity === 'ERROR' ? t('أخطاء تمنع الرفع', 'Errors (block the upload)') : t('تنبيهات للمراجعة', 'Warnings (review)')}
                    <span className="num">({g.issues.length})</span>
                  </h3>
                  <ul className="divide-y divide-line rounded-xl border border-line">
                    {g.issues.map((i, k) => (
                      <li key={`${i.code}-${i.employeeNumber ?? ''}-${k}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                        {i.employeeId ? (
                          <Link href={`/app/employees/${i.employeeId}`} className="font-medium text-ink hover:text-primary-500">
                            {i.employeeName} <span className="num text-xs text-ink-soft">{i.employeeNumber}</span>
                          </Link>
                        ) : <span className="font-medium text-ink">{i.employeeNumber ?? t('المسير كاملاً', 'Whole run')}</span>}
                        <span className={g.severity === 'ERROR' ? 'text-danger' : 'text-ink-muted'}>{lang === 'ar' ? i.messageAr : WPS_ISSUE_EN[i.code]}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
      </CardBody>
    </Card>
  );
}
