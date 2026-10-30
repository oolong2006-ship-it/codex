'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2, Eye, FileMinus2, FileText, Mail, Send, X } from 'lucide-react';
import { Badge, Button, EmptyState, Field, Input, Modal, Select, Table, Textarea, type Column } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { Toggle } from '@/components/app/primitives';
import { errMsg } from '@/components/app/utils';
import { InvoiceStatusChip, invoicePeriod } from '@/components/billing/InvoiceDocument';
import { useDialog } from '@/components/ui/useDialog';
import { api } from '@/lib/api';
import {
  LIMITS, PERIOD_START_WINDOW, UNREGISTERED_NOTE, addDays, computeInvoice, cycleMonths, defaultBilledEmployees, nextPeriodStart, periodAnchor, periodEnd, vatGate,
} from '@/lib/billing';
import { useLang } from '@/lib/i18n';
import { arDays, date, money, num, todayISO } from '@/lib/format';
import {
  BILLING_CYCLE, EMAIL_STATUS, EMAIL_STATUS_TONE, EMAIL_TYPE, EMAIL_TYPE_TONE, PAYMENT_METHOD, PAYMENT_METHODS, companyName, lbl,
  type AdminCompany, type BillingCycle, type EmailLog, type Invoice, type PaymentMethod,
} from '@/lib/adminTypes';
import { usePlatformSettings, Segmented } from './CompanyModals';
import { timeAgo } from './primitives';
import { refreshAdminCounts } from './AdminShell';

export const invoiceHref = (id: string) => `/admin/invoices/view?id=${encodeURIComponent(id)}`;

// ---------------- tables ----------------
/** Invoice list used on /admin/invoices and the company «الفواتير» tab. */
/** Issued or paid invoice that has not been credited yet. */
export const canCredit = (i: Pick<Invoice, 'status' | 'documentType' | 'creditedByNumber'>) =>
  i.documentType !== 'CREDIT_NOTE' && (i.status === 'ISSUED' || i.status === 'PAID') && !i.creditedByNumber;
export const isPayable = (i: Pick<Invoice, 'status' | 'documentType'>) => i.status === 'ISSUED' && i.documentType !== 'CREDIT_NOTE';

/** Total cell: credit notes read as a credit (−), credited originals are struck through. */
function TotalCell({ i, className }: { i: Invoice; className?: string }) {
  if (i.documentType === 'CREDIT_NOTE') return <span className={clsx('num whitespace-nowrap font-semibold text-info', className)}>− {money(i.total)}</span>;
  return <span className={clsx('num whitespace-nowrap font-semibold', i.status === 'CREDITED' ? 'text-ink-soft line-through' : 'text-ink', className)}>{money(i.total)}</span>;
}
function NumberCell({ i }: { i: Invoice }) {
  const { t } = useLang();
  return (
    <div className="leading-tight">
      <Link href={invoiceHref(i.id)} className="num font-semibold text-primary-500 hover:underline" dir="ltr">{i.number}</Link>
      {i.documentType === 'CREDIT_NOTE' && i.creditsNumber && <p className="text-[11px] text-ink-soft">{t('يخص', 'For')} <span className="num" dir="ltr">{i.creditsNumber}</span></p>}
      {i.creditedByNumber && <p className="text-[11px] text-ink-soft">{t('إشعار دائن', 'Credit note')} <span className="num" dir="ltr">{i.creditedByNumber}</span></p>}
    </div>
  );
}

export function InvoiceTable({ rows, showCompany, onPay, onCredit, empty }: {
  rows: Invoice[]; showCompany?: boolean; onPay: (i: Invoice) => void; onCredit: (i: Invoice) => void; empty?: React.ReactNode;
}) {
  const { t, lang } = useLang();
  const cols: Column<Invoice>[] = [
    { key: 'number', header: t('الرقم', 'Number'), render: (i) => <NumberCell i={i} /> },
    ...(showCompany ? [{ key: 'company', header: t('المنشأة', 'Company'), render: (i: Invoice) => (
      <Link href={`/admin/companies/${i.companyId}`} className="block max-w-[220px] truncate font-medium text-ink hover:text-primary-500">{i.companyName}</Link>
    ) }] : []),
    { key: 'period', header: t('الفترة', 'Period'), render: (i) => (
      <div className="leading-tight"><p className="text-xs text-ink">{invoicePeriod(i, lang)}</p><p className="text-[11px] text-ink-soft">{lbl(BILLING_CYCLE, i.billingCycle, lang)} · {t(`${num(i.employees)} موظف`, `${num(i.employees)} emp.`)}</p></div>
    ) },
    { key: 'total', header: t('الإجمالي', 'Total'), render: (i) => <TotalCell i={i} /> },
    { key: 'due', header: t('الاستحقاق', 'Due'), render: (i) => i.documentType === 'CREDIT_NOTE'
      ? <span className="text-xs text-ink-soft">{date(i.issueDate, lang)}</span>
      : <span className={clsx('num text-xs', i.overdue ? 'font-semibold text-danger' : 'text-ink-muted')}>{date(i.dueDate, lang)}</span> },
    { key: 'status', header: t('الحالة', 'Status'), render: (i) => <InvoiceStatusChip inv={i} /> },
    { key: 'act', header: '', className: 'text-end', render: (i) => (
      <div className="flex items-center justify-end gap-1">
        <Link href={invoiceHref(i.id)} className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium text-primary hover:bg-primary-50" title={t('عرض', 'View')} aria-label={t('عرض', 'View')}>
          <Eye className="h-4 w-4" />
        </Link>
        {isPayable(i) && <Button size="sm" variant="secondary" className="!px-2.5" onClick={() => onPay(i)}><CheckCircle2 className="h-4 w-4 text-success" />{t('تسجيل الدفع', 'Record payment')}</Button>}
        {canCredit(i) && <Button size="sm" variant="ghost" className="!text-danger hover:!bg-danger-50" onClick={() => onCredit(i)} title={t('إصدار إشعار دائن', 'Issue credit note')} aria-label={t('إصدار إشعار دائن', 'Issue credit note')}><FileMinus2 className="h-4 w-4" /></Button>}
      </div>
    ) },
  ];
  return <Table columns={cols} rows={rows} rowKey={(i) => i.id} empty={empty ?? <EmptyState title={t('لا توجد فواتير', 'No invoices')} />} />;
}

/** Mobile list of invoices (cards). */
export function InvoiceCards({ rows, showCompany, onPay, onCredit }: { rows: Invoice[]; showCompany?: boolean; onPay: (i: Invoice) => void; onCredit: (i: Invoice) => void }) {
  const { t, lang } = useLang();
  if (!rows.length) return <EmptyState title={t('لا توجد فواتير', 'No invoices')} />;
  return (
    <ul className="divide-y divide-line">
      {rows.map((i) => (
        <li key={i.id} className="px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <NumberCell i={i} />
              {showCompany && <p className="truncate text-sm font-medium text-ink">{i.companyName}</p>}
              <p className="text-xs text-ink-soft">{invoicePeriod(i, lang)}</p>
            </div>
            <InvoiceStatusChip inv={i} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <TotalCell i={i} className="font-bold" />
            {i.documentType !== 'CREDIT_NOTE' && <span className={clsx('num text-xs', i.overdue ? 'text-danger' : 'text-ink-muted')}>{t('يستحق', 'Due')} {date(i.dueDate, lang)}</span>}
          </div>
          {(isPayable(i) || canCredit(i)) && (
            <div className="mt-2 flex gap-2">
              {isPayable(i) && <Button size="sm" variant="secondary" className="flex-1" onClick={() => onPay(i)}><CheckCircle2 className="h-4 w-4 text-success" />{t('تسجيل الدفع', 'Record payment')}</Button>}
              {canCredit(i) && <Button size="sm" variant="secondary" className="flex-1 !text-danger" onClick={() => onCredit(i)}><FileMinus2 className="h-4 w-4" />{t('إشعار دائن', 'Credit note')}</Button>}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function EmailTypeChip({ type }: { type: EmailLog['type'] }) {
  const { lang } = useLang();
  return <Badge tone={EMAIL_TYPE_TONE[type] ?? 'neutral'}>{lbl(EMAIL_TYPE, type, lang)}</Badge>;
}
export function EmailStatusChip({ status }: { status: EmailLog['status'] }) {
  const { lang } = useLang();
  return <Badge tone={EMAIL_STATUS_TONE[status] ?? 'neutral'}>{lbl(EMAIL_STATUS, status, lang)}</Badge>;
}

/** Outbox rows; clicking opens the preview drawer. */
export function EmailList({ rows, showCompany, onOpen }: { rows: EmailLog[]; showCompany?: boolean; onOpen: (e: EmailLog) => void }) {
  const { t, lang } = useLang();
  if (!rows.length) return <EmptyState title={t('لا توجد رسائل', 'No emails')} description={t('تظهر هنا رسائل التذكير والفواتير المرسلة للمنشآت', 'Reminders and invoice emails sent to companies appear here')} />;
  return (
    <ul className="divide-y divide-line">
      {rows.map((e) => (
        <li key={e.id}>
          <button type="button" onClick={() => onOpen(e)} className="flex w-full items-start gap-3 px-4 py-3 text-start hover:bg-primary-50/40 sm:px-5">
            <span className="mt-0.5 hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary sm:flex"><Mail className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <EmailTypeChip type={e.type} />
                {showCompany && e.companyName && <span className="truncate text-xs font-medium text-ink-muted">{e.companyName}</span>}
              </span>
              <span className="mt-1 block truncate text-sm font-semibold text-ink">{e.subject}</span>
              <span className="block truncate text-xs text-ink-soft" dir="ltr">{e.to}</span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <EmailStatusChip status={e.status} />
              <span className="text-[11px] text-ink-soft" title={date(e.createdAt, lang)}>{timeAgo(e.createdAt, lang)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Side drawer with the full email body. */
export function EmailDrawer({ email, onClose }: { email: EmailLog | null; onClose: () => void }) {
  const { t, lang } = useLang();
  const titleId = useId();
  const ref = useDialog<HTMLElement>(!!email, onClose);
  if (!email) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-primary/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <aside ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className="absolute inset-y-0 end-0 flex w-full max-w-xl flex-col bg-white shadow-lift outline-none">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5"><EmailTypeChip type={email.type} /><EmailStatusChip status={email.status} /></div>
            <h2 id={titleId} className="mt-2 text-base font-semibold leading-snug text-ink">{email.subject}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-ink-muted hover:bg-sand" aria-label={t('إغلاق', 'Close')}><X className="h-5 w-5" /></button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-b border-line bg-sand/50 px-5 py-3 text-sm">
          <dt className="text-ink-soft">{t('إلى', 'To')}</dt><dd className="truncate font-medium text-ink" dir="ltr">{email.to}</dd>
          {email.companyName && <><dt className="text-ink-soft">{t('المنشأة', 'Company')}</dt><dd className="truncate text-ink">{email.companyId ? <Link href={`/admin/companies/${email.companyId}`} className="text-primary-500 hover:underline">{email.companyName}</Link> : email.companyName}</dd></>}
          <dt className="text-ink-soft">{t('التاريخ', 'Date')}</dt><dd className="text-ink">{date(email.createdAt, lang)} · {timeAgo(email.createdAt, lang)}</dd>
          {email.error && <><dt className="text-danger">{t('الخطأ', 'Error')}</dt><dd className="text-danger" dir="ltr">{email.error}</dd></>}
        </dl>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="rounded-2xl border border-line bg-white p-5 text-sm leading-7 text-ink shadow-soft">
            {email.body.split(/\n{2,}/).map((para, i) => <p key={i} className="mb-3 whitespace-pre-line last:mb-0" dir="auto">{para}</p>)}
          </div>
        </div>
      </aside>
    </div>
  );
}

// ---------------- issue ----------------
/** Ref-based guard against a second submit before React re-renders the loading button. */
function useOnce() {
  const busy = useRef(false);
  return async (fn: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    try { await fn(); } finally { busy.current = false; }
  };
}

type IssueCo = Pick<AdminCompany, 'id' | 'nameAr' | 'nameEn' | 'billingCycle' | 'effectivePrice' | 'activeEmployees' | 'status' | 'plan'>;
export function IssueInvoiceModal({ company, invoices, open, onClose, onDone }: { company: IssueCo; invoices: Invoice[]; open: boolean; onClose: () => void; onDone: (i: Invoice) => void }) {
  const { t, lang } = useLang();
  const toast = useToast();
  const once = useOnce();
  const settings = usePlatformSettings(open);
  const [f, setF] = useState({ periodStart: '', billingCycle: 'MONTHLY' as BillingCycle, employees: '', unitPrice: '', notes: '', sendEmail: true });
  const [busy, setBusy] = useState(false);
  const minBilled = settings?.billing?.minBilledEmployees ?? 10;
  useEffect(() => {
    if (!open) return;
    setF({
      periodStart: nextPeriodStart(invoices, todayISO(), { expired: company.status === 'EXPIRED' }), billingCycle: company.billingCycle,
      employees: String(defaultBilledEmployees(company.plan, company.activeEmployees, minBilled)), unitPrice: company.effectivePrice != null ? String(company.effectivePrice) : '', notes: '', sendEmail: true,
    });
  }, [open, company, invoices, minBilled]);
  const employees = Math.max(0, Math.round(Number(f.employees) || 0));
  const unitPrice = f.unitPrice.trim() === '' ? null : Math.max(0, Number(f.unitPrice) || 0);
  const gate = vatGate({ sellerVatNumber: settings?.billing?.sellerVatNumber ?? '', vatRate: settings?.billing?.vatRate ?? 0.15 });
  const vatRate = settings?.billing ? gate.vatRate : 0.15;
  const calc = unitPrice != null && employees > 0
    ? computeInvoice({ employees, unitPrice, billingCycle: f.billingCycle, annualDiscount: settings?.annualDiscount ?? 0.15, vatRate })
    : null;
  const end = f.periodStart ? periodEnd(f.periodStart, cycleMonths(f.billingCycle), periodAnchor(invoices, f.periodStart)) : '';
  const dueDays = settings?.billing?.invoiceDueDays ?? 7;
  const today = todayISO();
  const dueDate = addDays(today, dueDays);
  const minStart = addDays(today, -PERIOD_START_WINDOW.back); const maxStart = addDays(today, PERIOD_START_WINDOW.ahead);
  const set = (k: 'periodStart' | 'employees' | 'unitPrice' | 'notes') => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = () => once(async () => {
    if (unitPrice == null) { toast(t('حدد سعر الموظف لهذه المنشأة أولاً', 'Set a price per employee first'), 'error'); return; }
    if (employees < 1) { toast(t('عدد الموظفين 1 على الأقل', 'At least 1 employee'), 'error'); return; }
    if (f.periodStart && (f.periodStart < minStart || f.periodStart > maxStart)) { toast(t('بداية الفترة يجب أن تكون بين 60 يوماً مضت و90 يوماً قادمة', 'Period start must be between 60 days ago and 90 days ahead'), 'error'); return; }
    setBusy(true);
    try {
      const r = await api.post<Invoice>(`/admin/companies/${company.id}/invoices`, {
        periodStart: f.periodStart || undefined, billingCycle: f.billingCycle, employees, unitPrice, notes: f.notes.trim() || undefined, sendEmail: f.sendEmail,
      });
      toast(t(`تم إصدار الفاتورة ${r.number}`, `Invoice ${r.number} issued`)); refreshAdminCounts(); onDone(r); onClose();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  });
  const dueHint = dueDays === 0 ? t('تستحق يوم الإصدار', 'Due on the issue date') : t(`بعد ${arDays(dueDays)} من الإصدار`, `${dueDays} days after issue`);
  return (
    <Modal open={open} onClose={onClose} size="lg" title={t(`إصدار فاتورة — ${companyName(company, lang)}`, `Issue invoice — ${companyName(company, lang)}`)}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button onClick={submit} loading={busy} disabled={!calc}><FileText className="h-4 w-4" />{t('إصدار الفاتورة', 'Issue invoice')}</Button></>}>
      <div className="grid gap-5 md:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          <Segmented value={f.billingCycle} onChange={(billingCycle) => setF((s) => ({ ...s, billingCycle }))} options={[
            { value: 'MONTHLY', label: lbl(BILLING_CYCLE, 'MONTHLY', lang), hint: t('شهر واحد', '1 month') },
            { value: 'ANNUAL', label: lbl(BILLING_CYCLE, 'ANNUAL', lang), hint: t(`12 شهراً · خصم ${Math.round((settings?.annualDiscount ?? 0.15) * 100)}%`, `12 months · ${Math.round((settings?.annualDiscount ?? 0.15) * 100)}% off`) },
          ]} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('بداية الفترة', 'Period start')} hint={end ? t(`تنتهي ${date(end, lang)}`, `Ends ${date(end, lang)}`) : undefined}>
              <Input type="date" dir="ltr" value={f.periodStart} min={minStart} max={maxStart} onChange={set('periodStart')} />
            </Field>
            <Field label={t('عدد الموظفين', 'Employees')} hint={company.plan === 'ENTERPRISE'
              ? t(`النشطون الآن: ${company.activeEmployees}`, `Active now: ${company.activeEmployees}`)
              : t(`النشطون الآن: ${company.activeEmployees} · الحد الأدنى للفوترة ${minBilled}`, `Active now: ${company.activeEmployees} · minimum billed ${minBilled}`)}>
              <Input type="number" min={1} max={LIMITS.employees} dir="ltr" value={f.employees} onChange={set('employees')} />
            </Field>
            <Field label={t('سعر الموظف (ر.س/شهر)', 'Price / employee (SAR/mo)')} hint={company.effectivePrice == null ? t('لا يوجد سعر لهذه المنشأة — أدخله يدوياً', 'No price on file — enter one') : undefined}>
              <Input type="number" min={0} max={LIMITS.unitPrice} step="0.01" dir="ltr" value={f.unitPrice} onChange={set('unitPrice')} placeholder="—" />
            </Field>
            <Field label={t('تاريخ الاستحقاق', 'Due date')} hint={dueHint}>
              <Input disabled dir={lang === 'ar' ? 'rtl' : 'ltr'} value={date(dueDate, lang)} readOnly />
            </Field>
          </div>
          <Field label={t('ملاحظات على الفاتورة', 'Notes on the invoice')}><Textarea value={f.notes} onChange={set('notes')} maxLength={LIMITS.notes} className="min-h-[70px]" /></Field>
          <Toggle checked={f.sendEmail} onChange={(v) => setF((s) => ({ ...s, sendEmail: v }))} label={t('إرسال الفاتورة بالبريد لمالك المنشأة', 'Email the invoice to the owner')} />
        </div>
        <aside className="h-fit rounded-2xl border border-line bg-sand/60 p-4 text-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">{t('معاينة المبلغ', 'Amount preview')}</p>
          {calc ? (
            <dl className="space-y-2">
              <PreviewRow label={`${num(employees)} × ${money(unitPrice!)} × ${calc.months}`} value={money(calc.subtotal)} />
              {calc.discount > 0 && <PreviewRow label={t(`خصم سنوي ${Math.round(calc.discountRate * 100)}%`, `Annual discount ${Math.round(calc.discountRate * 100)}%`)} value={`− ${money(calc.discount)}`} />}
              <PreviewRow label={t('غير شامل الضريبة', 'Excl. VAT')} value={money(calc.taxable)} />
              <PreviewRow label={t(`ضريبة القيمة المضافة ${Math.round(vatRate * 1000) / 10}%`, `VAT ${Math.round(vatRate * 1000) / 10}%`)} value={money(calc.vat)} />
              <div className="mt-2 flex items-center justify-between rounded-xl bg-night px-3 py-2.5 text-white">
                <span className="text-xs">{t('الإجمالي', 'Total')}</span><span className="num text-lg font-bold">{money(calc.total)}</span>
              </div>
            </dl>
          ) : <p className="text-xs text-ink-muted">{t('أدخل السعر وعدد الموظفين لعرض المبلغ', 'Enter a price and employees to preview')}</p>}
          {settings?.billing && gate.documentType === 'INVOICE' && (
            <p className="mt-3 rounded-lg bg-warning-50 px-2.5 py-2 text-xs text-warning">{t(`${UNREGISTERED_NOTE[1]} — تصدر «فاتورة» بدون ضريبة.`, `${UNREGISTERED_NOTE[0]} — a plain invoice without VAT is issued.`)}</p>
          )}
        </aside>
      </div>
    </Modal>
  );
}
function PreviewRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><dt className="num text-xs text-ink-muted" dir="ltr">{label}</dt><dd className="num font-medium text-ink">{value}</dd></div>;
}

// ---------------- pay ----------------
export function PayInvoiceModal({ invoice, onClose, onDone }: { invoice: Invoice | null; onClose: () => void; onDone: (i: Invoice) => void }) {
  const { t, lang } = useLang();
  const toast = useToast();
  const once = useOnce();
  const [f, setF] = useState({ paymentMethod: 'BANK_TRANSFER' as PaymentMethod, paymentRef: '', paidAt: '', extendSubscription: true });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (invoice) setF({ paymentMethod: 'BANK_TRANSFER', paymentRef: '', paidAt: todayISO(), extendSubscription: true }); }, [invoice]);
  if (!invoice) return null;
  const today = todayISO();
  const submit = () => once(async () => {
    if (f.paidAt && f.paidAt > today) { toast(t('تاريخ الدفع لا يمكن أن يكون في المستقبل', 'Payment date cannot be in the future'), 'error'); return; }
    if (f.paidAt && f.paidAt < invoice.issueDate) { toast(t('تاريخ الدفع لا يمكن أن يسبق تاريخ إصدار الفاتورة', 'Payment date cannot be before the issue date'), 'error'); return; }
    setBusy(true);
    try {
      const r = await api.post<Invoice>(`/admin/invoices/${invoice.id}/pay`, {
        paymentMethod: f.paymentMethod, paymentRef: f.paymentRef.trim() || undefined, paidAt: f.paidAt || undefined, extendSubscription: f.extendSubscription,
      });
      toast(t(`تم تسجيل سداد ${r.number}`, `Payment recorded for ${r.number}`)); refreshAdminCounts(); onDone(r); onClose();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  });
  return (
    <Modal open onClose={onClose} title={t('تسجيل الدفع', 'Record payment')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button onClick={submit} loading={busy}><CheckCircle2 className="h-4 w-4" />{t('تأكيد السداد', 'Confirm payment')}</Button></>}>
      <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-sand/60 px-4 py-3">
        <div className="min-w-0"><p className="num text-sm font-semibold text-ink" dir="ltr">{invoice.number}</p><p className="truncate text-xs text-ink-muted">{invoice.companyName} · {invoicePeriod(invoice, lang)}</p></div>
        <p className="num shrink-0 text-lg font-bold text-ink">{money(invoice.total)}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('طريقة الدفع', 'Payment method')} required>
          <Select value={f.paymentMethod} onChange={(e) => setF((s) => ({ ...s, paymentMethod: e.target.value as PaymentMethod }))} options={PAYMENT_METHODS.map((m) => ({ value: m, label: lbl(PAYMENT_METHOD, m, lang) }))} />
        </Field>
        <Field label={t('تاريخ السداد', 'Paid on')}><Input type="date" dir="ltr" value={f.paidAt} min={invoice.issueDate} max={today} onChange={(e) => setF((s) => ({ ...s, paidAt: e.target.value }))} /></Field>
        <Field label={t('مرجع العملية', 'Reference')} hint={t('رقم الحوالة أو الإيصال (اختياري)', 'Transfer or receipt number (optional)')} className="sm:col-span-2">
          <Input dir="ltr" value={f.paymentRef} maxLength={LIMITS.paymentRef} onChange={(e) => setF((s) => ({ ...s, paymentRef: e.target.value }))} />
        </Field>
      </div>
      <div className="mt-4 rounded-xl border border-line p-3">
        <Toggle checked={f.extendSubscription} onChange={(v) => setF((s) => ({ ...s, extendSubscription: v }))} label={t('تمديد الاشتراك حتى نهاية فترة الفاتورة', 'Extend the subscription to the end of the invoice period')} />
        <p className="mt-1.5 ps-[52px] text-xs text-ink-soft">{t(`ينتهي الاشتراك في ${date(invoice.periodEnd, lang)} على الأقل، وتتحوّل المنشأة التجريبية أو المنتهية إلى «نشط» إذا لم تنتهِ فترة الفاتورة بعد.`, `Subscription runs at least to ${date(invoice.periodEnd, lang)}; a trial or expired company becomes Active if the invoice period has not ended yet.`)}</p>
      </div>
    </Modal>
  );
}

// ---------------- credit note ----------------
/** v2.1: an issued document is never voided — a credit note («إشعار دائن», SHC- series) reverses it. */
export function CreditNoteModal({ invoice, onClose, onDone }: { invoice: Invoice | null; onClose: () => void; onDone: (creditNote: Invoice) => void }) {
  const { t, lang } = useLang();
  const toast = useToast();
  const once = useOnce();
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (invoice) { setReason(''); setTouched(false); } }, [invoice]);
  if (!invoice) return null;
  const submit = () => once(async () => {
    setTouched(true);
    if (!reason.trim()) return;
    setBusy(true);
    try {
      const r = await api.post<Invoice>(`/admin/invoices/${invoice.id}/credit`, { reason: reason.trim() });
      toast(t(`تم إصدار الإشعار الدائن ${r.number}`, `Credit note ${r.number} issued`)); refreshAdminCounts(); onDone(r); onClose();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  });
  return (
    <Modal open onClose={onClose} size="sm" title={t('إصدار إشعار دائن', 'Issue credit note')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('تراجع', 'Back')}</Button><Button variant="danger" onClick={submit} loading={busy}><FileMinus2 className="h-4 w-4" />{t('إصدار الإشعار الدائن', 'Issue credit note')}</Button></>}>
      <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-sand/60 px-4 py-3">
        <div className="min-w-0"><p className="num text-sm font-semibold text-ink" dir="ltr">{invoice.number}</p><p className="truncate text-xs text-ink-muted">{invoice.companyName} · {invoicePeriod(invoice, lang)}</p></div>
        <p className="num shrink-0 text-lg font-bold text-ink">{money(invoice.total)}</p>
      </div>
      <p className="mb-4 text-sm text-ink-muted">{t(
        'يصدر إشعار دائن بكامل قيمة الفاتورة، وتبقى الفاتورة الأصلية محفوظة بحالة «صدر لها إشعار دائن». لا يتغير الاشتراك ولا يُرسل بريد للعميل، ويمكن بعدها إصدار فاتورة جديدة للفترة نفسها.',
        'A credit note for the full amount is issued and the original stays on file as Credited. The subscription is unchanged and no email is sent; the same period can then be invoiced again.')}</p>
      <Field label={t('سبب الإشعار الدائن', 'Reason')} required error={touched && !reason.trim() ? t('السبب مطلوب', 'Reason is required') : undefined} hint={`${reason.length} / ${LIMITS.reason}`}>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={LIMITS.reason} autoFocus />
      </Field>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {[t('خطأ في بيانات الفاتورة', 'Wrong invoice details'), t('تكرار', 'Duplicate'), t('تغيير الباقة', 'Plan changed')].map((q) => (
          <button key={q} type="button" onClick={() => setReason(q)} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-muted hover:border-primary-500 hover:text-primary">{q}</button>
        ))}
      </div>
    </Modal>
  );
}

// ---------------- manual reminder ----------------
export function RemindModal({ company, open, onClose, onDone }: { company: Pick<AdminCompany, 'id' | 'nameAr' | 'nameEn' | 'ownerEmail' | 'ownerName'>; open: boolean; onClose: () => void; onDone: (e: EmailLog) => void }) {
  const { t, lang } = useLang();
  const toast = useToast();
  const once = useOnce();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setMessage(''); }, [open]);
  const submit = () => once(async () => {
    setBusy(true);
    try {
      const r = await api.post<EmailLog>(`/admin/companies/${company.id}/remind`, message.trim() ? { message: message.trim() } : {});
      toast(t('تم إرسال التذكير', 'Reminder sent')); onDone(r); onClose();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  });
  return (
    <Modal open={open} onClose={onClose} title={t('إرسال تذكير', 'Send reminder')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button onClick={submit} loading={busy} disabled={!company.ownerEmail}><Send className="h-4 w-4 rtl:-scale-x-100" />{t('إرسال', 'Send')}</Button></>}>
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-line bg-sand/60 px-4 py-3 text-sm">
        <Mail className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{company.ownerName || companyName(company, lang)}</p>
          <p className="truncate text-xs text-ink-soft" dir="ltr">{company.ownerEmail || t('لا يوجد مالك', 'No owner')}</p>
        </div>
      </div>
      <Field label={t('رسالة إضافية (اختياري)', 'Personal message (optional)')} hint={t('تتضمن الرسالة تلقائياً الباقة والحالة والأيام المتبقية وبيانات التواصل.', 'Plan, status, days left and contact details are included automatically.')}>
        <Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={LIMITS.message} placeholder={t('مثال: نود تذكيركم بتجديد الاشتراك قبل نهاية الشهر…', 'e.g. A friendly reminder to renew before month end…')} autoFocus />
      </Field>
    </Modal>
  );
}
