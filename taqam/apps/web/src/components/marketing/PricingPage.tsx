'use client';
import clsx from 'clsx';
import { useState } from 'react';
import { Calculator, Users } from 'lucide-react';
import { ButtonLink } from '@/components/ui';
import { ANNUAL_DISCOUNT, COMPARISON, PRICING_FAQ, TIERS, type T2 } from './data';
import { Container, No, PageHero, SectionHeading, Yes, useT2 } from './primitives';
import { Faq } from './Faq';
import { CtaBand } from './CtaBand';

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });

export function PricingPage() {
  const { t, tt } = useT2();
  const [annual, setAnnual] = useState(true);
  const [headcount, setHeadcount] = useState(50);
  const unit = (p: number) => Math.round(p * (annual ? 1 - ANNUAL_DISCOUNT : 1) * 100) / 100;
  const billable = Math.max(10, headcount || 0);

  return (
    <>
      <PageHero eyebrow={t('الأسعار', 'Pricing')}
        title={t('ادفع مقابل فريقك فقط', 'Pay only for your team')}
        subtitle={t('سعر شفاف لكل موظف نشط شهرياً. كل الباقات تشمل الرواتب وحماية الأجور وتطبيق الخدمة الذاتية، وتجربة مجانية 14 يوماً.',
          'Transparent price per active employee per month. Every plan includes payroll, WPS and the self-service app, plus a 14-day free trial.')} />

      <section className="relative -mt-8 pb-16">
        <Container>
          {/* billing toggle */}
          <div className="flex justify-center">
            <div role="radiogroup" aria-label={t('دورة الفوترة', 'Billing cycle')} className="relative inline-flex rounded-full border border-line bg-white p-1 shadow-soft">
              {[
                { v: false, l: t('شهري', 'Monthly') },
                { v: true, l: t('سنوي', 'Annual') },
              ].map((o) => (
                <button key={String(o.v)} type="button" role="radio" aria-checked={annual === o.v} onClick={() => setAnnual(o.v)}
                  className={clsx('relative rounded-full px-5 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    annual === o.v ? 'bg-primary text-white' : 'text-ink-muted hover:text-primary')}>
                  {o.l}
                  {o.v && <span dir="ltr" className={clsx('ms-2 rounded-full px-2 py-0.5 text-[11px]', annual ? 'bg-accent text-night' : 'bg-accent-100 text-accent-600')}>−15%</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {TIERS.map((tier) => (
              <div key={tier.id} className={clsx('relative flex flex-col rounded-2xl border p-6 sm:p-8',
                tier.highlight ? 'border-night bg-night text-white shadow-lift lg:-my-3 lg:py-11' : 'border-line bg-white shadow-soft')}>
                {tier.highlight && (
                  <span className="absolute -top-3 rounded-full bg-accent px-3 py-1 text-xs font-bold text-night ltr:right-6 rtl:left-6">{t('الأكثر اختياراً', 'Most popular')}</span>
                )}
                <h2 className={clsx('text-xl font-bold', tier.highlight ? 'text-white' : 'text-ink')}>{tt(tier.name)}</h2>
                <p className={clsx('mt-1 text-sm', tier.highlight ? 'text-white/70' : 'text-ink-muted')}>{tt(tier.desc)}</p>
                <div className="mt-6 min-h-[84px]">
                  {tier.price != null ? (
                    <>
                      <p className="flex items-baseline gap-2">
                        <span className="num text-5xl font-bold tracking-tight">{fmt(unit(tier.price))}</span>
                        <span className={clsx('text-sm', tier.highlight ? 'text-white/70' : 'text-ink-muted')}>{t('ر.س', 'SAR')}</span>
                        {annual && <span className={clsx('num text-sm line-through', tier.highlight ? 'text-white/45' : 'text-ink-soft')}>{tier.price}</span>}
                      </p>
                      <p className={clsx('mt-1 text-xs', tier.highlight ? 'text-white/65' : 'text-ink-soft')}>
                        {t('لكل موظف شهرياً', 'per employee / month')}{annual ? t('، تُدفع سنوياً', ', billed annually') : ''}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-4xl font-bold">{t('تواصل معنا', 'Let’s talk')}</p>
                      <p className={clsx('mt-1 text-xs', tier.highlight ? 'text-white/65' : 'text-ink-soft')}>{t('تسعير مخصص للمجموعات الكبيرة', 'Custom pricing for large groups')}</p>
                    </>
                  )}
                </div>
                <ButtonLink href={tier.cta.href} variant={tier.highlight ? 'accent' : tier.id === 'enterprise' ? 'primary' : 'secondary'} size="lg" className="mt-6 w-full">
                  {tt(tier.cta.label)}
                </ButtonLink>
                <ul className="mt-8 space-y-3 text-sm">
                  {tier.features.map((f) => (
                    <li key={f[1]} className="flex items-start gap-2.5"><Yes className={clsx('shrink-0', tier.highlight && 'bg-white/15 text-accent')} />{tt(f)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-ink-soft">
            {t('الأسعار بالريال السعودي ولا تشمل ضريبة القيمة المضافة. الحد الأدنى للفوترة 10 موظفين.', 'Prices in SAR, excluding VAT. Minimum billing is 10 employees.')}
          </p>
        </Container>
      </section>

      {/* estimator */}
      <section className="pb-16">
        <Container>
          <div className="grid gap-6 rounded-2xl border border-line bg-white p-6 shadow-soft sm:p-8 lg:grid-cols-[1fr_1.4fr] lg:items-center">
            <div>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-100 text-accent-600"><Calculator className="h-5 w-5" aria-hidden /></span>
              <h2 className="mt-4 text-xl font-bold text-ink">{t('قدّر تكلفتك الشهرية', 'Estimate your monthly cost')}</h2>
              <label htmlFor="headcount" className="mt-4 flex items-center gap-2 text-sm font-medium text-ink-muted">
                <Users className="h-4 w-4" aria-hidden />{t('عدد الموظفين', 'Number of employees')}
                <span className="num ms-auto rounded-lg bg-sand px-2.5 py-0.5 text-base font-bold text-primary">{headcount}</span>
              </label>
              <input id="headcount" type="range" min={10} max={1000} step={10} value={headcount}
                onChange={(e) => setHeadcount(Number(e.target.value))}
                className="mt-3 w-full accent-[#172C46]" />
              <div className="num mt-1 flex justify-between text-xs text-ink-soft"><span>10</span><span>1000</span></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {TIERS.filter((x) => x.price != null).map((tier) => (
                <div key={tier.id} className={clsx('rounded-xl p-5', tier.highlight ? 'bg-night text-white' : 'bg-sand')}>
                  <p className={clsx('text-sm', tier.highlight ? 'text-white/75' : 'text-ink-muted')}>{tt(tier.name)}</p>
                  <p className="num mt-1 text-2xl font-bold">{fmt(Math.round(unit(tier.price!) * billable * 100) / 100)} <span className="text-sm font-medium opacity-70">{t('ر.س / شهر', 'SAR / mo')}</span></p>
                  {annual && <p className={clsx('num mt-1 text-xs', tier.highlight ? 'text-white/65' : 'text-ink-soft')}>{t('سنوياً', 'Yearly')}: {fmt(Math.round(unit(tier.price!) * billable * 12 * 100) / 100)} {t('ر.س', 'SAR')}</p>}
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* comparison */}
      <section className="bg-white py-16 sm:py-20">
        <Container>
          <SectionHeading center eyebrow={t('مقارنة الباقات', 'Compare plans')} title={t('كل التفاصيل في مكان واحد', 'Every detail in one place')} />
          <div className="relative mt-10 overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">{t('مقارنة مزايا الباقات', 'Plan feature comparison')}</caption>
              <thead>
                <tr className="bg-sand">
                  <th scope="col" className="px-5 py-4 text-start font-semibold text-ink">{t('الميزة', 'Feature')}</th>
                  {TIERS.map((tier) => (
                    <th key={tier.id} scope="col" className={clsx('px-4 py-4 text-center font-semibold', tier.highlight ? 'text-primary' : 'text-ink')}>
                      {tt(tier.name)}
                    </th>
                  ))}
                </tr>
              </thead>
              {COMPARISON.map((g) => (
                <tbody key={g.group[1]}>
                  <tr className="border-t border-line bg-primary-50/60">
                    <th scope="colgroup" colSpan={4} className="px-5 py-2.5 text-start text-xs font-bold uppercase tracking-wide text-primary-500">{tt(g.group)}</th>
                  </tr>
                  {g.rows.map((r) => (
                    <tr key={r.label[1]} className="border-t border-line/70 transition-colors hover:bg-sand/40">
                      <th scope="row" className="px-5 py-3.5 text-start font-normal text-ink">{tt(r.label)}</th>
                      {r.values.map((v, i) => (
                        <td key={i} className={clsx('px-4 py-3.5 text-center', i === 1 && 'bg-primary-50/30')}>
                          {v === true ? <><Yes /><span className="sr-only">{t('متاح', 'Included')}</span></>
                            : v === false ? <><No /><span className="sr-only">{t('غير متاح', 'Not included')}</span></>
                            : <span className="text-ink-muted">{tt(v as T2)}</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container>
          <div className="mx-auto max-w-3xl">
            <SectionHeading center eyebrow={t('أسئلة الفوترة', 'Billing FAQ')} title={t('أسئلة عن الأسعار', 'Pricing questions')} />
            <Faq items={PRICING_FAQ} className="mt-10" />
          </div>
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
