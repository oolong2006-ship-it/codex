'use client';
import clsx from 'clsx';
import { CheckCircle2, FileCheck2, MapPin, TrendingUp } from 'lucide-react';
import { useT2 } from './primitives';

type Dot = 'p' | 'l' | 'a';
const BRANCHES: { ar: string; en: string; cityAr: string; cityEn: string; dots: Dot[] }[] = [
  { ar: 'فرع العليا', en: 'Olaya', cityAr: 'الرياض', cityEn: 'Riyadh', dots: ['p', 'p', 'p', 'p', 'p', 'l', 'p', 'p', 'p', 'p'] },
  { ar: 'فرع التحلية', en: 'Tahlia', cityAr: 'جدة', cityEn: 'Jeddah', dots: ['p', 'p', 'l', 'p', 'p', 'p', 'a', 'p', 'p'] },
  { ar: 'فرع الكورنيش', en: 'Corniche', cityAr: 'الخبر', cityEn: 'Khobar', dots: ['p', 'p', 'p', 'p', 'p', 'p', 'p'] },
  { ar: 'فرع النخيل', en: 'Nakheel', cityAr: 'بريدة', cityEn: 'Buraydah', dots: ['p', 'l', 'p', 'a', 'p', 'p'] },
];
const BARS = [62, 70, 66, 78, 74, 88];

function LiveDot({ kind, i }: { kind: Dot; i: number }) {
  const color = kind === 'p' ? 'bg-success' : kind === 'l' ? 'bg-accent' : 'bg-sand-300';
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      {kind === 'p' && i % 4 === 0 && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-50" />}
      <span className={clsx('relative inline-flex h-2.5 w-2.5 rounded-full', color)} />
    </span>
  );
}

export function ProductMock({ className }: { className?: string }) {
  const { t } = useT2();
  return (
    <div className={clsx('relative', className)} aria-label={t('معاينة توضيحية للوحة تحكم طاقم', 'Illustrative preview of the Taqam dashboard')} role="img">
      {/* window */}
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-lift">
        <div className="flex items-center gap-2 border-b border-line bg-sand/70 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-accent/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
          <span className="mx-auto rounded-md bg-white px-3 py-0.5 text-[10px] text-ink-soft" dir="ltr">app.taqam.sa/branches</span>
        </div>
        <div className="grid gap-3 p-3 sm:grid-cols-5 sm:p-4">
          {/* branches */}
          <div className="rounded-xl border border-line p-3 sm:col-span-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-ink">{t('حضور الفروع الآن', 'Branch attendance now')}</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-medium text-success">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />{t('مباشر', 'Live')}
              </span>
            </div>
            <ul className="space-y-2">
              {BRANCHES.map((b) => {
                const present = b.dots.filter((d) => d !== 'a').length;
                return (
                  <li key={b.en} className="flex items-center justify-between gap-2 rounded-lg bg-sand/60 px-2.5 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold text-ink">{t(b.ar, b.en)}</p>
                      <p className="flex items-center gap-1 text-[10px] text-ink-soft"><MapPin className="h-2.5 w-2.5" />{t(b.cityAr, b.cityEn)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="hidden flex-wrap gap-1 min-[400px]:flex">{b.dots.map((d, i) => <LiveDot key={i} kind={d} i={i} />)}</div>
                      <span className="num text-[11px] font-semibold text-primary">{present}/{b.dots.length}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          {/* side column */}
          <div className="grid gap-3 sm:col-span-2">
            <div className="rounded-xl bg-primary p-3 text-white">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-white/70">{t('مسير سبتمبر', 'September payroll')}</p>
                <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-primary">{t('معتمد', 'Approved')}</span>
              </div>
              <p className="num mt-1 text-lg font-bold">412,850 <span className="text-xs font-medium text-white/70">{t('ر.س', 'SAR')}</span></p>
              <div className="mt-2 flex h-10 items-end gap-1">
                {BARS.map((h, i) => (
                  <span key={i} className={clsx('flex-1 rounded-sm', i === BARS.length - 1 ? 'bg-accent' : 'bg-white/25')} style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-line p-3">
              <div className="relative h-12 w-12 shrink-0 rounded-full" style={{ background: 'conic-gradient(#2E8B57 0 34%, #F1E9DB 34% 100%)' }}>
                <div className="absolute inset-1.5 flex items-center justify-center rounded-full bg-white">
                  <span className="num text-[10px] font-bold text-ink">34%</span>
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-ink">{t('نسبة السعودة', 'Saudization')}</p>
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-medium text-success">
                  <TrendingUp className="h-3 w-3" />{t('أخضر مرتفع', 'High green')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* floating cards */}
      <div className="absolute -bottom-6 hidden items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 shadow-lift sm:flex ltr:-left-6 rtl:-right-6">
        <span className="rounded-lg bg-success-50 p-1.5 text-success"><CheckCircle2 className="h-4 w-4" /></span>
        <div>
          <p className="text-[11px] font-semibold text-ink">{t('بصمة داخل النطاق', 'Check-in inside geofence')}</p>
          <p className="num text-[10px] text-ink-soft">{t('أحمد — فرع العليا', 'Ahmed — Olaya')} · 07:58</p>
        </div>
      </div>
      <div className="absolute -top-5 hidden items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 shadow-lift md:flex ltr:-right-4 rtl:-left-4">
        <span className="rounded-lg bg-accent-100 p-1.5 text-accent-600"><FileCheck2 className="h-4 w-4" /></span>
        <p className="text-[11px] font-semibold text-ink">{t('ملف حماية الأجور جاهز', 'WPS file ready')}</p>
      </div>
    </div>
  );
}
