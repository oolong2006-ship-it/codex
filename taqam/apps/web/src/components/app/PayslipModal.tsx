'use client';
import { Printer } from 'lucide-react';
import { Button, Modal, Badge } from '@/components/ui';
import { useLang } from '@/lib/i18n';
import { money, num, period } from '@/lib/format';
import type { PayLine, Payslip } from '@/lib/types';

function Lines({ title, lines, total, tone }: { title: string; lines: PayLine[]; total: number; tone: 'success' | 'danger' }) {
  const { lang, t } = useLang();
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className={`flex items-center justify-between px-4 py-2.5 text-sm font-semibold ${tone === 'success' ? 'bg-success-50 text-success' : 'bg-danger-50 text-danger'}`}>
        <span>{title}</span><span className="num">{money(total)}</span>
      </div>
      <ul className="divide-y divide-line/70">
        {!lines.length && <li className="px-4 py-3 text-sm text-ink-soft">{t('لا يوجد', 'None')}</li>}
        {lines.map((l, i) => (
          <li key={`${l.code}-${i}`} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-ink-muted">{lang === 'ar' ? l.labelAr : l.labelEn || l.labelAr}</span>
            <span className="num font-medium text-ink">{money(l.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PayslipModal({ payslip, onClose }: { payslip: Payslip | null; onClose: () => void }) {
  const { t, lang } = useLang();
  if (!payslip) return null;
  const p = payslip;
  return (
    <Modal open onClose={onClose} size="lg" title={`${t('قسيمة راتب', 'Payslip')} — ${period(p.period, lang)}`}
      footer={<Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" />{t('طباعة', 'Print')}</Button>}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-xl bg-sand p-4">
        <div>
          <p className="font-semibold text-ink">{p.employee.name}</p>
          <p className="num text-xs text-ink-muted">{p.employee.employeeNumber} · {p.employee.branchName ?? ''}</p>
          {p.employee.iban && <p className="num mt-1 text-xs text-ink-soft" dir="ltr">{p.employee.iban}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={p.employee.isSaudi ? 'primary' : 'neutral'}>{p.employee.isSaudi ? t('سعودي', 'Saudi') : t('غير سعودي', 'Non-Saudi')}</Badge>
          <Badge tone="info">{t('أيام مستحقة', 'Payable days')}: <span className="num">{num(p.payableDays)}</span></Badge>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Lines title={t('الاستحقاقات', 'Earnings')} lines={p.earnings} total={p.gross} tone="success" />
        <Lines title={t('الاستقطاعات', 'Deductions')} lines={p.deductions} total={p.totalDeductions} tone="danger" />
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-primary px-5 py-4 text-white">
        <span className="font-medium">{t('صافي الراتب', 'Net pay')}</span>
        <span className="num text-2xl font-bold">{money(p.net)}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-line px-4 py-2.5"><p className="text-xs text-ink-soft">{t('تأمينات (حصة الموظف)', 'GOSI (employee)')}</p><p className="num font-semibold">{money(p.gosiEmployee)}</p></div>
        <div className="rounded-xl border border-line px-4 py-2.5"><p className="text-xs text-ink-soft">{t('تأمينات (حصة المنشأة)', 'GOSI (employer)')}</p><p className="num font-semibold">{money(p.gosiEmployer)}</p></div>
      </div>
      {p.notes?.length > 0 && (
        <ul className="mt-4 list-inside list-disc space-y-1 rounded-xl bg-warning-50 p-3 text-xs text-[#7a5d00]">
          {p.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
    </Modal>
  );
}
