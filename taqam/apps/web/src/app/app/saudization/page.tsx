'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, Minus, Plus, Sparkles, TrendingUp } from 'lucide-react';
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Table, type Column } from '@/components/ui';
import { Async, BAND_COLOR, Gauge } from '@/components/app/primitives';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { num, pct } from '@/lib/format';
import { NITAQAT_BAND, label } from '@/lib/labels';
import type { NitaqatBand, SaudizationData, SaudizationSim } from '@/lib/types';

function BandPill({ band }: { band: NitaqatBand }) {
  const { lang } = useLang();
  return <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold text-white" style={{ background: BAND_COLOR[band] }}>{label(NITAQAT_BAND, band, lang)}</span>;
}

function Stepper({ value, onChange, label: l }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div>
      <p className="field-label">{l}</p>
      <div className="flex h-12 items-center overflow-hidden rounded-xl border border-line bg-white">
        <button onClick={() => onChange(Math.max(0, value - 1))} className="flex h-full w-12 items-center justify-center text-ink-muted hover:bg-sand" aria-label="minus"><Minus className="h-4 w-4" /></button>
        <input type="number" min={0} value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} className="num h-full w-full border-x border-line text-center text-lg font-semibold focus:outline-none" />
        <button onClick={() => onChange(value + 1)} className="flex h-full w-12 items-center justify-center text-ink-muted hover:bg-sand" aria-label="plus"><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export default function SaudizationPage() {
  const { t, lang } = useLang();
  const { data, loading, error, reload } = useFetch(() => api.get<SaudizationData>('/saudization'), []);
  const [addSaudis, setAddSaudis] = useState(1);
  const [addNonSaudis, setAddNonSaudis] = useState(0);
  const [sim, setSim] = useState<SaudizationSim | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  useEffect(() => {
    setSimLoading(true);
    const h = setTimeout(async () => {
      try { setSim(await api.get<SaudizationSim>('/saudization/simulate', { addSaudis, addNonSaudis })); } catch { setSim(null); } finally { setSimLoading(false); }
    }, 300);
    return () => clearTimeout(h);
  }, [addSaudis, addNonSaudis]);

  const columns: Column<SaudizationData['branches'][number]>[] = [
    { key: 'name', header: t('الفرع', 'Branch'), render: (b) => <span className="font-medium text-ink">{b.branchName}</span> },
    { key: 'total', header: t('الموظفون', 'Employees'), render: (b) => <span className="num">{num(b.total)}</span> },
    { key: 'saudis', header: t('السعوديون', 'Saudis'), render: (b) => <span className="num">{num(b.saudis)}</span> },
    { key: 'rate', header: t('النسبة', 'Rate'), render: (b) => (
      <div className="flex w-44 items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-sand-200"><div className="h-full rounded-full" style={{ width: `${Math.min(100, b.rate)}%`, background: BAND_COLOR[b.band] }} /></div>
        <span className="num w-12 text-end text-xs font-semibold">{pct(b.rate)}</span>
      </div>
    ) },
    { key: 'band', header: t('النطاق', 'Band'), render: (b) => <BandPill band={b.band} /> },
  ];

  return (
    <>
      <PageHeader title={t('السعودة (نطاقات)', 'Saudization (Nitaqat)')} subtitle={t('نسبة التوطين على مستوى المنشأة والفروع ومحاكاة أثر التوظيف', 'Localization rate by company & branch with a hiring simulator')} />
      <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
        {data && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Card>
                <CardHeader title={t('نسبة المنشأة', 'Company rate')} />
                <CardBody className="flex flex-col items-center gap-3">
                  <Gauge value={data.company.rate} color={BAND_COLOR[data.company.band]} label={`${num(data.company.saudis)} ${t('سعودي من', 'Saudi of')} ${num(data.company.total)}`} size={220} />
                  <BandPill band={data.company.band} />
                  {data.company.hiresToNextBand > 0 ? (
                    <p className="flex items-center gap-1.5 rounded-xl bg-accent-50 px-3 py-2 text-sm text-ink"><TrendingUp className="h-4 w-4 text-accent-600" />
                      {t('تحتاج', 'You need')} <strong className="num">{num(data.company.hiresToNextBand)}</strong> {t('توظيف سعودي للانتقال للنطاق التالي', 'Saudi hires to reach the next band')}</p>
                  ) : <p className="flex items-center gap-1.5 text-sm text-success"><Sparkles className="h-4 w-4" />{t('أنت في أعلى نطاق', 'You are in the top band')}</p>}
                </CardBody>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader title={t('حدود النطاقات', 'Band thresholds')} subtitle={t('قيم توضيحية — الحدود الفعلية تختلف حسب النشاط وحجم المنشأة', 'Illustrative — real thresholds depend on activity and size')} />
                <CardBody>
                  <ThresholdScale rate={data.company.rate} th={data.thresholds} />
                  <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {([['RED', 0], ['LOW_GREEN', data.thresholds.lowGreen], ['MID_GREEN', data.thresholds.midGreen], ['HIGH_GREEN', data.thresholds.highGreen], ['PLATINUM', data.thresholds.platinum]] as [NitaqatBand, number][]).map(([b, v]) => (
                      <div key={b} className={`rounded-xl border p-3 ${data.company.band === b ? 'border-primary ring-2 ring-primary-100' : 'border-line'}`}>
                        <span className="mb-1 block h-1.5 w-8 rounded-full" style={{ background: BAND_COLOR[b] }} />
                        <p className="text-xs font-medium text-ink">{label(NITAQAT_BAND, b, lang)}</p>
                        <p className="num text-xs text-ink-soft">≥ {v}%</p>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            </div>

            <Card>
              <CardHeader title={t('محاكي أثر التوظيف', 'Hiring impact simulator')} subtitle={t('ماذا يحدث لنسبتك إذا وظفت…', 'What happens to your rate if you hire…')} action={<Sparkles className="h-5 w-5 text-accent" />} />
              <CardBody className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[1fr_1.4fr]">
                <div className="grid grid-cols-2 gap-4">
                  <Stepper value={addSaudis} onChange={setAddSaudis} label={t('موظفون سعوديون', 'Saudi hires')} />
                  <Stepper value={addNonSaudis} onChange={setAddNonSaudis} label={t('موظفون غير سعوديين', 'Non-Saudi hires')} />
                </div>
                <div className={`flex items-center justify-around gap-4 rounded-2xl bg-sand p-5 ${simLoading ? 'opacity-60' : ''}`}>
                  {sim ? <>
                    <SimSide title={t('الآن', 'Now')} rate={sim.before.rate} band={sim.before.band} />
                    <ArrowLeft className="h-6 w-6 shrink-0 text-ink-soft ltr:rotate-180" />
                    <SimSide title={t('بعد التوظيف', 'After hiring')} rate={sim.after.rate} band={sim.after.band} highlight />
                  </> : <p className="text-sm text-ink-muted">{t('جارٍ الاحتساب…', 'Calculating…')}</p>}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={t('السعودة حسب الفرع', 'By branch')} />
              <Table columns={columns} rows={data.branches} rowKey={(b) => b.branchId} empty={<EmptyState />} />
            </Card>
          </div>
        )}
      </Async>
    </>
  );
}

function SimSide({ title, rate, band, highlight }: { title: string; rate: number; band: NitaqatBand; highlight?: boolean }) {
  return (
    <div className="text-center">
      <p className="text-xs text-ink-soft">{title}</p>
      <p className={`num my-1 text-3xl font-bold ${highlight ? 'text-primary' : 'text-ink-muted'}`} dir="ltr">{pct(rate)}</p>
      <BandPill band={band} />
    </div>
  );
}

function ThresholdScale({ rate, th }: { rate: number; th: SaudizationData['thresholds'] }) {
  const max = Math.max(60, th.platinum + 15, rate + 5);
  const seg = [
    { from: 0, to: th.lowGreen, c: BAND_COLOR.RED }, { from: th.lowGreen, to: th.midGreen, c: BAND_COLOR.LOW_GREEN },
    { from: th.midGreen, to: th.highGreen, c: BAND_COLOR.MID_GREEN }, { from: th.highGreen, to: th.platinum, c: BAND_COLOR.HIGH_GREEN },
    { from: th.platinum, to: max, c: BAND_COLOR.PLATINUM },
  ];
  return (
    <div dir="ltr" className="relative pt-8">
      <div className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `${(Math.min(rate, max) / max) * 100}%` }}>
        <span className="num rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-semibold text-white">{pct(rate)}</span>
        <div className="mx-auto h-3 w-0.5 bg-ink" />
      </div>
      <div className="flex h-4 overflow-hidden rounded-full">
        {seg.map((s, i) => <div key={i} style={{ width: `${((s.to - s.from) / max) * 100}%`, background: s.c }} />)}
      </div>
      <div className="relative mt-1 h-4 text-[10px] text-ink-soft">
        {[th.lowGreen, th.midGreen, th.highGreen, th.platinum].map((v) => <span key={v} className="num absolute -translate-x-1/2" style={{ left: `${(v / max) * 100}%` }}>{v}%</span>)}
      </div>
    </div>
  );
}
