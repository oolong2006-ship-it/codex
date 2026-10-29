'use client';
import clsx from 'clsx';
import { Badge, Logo } from '@/components/ui';
import { useLang } from '@/lib/i18n';
import { date, money, num } from '@/lib/format';
import { BILLING_CYCLE, INVOICE_STATUS, INVOICE_TONE, PAYMENT_METHOD, PLAN, lbl, type Invoice, type InvoiceDetail } from '@/lib/adminTypes';

/** ISSUED / PAID / VOID chip; an overdue ISSUED invoice reads «متأخرة» in red. */
export function InvoiceStatusChip({ inv, className }: { inv: Pick<Invoice, 'status' | 'overdue'>; className?: string }) {
  const { t, lang } = useLang();
  if (inv.status === 'ISSUED' && inv.overdue) return <Badge tone="danger" className={className}><span className="h-1.5 w-1.5 rounded-full bg-danger" />{t('متأخرة', 'Overdue')}</Badge>;
  return <Badge tone={INVOICE_TONE[inv.status] ?? 'neutral'} className={className}>{lbl(INVOICE_STATUS, inv.status, lang)}</Badge>;
}

/** "1 أكتوبر – 31 أكتوبر 2026" style period. */
export function invoicePeriod(inv: Pick<Invoice, 'periodStart' | 'periodEnd'>, lang: 'ar' | 'en') {
  return `${date(inv.periodStart, lang)} – ${date(inv.periodEnd, lang)}`;
}

/** Arabic label with a small English line underneath (KSA tax invoices are bilingual). */
function Bi({ ar, en, className }: { ar: string; en: string; className?: string }) {
  return (
    <span className={clsx('block leading-tight', className)}>
      <span className="block">{ar}</span>
      <span className="block text-[10px] font-normal uppercase tracking-wide text-ink-soft">{en}</span>
    </span>
  );
}

function Party({ title, name, nameEn, rows }: { title: [string, string]; name: string; nameEn?: string | null; rows: [string, string, string | null | undefined][] }) {
  return (
    <section className="rounded-xl border border-line p-4 print:break-inside-avoid">
      <Bi ar={title[0]} en={title[1]} className="mb-2 text-xs font-semibold text-primary" />
      <p className="text-[15px] font-bold text-ink">{name}</p>
      {nameEn && nameEn !== name && <p className="text-xs text-ink-muted" dir="ltr">{nameEn}</p>}
      <dl className="mt-2 space-y-1 text-xs">
        {rows.map(([ar, en, value]) => (
          <div key={en} className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-ink-soft">{ar} <span className="text-[10px]" dir="ltr">· {en}</span></dt>
            <dd className="num min-w-0 truncate text-end font-medium text-ink" dir="auto">{value || '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const STAMP: Record<string, { ar: string; en: string; cls: string }> = {
  PAID: { ar: 'مدفوعة', en: 'PAID', cls: 'border-success text-success' },
  VOID: { ar: 'ملغاة', en: 'VOID', cls: 'border-danger text-danger' },
  OVERDUE: { ar: 'متأخرة', en: 'OVERDUE', cls: 'border-danger/70 text-danger/80' },
};

/** Printable A4 tax invoice («فاتورة ضريبية») shared by the platform portal and the company owner. */
export function InvoiceDocument({ inv }: { inv: InvoiceDetail }) {
  const { lang } = useLang();
  const s = inv.seller;
  const c = inv.company;
  const stamp = inv.status === 'PAID' ? STAMP.PAID : inv.status === 'VOID' ? STAMP.VOID : inv.overdue ? STAMP.OVERDUE : null;
  const vatPct = Math.round((inv.vatRate ?? 0) * 1000) / 10;
  const discPct = Math.round((inv.discountRate ?? 0) * 1000) / 10;
  const planAr = lbl(PLAN, inv.plan, 'ar'); const planEn = lbl(PLAN, inv.plan, 'en');
  return (
    <article id="invoice-document" className="relative mx-auto w-full max-w-[820px] overflow-hidden rounded-2xl border border-line bg-white text-ink shadow-soft print:max-w-none print:rounded-none print:border-0 print:shadow-none">
      <style>{'@media print { html, body { background: #fff !important; } @page { size: A4; margin: 12mm; } #invoice-document { font-size: 12px; } }'}</style>
      <div className="h-1.5 bg-gradient-to-l from-primary via-primary-500 to-accent print:h-1" aria-hidden />
      <div className="p-5 sm:p-8 print:p-0 print:pt-4">

        {/* Header */}
        <header className="flex flex-col gap-5 border-b border-line pb-5 sm:flex-row sm:items-start sm:justify-between print:flex-row print:items-start print:justify-between">
          <div className="min-w-0">
            <Logo showLatin />
            <p className="mt-3 text-sm font-semibold text-ink">{s.sellerName}</p>
            <p className="text-xs text-ink-muted" dir="ltr">{s.sellerNameEn}</p>
          </div>
          {stamp && (
            <div aria-hidden className={clsx('pointer-events-none -rotate-12 self-start rounded-xl border-[3px] px-4 py-1 text-center opacity-80 sm:mt-6 sm:self-center print:mt-6 print:self-center', stamp.cls)}>
              <p className="text-2xl font-black leading-none">{stamp.ar}</p>
              <p className="mt-0.5 text-[10px] font-bold tracking-[0.3em]">{stamp.en}</p>
            </div>
          )}
          <div className="sm:text-end print:text-end">
            <h1 className="text-2xl font-extrabold text-night">فاتورة ضريبية</h1>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft" dir="ltr">Tax Invoice</p>
            <dl className="mt-3 grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-xs sm:justify-end print:justify-end">
              <dt className="text-ink-soft">رقم الفاتورة · No.</dt><dd className="num font-bold text-ink" dir="ltr">{inv.number}</dd>
              <dt className="text-ink-soft">تاريخ الإصدار · Issued</dt><dd className="num font-medium">{date(inv.issueDate, lang)}</dd>
              <dt className="text-ink-soft">تاريخ الاستحقاق · Due</dt><dd className={clsx('num font-medium', inv.overdue && 'text-danger')}>{date(inv.dueDate, lang)}</dd>
            </dl>
          </div>
        </header>

        {/* Parties */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 print:grid-cols-2">
          <Party title={['البائع', 'Seller']} name={s.sellerName} nameEn={s.sellerNameEn} rows={[
            ['الرقم الضريبي', 'VAT No.', s.sellerVatNumber], ['السجل التجاري', 'CR No.', s.sellerCrNumber],
            ['العنوان', 'Address', s.sellerAddress], ['البريد', 'Email', s.sellerEmail], ['الهاتف', 'Phone', s.sellerPhone],
          ]} />
          <Party title={['المشتري', 'Buyer']} name={c.nameAr || inv.companyName} nameEn={c.nameEn} rows={[
            ['الرقم الضريبي', 'VAT No.', c.vatNumber], ['السجل التجاري', 'CR No.', c.crNumber], ['المدينة', 'City', c.city],
            ['المسؤول', 'Contact', c.ownerName], ['البريد', 'Email', c.ownerEmail],
          ]} />
        </div>

        {/* Lines */}
        <div className="mt-5 overflow-x-auto rounded-xl border border-line print:overflow-visible">
          <table className="w-full min-w-[560px] text-sm print:min-w-0">
            <thead className="bg-sand text-xs text-ink-muted">
              <tr>
                <th className="px-3 py-2 text-start font-semibold"><Bi ar="الوصف" en="Description" /></th>
                <th className="px-3 py-2 text-center font-semibold"><Bi ar="الموظفون" en="Employees" /></th>
                <th className="px-3 py-2 text-center font-semibold"><Bi ar="سعر الموظف" en="Unit price" /></th>
                <th className="px-3 py-2 text-center font-semibold"><Bi ar="الأشهر" en="Months" /></th>
                <th className="px-3 py-2 text-end font-semibold"><Bi ar="المبلغ" en="Amount" /></th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-line align-top">
                <td className="px-3 py-3">
                  <p className="font-semibold text-ink">اشتراك منصة شؤون — باقة {planAr} ({lbl(BILLING_CYCLE, inv.billingCycle, 'ar')})</p>
                  <p className="text-xs text-ink-muted" dir="ltr">Shuoon subscription — {planEn} plan ({lbl(BILLING_CYCLE, inv.billingCycle, 'en')})</p>
                  <p className="mt-1 text-xs text-ink-soft">{invoicePeriod(inv, lang)}</p>
                </td>
                <td className="num px-3 py-3 text-center">{num(inv.employees)}</td>
                <td className="num px-3 py-3 text-center">{money(inv.unitPrice)}</td>
                <td className="num px-3 py-3 text-center">{num(inv.months)}</td>
                <td className="num px-3 py-3 text-end font-semibold">{money(inv.subtotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Totals + payment */}
        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_minmax(0,300px)] print:grid-cols-[1fr_280px]">
          <div className="space-y-3 text-xs">
            {inv.status === 'PAID' ? (
              <section className="rounded-xl border border-success/30 bg-success-50 p-4 print:break-inside-avoid">
                <Bi ar="تم السداد" en="Payment received" className="text-sm font-semibold text-success" />
                <p className="mt-2 text-ink-muted">
                  {date(inv.paidAt, lang)}{inv.paymentMethod ? ` · ${lbl(PAYMENT_METHOD, inv.paymentMethod, 'ar')}` : ''}{inv.paymentRef ? ` · ` : ''}
                  {inv.paymentRef && <span className="num" dir="ltr">{inv.paymentRef}</span>}
                </p>
              </section>
            ) : inv.status === 'VOID' ? (
              <section className="rounded-xl border border-danger/30 bg-danger-50 p-4 print:break-inside-avoid">
                <Bi ar="فاتورة ملغاة" en="Voided invoice" className="text-sm font-semibold text-danger" />
                {inv.voidReason && <p className="mt-2 text-ink-muted">{inv.voidReason}</p>}
              </section>
            ) : (
              <section className="rounded-xl border border-line bg-sand/60 p-4 print:break-inside-avoid">
                <Bi ar="طريقة السداد" en="How to pay" className="text-sm font-semibold text-ink" />
                {s.iban ? (
                  <dl className="mt-2 space-y-1">
                    <div className="flex justify-between gap-3"><dt className="text-ink-soft">المستفيد · Beneficiary</dt><dd className="font-medium">{s.sellerName}</dd></div>
                    {s.bankName && <div className="flex justify-between gap-3"><dt className="text-ink-soft">البنك · Bank</dt><dd className="font-medium">{s.bankName}</dd></div>}
                    <div className="flex justify-between gap-3"><dt className="text-ink-soft">الآيبان · IBAN</dt><dd className="num font-semibold tracking-wide" dir="ltr">{s.iban}</dd></div>
                  </dl>
                ) : <p className="mt-2 text-ink-muted">تواصل معنا لإتمام السداد: <span dir="ltr">{s.sellerEmail}</span></p>}
                <p className="mt-2 text-ink-soft">يرجى ذكر رقم الفاتورة <span className="num font-semibold text-ink" dir="ltr">{inv.number}</span> في وصف التحويل.</p>
              </section>
            )}
            {inv.notes && (
              <section className="rounded-xl border border-line p-4 print:break-inside-avoid">
                <Bi ar="ملاحظات" en="Notes" className="text-sm font-semibold text-ink" />
                <p className="mt-1.5 whitespace-pre-line text-ink-muted">{inv.notes}</p>
              </section>
            )}
          </div>
          <dl className="h-fit overflow-hidden rounded-xl border border-line text-sm print:break-inside-avoid">
            <Row ar="المجموع الفرعي" en="Subtotal" value={money(inv.subtotal)} />
            {inv.discount > 0 && <Row ar={`الخصم السنوي (${discPct}%)`} en="Annual discount" value={`− ${money(inv.discount)}`} />}
            <Row ar="الإجمالي الخاضع للضريبة" en="Taxable amount" value={money(inv.taxable)} />
            <Row ar={`ضريبة القيمة المضافة (${vatPct}%)`} en={`VAT ${vatPct}%`} value={money(inv.vat)} />
            <div className="flex items-center justify-between gap-3 bg-night px-4 py-3 text-white print:bg-night print:[-webkit-print-color-adjust:exact] print:[print-color-adjust:exact]">
              <dt><Bi ar="الإجمالي المستحق" en="Total due (SAR)" className="font-semibold [&>span:last-child]:text-white/60" /></dt>
              <dd className="num text-lg font-extrabold">{money(inv.total)}</dd>
            </div>
          </dl>
        </div>

        <footer className="mt-8 flex flex-col gap-1 border-t border-line pt-4 text-center text-[11px] text-ink-soft">
          <p>فاتورة صادرة إلكترونياً من منصة شؤون ولا تحتاج إلى توقيع · This invoice was issued electronically by Shuoon.</p>
          <p dir="ltr">{[s.sellerEmail, s.sellerPhone, 'www.shuoon.net'].filter(Boolean).join('  ·  ')}</p>
        </footer>
      </div>
    </article>
  );
}

function Row({ ar, en, value }: { ar: string; en: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
      <dt className="text-ink-muted"><Bi ar={ar} en={en} /></dt>
      <dd className="num font-medium text-ink">{value}</dd>
    </div>
  );
}
