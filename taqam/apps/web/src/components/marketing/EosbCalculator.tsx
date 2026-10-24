'use client';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { AlertCircle, CalendarRange, Info, Printer, RotateCcw, Scale, Wallet } from 'lucide-react';
import { calculateEndOfService, type EosbResult, type TerminationReason } from '@taqam/core';
import { Badge, Button, ButtonLink, Input, Select } from '@/components/ui';
import { TERMINATION_REASON } from '@/lib/labels';
import { money, todayISO } from '@/lib/format';
import { Container, PageHero, useT2 } from './primitives';

interface State {
  startDate: string; endDate: string;
  basic: string; housing: string; transport: string; other: string;
  reason: TerminationReason; unusedLeaveDays: string;
}
const initial = (): State => ({
  startDate: '2019-03-01', endDate: todayISO(),
  basic: '6000', housing: '1500', transport: '500', other: '0',
  reason: 'RESIGNATION', unusedLeaveDays: '10',
});
const n = (s: string) => { const v = Number(s); return Number.isFinite(v) && v > 0 ? v : 0; };

const FACTOR_LABEL: Record<string, [string, string]> = {
  '0': ['لا يستحق مكافأة', 'No award'],
  '0.333': ['ثلث المكافأة', 'One third'],
  '0.667': ['ثلثا المكافأة', 'Two thirds'],
  '1': ['المكافأة كاملة', 'Full award'],
};

export function EosbCalculator() {
  const { t, lang } = useT2();
  const [s, setS] = useState<State>(initial);
  const set = <K extends keyof State>(k: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setS((x) => ({ ...x, [k]: e.target.value as State[K] }));

  const validation = useMemo(() => {
    const errs: string[] = [];
    if (!s.startDate || !s.endDate) errs.push(t('أدخل تاريخي بداية ونهاية الخدمة', 'Enter service start and end dates'));
    else if (s.endDate <= s.startDate) errs.push(t('تاريخ نهاية الخدمة يجب أن يكون بعد تاريخ البداية', 'End date must be after start date'));
    if (n(s.basic) <= 0) errs.push(t('أدخل الراتب الأساسي', 'Enter the basic salary'));
    return errs;
  }, [s, t]);

  const result: EosbResult | null = useMemo(() => {
    if (validation.length) return null;
    try {
      return calculateEndOfService({
        startDate: s.startDate, endDate: s.endDate,
        wage: { basic: n(s.basic), housing: n(s.housing), transport: n(s.transport), other: n(s.other) },
        reason: s.reason,
        unusedLeaveDays: Math.floor(n(s.unusedLeaveDays)),
      });
    } catch {
      return null;
    }
  }, [s, validation.length]);

  const totalWage = n(s.basic) + n(s.housing) + n(s.transport) + n(s.other);
  const factorKey = result ? String(Math.round(result.factor * 1000) / 1000) : '1';
  const factorLabel = FACTOR_LABEL[factorKey] ?? [`${Math.round((result?.factor ?? 1) * 100)}%`, `${Math.round((result?.factor ?? 1) * 100)}%`];
  const notes = result ? (lang === 'ar' ? result.notesAr : englishNotes(result, s.reason)) : [];
  const reasonOptions = Object.entries(TERMINATION_REASON).map(([value, [ar, en]]) => ({ value, label: lang === 'ar' ? ar : en }));
  const sar = (v: number) => (lang === 'ar' ? money(v) : `SAR ${money(v, { currency: false })}`);

  return (
    <>
      <PageHero eyebrow={t('أداة مجانية', 'Free tool')}
        title={t('حاسبة مكافأة نهاية الخدمة', 'End-of-service benefit calculator')}
        subtitle={t('احسب مكافأة نهاية الخدمة وفق المادتين 84 و85 من نظام العمل السعودي، مع بدل رصيد الإجازات — فوراً ودون تسجيل.',
          'Calculate the end-of-service award under Articles 84 & 85 of the Saudi Labor Law, including leave encashment — instantly, no sign-up.')} />

      <section className="relative -mt-8 pb-16 print:mt-0">
        <Container className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-start">
          {/* inputs */}
          <form className="rounded-2xl border border-line bg-white p-5 shadow-soft sm:p-7 print:hidden" onSubmit={(e) => e.preventDefault()} aria-labelledby="eosb-inputs">
            <div className="flex items-center justify-between gap-3">
              <h2 id="eosb-inputs" className="text-lg font-bold text-ink">{t('بيانات الخدمة', 'Service details')}</h2>
              <button type="button" onClick={() => setS(initial())} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-ink-muted hover:bg-sand hover:text-primary">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />{t('إعادة تعيين', 'Reset')}
              </button>
            </div>

            <fieldset className="mt-5">
              <legend className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary"><CalendarRange className="h-4 w-4" aria-hidden />{t('مدة الخدمة', 'Service period')}</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Labeled id="startDate" label={t('تاريخ بداية الخدمة', 'Start date')}>
                  <Input id="startDate" type="date" value={s.startDate} max={s.endDate || undefined} onChange={set('startDate')} required />
                </Labeled>
                <Labeled id="endDate" label={t('تاريخ نهاية الخدمة', 'End date')}>
                  <Input id="endDate" type="date" value={s.endDate} min={s.startDate || undefined} onChange={set('endDate')} required />
                </Labeled>
              </div>
            </fieldset>

            <fieldset className="mt-6">
              <legend className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary"><Wallet className="h-4 w-4" aria-hidden />{t('آخر أجر شهري', 'Last monthly wage')}</legend>
              <div className="grid grid-cols-2 gap-4">
                {([
                  ['basic', t('الراتب الأساسي', 'Basic salary')],
                  ['housing', t('بدل السكن', 'Housing allowance')],
                  ['transport', t('بدل النقل', 'Transport allowance')],
                  ['other', t('بدلات ثابتة أخرى', 'Other fixed allowances')],
                ] as const).map(([k, l]) => (
                  <Labeled key={k} id={k} label={l}>
                    <div className="relative">
                      <Input id={k} type="number" inputMode="decimal" min={0} step="0.01" value={s[k]} onChange={set(k)} className="num ltr:pr-12 rtl:pl-12" />
                      <span className="pointer-events-none absolute inset-y-0 flex items-center text-xs text-ink-soft ltr:right-3 rtl:left-3">{t('ر.س', 'SAR')}</span>
                    </div>
                  </Labeled>
                ))}
              </div>
              <p className="mt-3 flex items-center justify-between rounded-xl bg-sand px-4 py-2.5 text-sm">
                <span className="text-ink-muted">{t('الأجر الشامل', 'Total wage')}</span>
                <span className="num font-semibold text-ink">{sar(totalWage)}</span>
              </p>
            </fieldset>

            <fieldset className="mt-6">
              <legend className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary"><Scale className="h-4 w-4" aria-hidden />{t('انتهاء العلاقة', 'Termination')}</legend>
              <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
                <Labeled id="reason" label={t('سبب انتهاء العلاقة التعاقدية', 'Termination reason')}>
                  <Select id="reason" value={s.reason} onChange={set('reason')} options={reasonOptions} />
                </Labeled>
                <Labeled id="unusedLeaveDays" label={t('رصيد إجازات غير مستخدم (يوم)', 'Unused leave days')}>
                  <Input id="unusedLeaveDays" type="number" inputMode="numeric" min={0} step={1} value={s.unusedLeaveDays} onChange={set('unusedLeaveDays')} className="num" />
                </Labeled>
              </div>
            </fieldset>
          </form>

          {/* result */}
          <div className="lg:sticky lg:top-24" aria-live="polite">
            <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-lift">
              <div className="relative overflow-hidden bg-primary p-6 text-white sm:p-7">
                <div aria-hidden className="taqam-pattern absolute inset-0 opacity-60" />
                <div className="relative">
                  <p className="text-sm text-white/70">{t('إجمالي المستحق التقديري', 'Estimated total due')}</p>
                  <p className="num mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
                    {result ? money(result.total, { currency: false }) : '—'} <span className="text-base font-medium text-white/70">{t('ر.س', 'SAR')}</span>
                  </p>
                  {result && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs ring-1 ring-white/15">
                        {t('مدة الخدمة', 'Service')}: <b className="num">{result.service.years}</b> {t('سنة', 'y')} · <b className="num">{result.service.months}</b> {t('شهر', 'm')} · <b className="num">{result.service.days}</b> {t('يوم', 'd')}
                      </span>
                      <span className={clsx('rounded-full px-3 py-1 text-xs font-semibold', result.factor === 0 ? 'bg-danger text-white' : result.factor < 1 ? 'bg-accent text-night' : 'bg-success text-white')}>
                        {lang === 'ar' ? factorLabel[0] : factorLabel[1]}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 sm:p-7">
                {validation.length > 0 ? (
                  <div className="flex items-start gap-3 rounded-xl bg-warning-50 p-4 text-sm text-[#7a5d00]" role="alert">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <ul className="space-y-1">{validation.map((e) => <li key={e}>{e}</li>)}</ul>
                  </div>
                ) : result ? (
                  <>
                    <h2 className="text-sm font-semibold text-ink">{t('تفصيل الاحتساب', 'Breakdown')}</h2>
                    <dl className="mt-3 divide-y divide-line">
                      {result.breakdown.map((b) => (
                        <div key={b.labelEn} className="flex items-start justify-between gap-4 py-3 text-sm">
                          <dt className="text-ink-muted">{lang === 'ar' ? b.labelAr : b.labelEn}</dt>
                          <dd className={clsx('num shrink-0 font-semibold', b.amount < 0 ? 'text-danger' : 'text-ink')} dir="ltr">{money(b.amount, { currency: false })}</dd>
                        </div>
                      ))}
                      <div className="flex items-center justify-between gap-4 py-3 text-sm">
                        <dt className="font-semibold text-ink">{t('مكافأة نهاية الخدمة', 'End-of-service award')}</dt>
                        <dd className="num font-semibold text-primary" dir="ltr">{money(result.award, { currency: false })}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-4 pt-3 text-base">
                        <dt className="font-bold text-ink">{t('الإجمالي', 'Total')}</dt>
                        <dd className="num font-bold text-primary">{sar(result.total)}</dd>
                      </div>
                    </dl>

                    <div className="mt-6 rounded-xl bg-sand p-4">
                      <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Info className="h-4 w-4 text-info" aria-hidden />{t('ملاحظات', 'Notes')}</p>
                      <ul className="mt-2 list-disc space-y-1.5 text-sm leading-6 text-ink-muted ltr:pl-5 rtl:pr-5">
                        {notes.map((x) => <li key={x}>{x}</li>)}
                      </ul>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-ink-muted">{t('تعذّر الاحتساب، تحقق من المدخلات.', 'Could not calculate — please check your inputs.')}</p>
                )}

                <div className="mt-6 flex flex-col gap-2 sm:flex-row print:hidden">
                  <Button variant="secondary" onClick={() => window.print()} disabled={!result} className="sm:flex-1"><Printer className="h-4 w-4" aria-hidden />{t('طباعة النتيجة', 'Print result')}</Button>
                  <ButtonLink href="/signup" className="sm:flex-1">{t('احسبها لكل موظفيك تلقائياً', 'Automate it for all staff')}</ButtonLink>
                </div>
              </div>
            </div>
            <p className="mt-4 flex items-start gap-2 px-1 text-xs leading-5 text-ink-soft">
              <Badge tone="neutral" className="shrink-0">{t('تنبيه', 'Disclaimer')}</Badge>
              {t('النتيجة تقديرية لأغراض استرشادية فقط ولا تُعد استشارة قانونية. قد تختلف المستحقات الفعلية بحسب العقد واللوائح الداخلية وأي تعديلات نظامية.',
                'This estimate is for guidance only and is not legal advice. Actual entitlements may vary by contract, internal policy and regulatory changes.')}
            </p>
          </div>
        </Container>
      </section>

      <section className="pb-16 print:hidden">
        <Container>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { h: t('كيف تُحتسب المكافأة؟', 'How is the award calculated?'), b: t('نصف أجر شهر عن كل سنة من السنوات الخمس الأولى، وأجر شهر كامل عن كل سنة بعدها، على أساس آخر أجر شامل، وتُحتسب أجزاء السنة بالتناسب.', 'Half a month’s wage for each of the first five years and a full month for each year after, based on the last total wage, with partial years prorated.') },
              { h: t('ماذا عن الاستقالة؟', 'What about resignation?'), b: t('أقل من سنتين: لا مكافأة. من سنتين إلى أقل من خمس: الثلث. من خمس إلى أقل من عشر: الثلثان. عشر سنوات فأكثر: كاملة.', 'Under 2 years: none. 2 to under 5: one third. 5 to under 10: two thirds. 10+ years: full.') },
              { h: t('رصيد الإجازات', 'Leave balance'), b: t('يستحق العامل عند انتهاء العلاقة أجر أيام الإجازة السنوية التي لم يستخدمها، ويُحتسب هنا بالأجر اليومي (الأجر الشامل ÷ 30).', 'On termination the worker is owed pay for unused annual leave days, calculated here at the daily wage (total wage ÷ 30).') },
            ].map((x) => (
              <div key={x.h} className="rounded-2xl border border-line bg-white p-6">
                <h2 className="font-semibold text-ink">{x.h}</h2>
                <p className="mt-2 text-sm leading-7 text-ink-muted">{x.b}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}

function Labeled({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      {children}
    </div>
  );
}

function englishNotes(r: EosbResult, reason: TerminationReason): string[] {
  const out = [
    `Service: ${r.service.years} years, ${r.service.months} months, ${r.service.days} days (${r.service.totalYears.toFixed(2)} years).`,
    'The award is based on the last total wage (basic plus fixed allowances) per Article 84.',
    'Partial years are counted pro rata.',
  ];
  if (reason === 'RESIGNATION') {
    out.push(r.factor === 0 ? 'Resignation with under 2 years of service: no award (Article 85).'
      : r.factor < 0.5 ? 'Resignation with 2 to under 5 years: one third of the award (Article 85).'
      : r.factor < 1 ? 'Resignation with 5 to under 10 years: two thirds of the award (Article 85).'
      : 'Resignation with 10+ years: full award (Article 85).');
  } else if (reason === 'ARTICLE_80') out.push('Dismissal under Article 80 forfeits the end-of-service award.');
  else out.push('This termination reason entitles the worker to the full award.');
  if (r.leaveEncashment > 0) out.push('Unused leave is paid at the daily wage (total wage ÷ 30).');
  return out;
}
