'use client';
import clsx from 'clsx';
import { Badge, Logo } from '@/components/ui';
import { useLang } from '@/lib/i18n';
import { date, dateTime, money, num } from '@/lib/format';
import { UNREGISTERED_NOTE } from '@/lib/billing';
import { BILLING_CYCLE, INVOICE_STATUS, INVOICE_TONE, PAYMENT_METHOD, PLAN, lbl, type Invoice, type InvoiceDetail } from '@/lib/adminTypes';
import { ZatcaQr } from './ZatcaQr';

/** ISSUED / PAID / CREDITED chip; an overdue ISSUED invoice reads «متأخرة» in red; credit notes read «إشعار دائن». */
export function InvoiceStatusChip({ inv, className }: { inv: Pick<Invoice, 'status' | 'overdue'> & Partial<Pick<Invoice, 'documentType'>>; className?: string }) {
  const { t, lang } = useLang();
  if (inv.documentType === 'CREDIT_NOTE') return <Badge tone="info" className={className}>{t('إشعار دائن', 'Credit note')}</Badge>;
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
      <span className="block text-[10px] font-normal uppercase tracking-wide text-ink-soft" dir="ltr" lang="en">{en}</span>
    </span>
  );
}

function Party({ title, name, nameEn, rows }: { title: [string, string]; name: string; nameEn?: string | null; rows: [string, string, string | null | undefined, boolean?][] }) {
  return (
    <section className="rounded-xl border border-line p-4 print:break-inside-avoid">
      <Bi ar={title[0]} en={title[1]} className="mb-2 text-xs font-semibold text-primary" />
      <p className="text-[15px] font-bold text-ink">{name}</p>
      {nameEn && nameEn !== name && <p className="text-xs text-ink-muted" dir="ltr">{nameEn}</p>}
      <dl className="mt-2 space-y-1 text-xs">
        {rows.map(([ar, en, value, ltr]) => (
          <div key={en} className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-ink-soft">{ar} <span className="text-[10px]" dir="ltr" lang="en">· {en}</span></dt>
            <dd className="num min-w-0 break-words text-end font-medium text-ink" dir={ltr ? 'ltr' : 'auto'}>{value || '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Meta({ ar, en, children, className }: { ar: string; en: string; children: React.ReactNode; className?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 sm:justify-end print:justify-end">
      <dt className="text-ink-soft">{ar} <span className="text-[10px]" dir="ltr" lang="en">· {en}</span></dt>
      <dd className={clsx('num whitespace-nowrap font-medium text-ink', className)}>{children}</dd>
    </div>
  );
}

const TITLE = {
  TAX_INVOICE: { ar: 'فاتورة ضريبية', en: 'Tax Invoice' },
  INVOICE: { ar: 'فاتورة', en: 'Invoice' },
  CREDIT_NOTE: { ar: 'إشعار دائن', en: 'Credit Note' },
} as const;

/**
 * Printable A4 document shared by the platform portal and the company owner: tax invoice («فاتورة ضريبية»), plain
 * invoice when the seller was not VAT registered at issue («فاتورة»), or credit note («إشعار دائن»). Renders only from
 * the seller/buyer snapshots stored on the invoice (docs/ADMIN_PORTAL.md v2.1) — later settings edits never change it.
 */
export function InvoiceDocument({ inv }: { inv: InvoiceDetail }) {
  const { lang } = useLang();
  const s = inv.seller;
  const b = inv.buyer;
  const isCn = inv.documentType === 'CREDIT_NOTE';
  const isTax = inv.documentType === 'TAX_INVOICE' || (isCn && !!inv.qr);
  const title = TITLE[inv.documentType] ?? TITLE.TAX_INVOICE;
  const stamp = isCn ? null
    : inv.status === 'PAID' ? { ar: 'مدفوعة', en: 'PAID', cls: 'border-success text-success' }
    : inv.status === 'CREDITED' ? { ar: 'صدر بحقها إشعار دائن', en: inv.creditedByNumber ? `CREDITED · ${inv.creditedByNumber}` : 'CREDITED', cls: 'border-ink-soft text-ink-muted' }
    : inv.overdue ? { ar: 'متأخرة', en: 'OVERDUE', cls: 'border-danger/70 text-danger/80' } : null;
  const vatPct = Math.round((inv.vatRate ?? 0) * 1000) / 10;
  const discPct = Math.round((inv.discountRate ?? 0) * 1000) / 10;
  const planAr = lbl(PLAN, inv.plan, 'ar'); const planEn = lbl(PLAN, inv.plan, 'en');
  const desc = {
    ar: `اشتراك منصة شؤون — باقة ${planAr} (${lbl(BILLING_CYCLE, inv.billingCycle, 'ar')})`,
    en: `Shuoon subscription — ${planEn} plan (${lbl(BILLING_CYCLE, inv.billingCycle, 'en')})`,
  };
  const qty = `${num(inv.employees)} × ${num(inv.months)}`;
  const line: [string, string, string][] = [
    ['الكمية (موظف × شهر)', 'Qty (employees × months)', qty],
    ['سعر الوحدة غير شامل الضريبة', 'Unit price excl. VAT', money(inv.unitPrice)],
    ...(inv.discount > 0 ? [[`الخصم (${discPct}%)`, 'Discount', `− ${money(inv.discount)}`] as [string, string, string]] : []),
    ['المبلغ غير شامل الضريبة', 'Amount excl. VAT', money(inv.taxable)],
    ['نسبة الضريبة', 'VAT rate', `${vatPct}%`],
    ['مبلغ الضريبة', 'VAT amount', money(inv.vat)],
    ['الإجمالي شامل الضريبة', 'Total incl. VAT', money(inv.total)],
  ];
  return (
    <article id="invoice-document" data-document-type={inv.documentType} className="relative mx-auto w-full max-w-[820px] overflow-hidden rounded-2xl border border-line bg-white text-ink shadow-soft print:max-w-none print:rounded-none print:border-0 print:shadow-none">
      <style>{'@media print { html, body { background: #fff !important; } @page { size: A4; margin: 12mm; } #invoice-document { font-size: 11px; } }'}</style>
      <div className={clsx('h-1.5 bg-gradient-to-l print:h-1', isCn ? 'from-night via-primary-500 to-night' : 'from-primary via-primary-500 to-accent')} aria-hidden />
      <div className="p-5 sm:p-8 print:p-0 print:pt-4">

        {/* Header */}
        <header className="flex flex-col gap-5 border-b border-line pb-5 sm:flex-row sm:items-start sm:justify-between print:flex-row print:items-start print:justify-between">
          <div className="min-w-0">
            <Logo showLatin />
            <p className="mt-3 text-sm font-semibold text-ink">{s.name}</p>
            {s.nameEn && <p className="text-xs text-ink-muted" dir="ltr">{s.nameEn}</p>}
          </div>
          {stamp && (
            <div aria-hidden className={clsx('pointer-events-none -rotate-12 self-start rounded-xl border-[3px] px-4 py-1 text-center opacity-80 sm:mt-6 sm:self-center print:mt-6 print:self-center', stamp.cls)}>
              <p className={clsx('font-black leading-none', stamp.ar.length > 10 ? 'text-base' : 'text-2xl')}>{stamp.ar}</p>
              <p className="num mt-0.5 text-[10px] font-bold tracking-[0.2em]" dir="ltr">{stamp.en}</p>
            </div>
          )}
          <div className="sm:text-end print:text-end">
            <h1 className="text-2xl font-extrabold text-night">{title.ar}</h1>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft" dir="ltr">{title.en}</p>
            <dl className="mt-3 space-y-1 text-xs">
              <Meta ar={isCn ? 'رقم الإشعار' : 'رقم الفاتورة'} en={isCn ? 'Credit note No.' : 'Invoice No.'} className="font-bold"><span dir="ltr">{inv.number}</span></Meta>
              <Meta ar="تاريخ ووقت الإصدار" en="Issued at">{dateTime(inv.issuedAt ?? inv.issueDate, lang)}</Meta>
              {isCn
                ? <Meta ar="الفاتورة الأصلية" en="Original invoice" className="font-bold"><span dir="ltr">{inv.creditsNumber ?? '—'}</span></Meta>
                : <Meta ar="تاريخ الاستحقاق" en="Due date" className={inv.overdue ? 'text-danger' : undefined}>{date(inv.dueDate, lang)}</Meta>}
              <Meta ar="فترة التوريد" en="Supply period">{invoicePeriod(inv, lang)}</Meta>
            </dl>
          </div>
        </header>

        {inv.status === 'CREDITED' && inv.creditedByNumber && (
          <p className="mt-4 rounded-xl border border-line bg-sand/70 px-4 py-2.5 text-sm font-semibold text-ink print:break-inside-avoid" role="note">
            صدر بحقها إشعار دائن <span className="num" dir="ltr">{inv.creditedByNumber}</span>
            <span className="mt-0.5 block text-xs font-normal text-ink-soft" dir="ltr" lang="en">Credited by credit note {inv.creditedByNumber}</span>
          </p>
        )}
        {inv.documentType === 'INVOICE' && (
          <p className="mt-4 rounded-xl border border-warning/30 bg-warning-50 px-4 py-2.5 text-sm text-warning" role="note">
            {UNREGISTERED_NOTE[1]}<span className="mt-0.5 block text-xs" dir="ltr" lang="en">{UNREGISTERED_NOTE[0]}</span>
          </p>
        )}

        {/* Parties */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 print:grid-cols-2">
          <Party title={['البائع', 'Seller']} name={s.name} nameEn={s.nameEn} rows={[
            ['الرقم الضريبي', 'VAT No.', s.vatNumber, true], ['السجل التجاري', 'CR No.', s.crNumber, true],
            ['العنوان', 'Address', s.address], ['البريد', 'Email', s.email, true], ['الهاتف', 'Phone', s.phone, true],
          ]} />
          <Party title={['المشتري', 'Buyer']} name={b.nameAr || inv.companyName} nameEn={b.nameEn} rows={[
            ['الرقم الضريبي', 'VAT No.', b.vatNumber, true], ['السجل التجاري', 'CR No.', b.crNumber, true],
            ['العنوان', 'Address', b.address], ['المدينة', 'City', b.city],
          ]} />
        </div>

        {/* Lines — table on tablets/desktop/print, stacked on phones */}
        <div className="mt-5 hidden overflow-x-auto rounded-xl border border-line sm:block print:block print:overflow-visible">
          <table className="w-full text-sm print:text-[10px]">
            <thead className="bg-sand text-xs text-ink-muted">
              <tr>
                <th className="px-3 py-2 text-start font-semibold"><Bi ar="الوصف" en="Description" /></th>
                <th className="px-2 py-2 text-center font-semibold"><Bi ar="الكمية" en="Qty" /></th>
                <th className="px-2 py-2 text-center font-semibold"><Bi ar="سعر الوحدة غير شامل الضريبة" en="Unit price excl. VAT" /></th>
                {inv.discount > 0 && <th className="px-2 py-2 text-center font-semibold"><Bi ar="الخصم" en="Discount" /></th>}
                <th className="px-2 py-2 text-center font-semibold"><Bi ar="غير شامل الضريبة" en="Excl. VAT" /></th>
                <th className="px-2 py-2 text-center font-semibold"><Bi ar="نسبة الضريبة" en="VAT %" /></th>
                <th className="px-2 py-2 text-center font-semibold"><Bi ar="مبلغ الضريبة" en="VAT" /></th>
                <th className="px-3 py-2 text-end font-semibold"><Bi ar="الإجمالي شامل الضريبة" en="Total incl. VAT" /></th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-line align-top">
                <td className="px-3 py-3">
                  <p className="font-semibold text-ink">{desc.ar}</p>
                  <p className="text-xs text-ink-muted" dir="ltr">{desc.en}</p>
                </td>
                <td className="num whitespace-nowrap px-2 py-3 text-center" dir="ltr">{qty}</td>
                <td className="num whitespace-nowrap px-2 py-3 text-center">{money(inv.unitPrice)}</td>
                {inv.discount > 0 && <td className="num whitespace-nowrap px-2 py-3 text-center">− {money(inv.discount)}</td>}
                <td className="num whitespace-nowrap px-2 py-3 text-center">{money(inv.taxable)}</td>
                <td className="num whitespace-nowrap px-2 py-3 text-center">{vatPct}%</td>
                <td className="num whitespace-nowrap px-2 py-3 text-center">{money(inv.vat)}</td>
                <td className="num whitespace-nowrap px-3 py-3 text-end font-semibold">{money(inv.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <section className="mt-5 rounded-xl border border-line sm:hidden print:hidden" aria-label="Invoice line">
          <div className="border-b border-line bg-sand px-4 py-2.5">
            <p className="text-sm font-semibold text-ink">{desc.ar}</p>
            <p className="text-xs text-ink-muted" dir="ltr">{desc.en}</p>
          </div>
          <dl className="divide-y divide-line text-xs">
            {line.map(([ar, en, value]) => (
              <div key={en} className="flex items-center justify-between gap-3 px-4 py-2">
                <dt className="text-ink-soft"><Bi ar={ar} en={en} /></dt>
                <dd className="num whitespace-nowrap font-medium text-ink" dir={en.startsWith('Qty') ? 'ltr' : undefined}>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Totals + payment */}
        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_minmax(0,300px)] print:grid-cols-[1fr_280px]">
          <div className="space-y-3 text-xs">
            {isCn ? (
              <section className="rounded-xl border border-line bg-sand/60 p-4 print:break-inside-avoid">
                <Bi ar="سبب الإشعار الدائن" en="Reason" className="text-sm font-semibold text-ink" />
                <p className="mt-1.5 whitespace-pre-line text-ink-muted">{inv.reason || '—'}</p>
                <p className="mt-2 text-ink-soft">
                  يخص الفاتورة <span className="num font-semibold text-ink" dir="ltr">{inv.creditsNumber}</span> ويعكس قيمتها بالكامل.
                  <span className="mt-0.5 block" dir="ltr" lang="en">Fully reverses invoice {inv.creditsNumber}.</span>
                </p>
              </section>
            ) : inv.status === 'PAID' ? (
              <section className="rounded-xl border border-success/30 bg-success-50 p-4 print:break-inside-avoid">
                <Bi ar="تم السداد" en="Payment received" className="text-sm font-semibold text-success" />
                <p className="mt-2 text-ink-muted">
                  {date(inv.paidAt, lang)}{inv.paymentMethod ? ` · ${lbl(PAYMENT_METHOD, inv.paymentMethod, 'ar')}` : ''}{inv.paymentRef ? ' · ' : ''}
                  {inv.paymentRef && <span className="num" dir="ltr">{inv.paymentRef}</span>}
                </p>
              </section>
            ) : inv.status === 'ISSUED' ? (
              <section className="rounded-xl border border-line bg-sand/60 p-4 print:break-inside-avoid">
                <Bi ar="طريقة السداد" en="How to pay" className="text-sm font-semibold text-ink" />
                {s.iban ? (
                  <dl className="mt-2 space-y-1">
                    <div className="flex justify-between gap-3"><dt className="text-ink-soft">المستفيد <span dir="ltr">· Beneficiary</span></dt><dd className="font-medium">{s.name}</dd></div>
                    {s.bankName && <div className="flex justify-between gap-3"><dt className="text-ink-soft">البنك <span dir="ltr">· Bank</span></dt><dd className="font-medium">{s.bankName}</dd></div>}
                    <div className="flex justify-between gap-3"><dt className="text-ink-soft">الآيبان <span dir="ltr">· IBAN</span></dt><dd className="num whitespace-nowrap font-semibold tracking-wide" dir="ltr">{s.iban}</dd></div>
                  </dl>
                ) : <p className="mt-2 text-ink-muted">تواصل معنا لإتمام السداد: <span dir="ltr">{s.email}</span></p>}
                <p className="mt-2 text-ink-soft">يرجى ذكر رقم الفاتورة <span className="num font-semibold text-ink" dir="ltr">{inv.number}</span> في وصف التحويل.</p>
              </section>
            ) : null}
            {inv.notes && (
              <section className="rounded-xl border border-line p-4 print:break-inside-avoid">
                <Bi ar="ملاحظات" en="Notes" className="text-sm font-semibold text-ink" />
                <p className="mt-1.5 whitespace-pre-line text-ink-muted">{inv.notes}</p>
              </section>
            )}
            {inv.qr && isTax && (
              <section className="flex items-center gap-3 rounded-xl border border-line p-3 print:break-inside-avoid">
                <ZatcaQr value={inv.qr} size={104} label={isCn ? 'رمز QR للإشعار الدائن' : 'رمز QR للفاتورة الضريبية'} />
                <p className="text-ink-soft">
                  رمز QR يتضمن اسم البائع ورقمه الضريبي ووقت الإصدار والإجمالي والضريبة.
                  <span className="mt-0.5 block text-[10px]" dir="ltr" lang="en">QR: seller, VAT No., timestamp, total and VAT.</span>
                </p>
              </section>
            )}
          </div>
          <dl className="h-fit overflow-hidden rounded-xl border border-line text-sm print:break-inside-avoid">
            <Row ar="المجموع الفرعي" en="Subtotal" value={money(inv.subtotal)} />
            {inv.discount > 0 && <Row ar={`الخصم السنوي (${discPct}%)`} en="Annual discount" value={`− ${money(inv.discount)}`} />}
            <Row ar="الإجمالي غير شامل الضريبة" en="Total excl. VAT" value={money(inv.taxable)} />
            <Row ar={`ضريبة القيمة المضافة (${vatPct}%)`} en={`VAT ${vatPct}%`} value={money(inv.vat)} />
            <div className="flex items-center justify-between gap-3 bg-night px-4 py-3 text-white print:bg-night print:[-webkit-print-color-adjust:exact] print:[print-color-adjust:exact]">
              <dt>
                <Bi ar={isCn ? 'إجمالي الإشعار الدائن' : isTax ? 'الإجمالي شامل الضريبة' : 'الإجمالي المستحق'}
                  en={isCn ? 'Credit total (SAR)' : isTax ? 'Total incl. VAT (SAR)' : 'Total due (SAR)'} className="font-semibold [&>span:last-child]:text-white/60" />
              </dt>
              <dd className="num whitespace-nowrap text-lg font-extrabold">{money(inv.total)}</dd>
            </div>
          </dl>
        </div>

        <footer className="mt-8 flex flex-col gap-1 border-t border-line pt-4 text-center text-[11px] text-ink-soft">
          <p>صادرة من نظام شؤون<span className="mx-1.5" aria-hidden>·</span><span dir="ltr" lang="en">Issued by the Shuoon system</span></p>
          <p dir="ltr">{[s.email, s.phone, 'www.shuoon.net'].filter(Boolean).join('  ·  ')}</p>
        </footer>
      </div>
    </article>
  );
}

function Row({ ar, en, value }: { ar: string; en: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
      <dt className="text-ink-muted"><Bi ar={ar} en={en} /></dt>
      <dd className="num whitespace-nowrap font-medium text-ink">{value}</dd>
    </div>
  );
}
