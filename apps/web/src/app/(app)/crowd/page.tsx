'use client';

import { useEffect, useState } from 'react';
import { api, CrowdZone } from '@/lib/api';
import { t, DENSITY_LABELS, RISK_LABELS } from '@/lib/i18n';
import { useLang } from '@/lib/lang-context';

function Badge({ map, value, lang }: { map: typeof DENSITY_LABELS; value: string; lang: 'ar' | 'en' }) {
  const item = map[value] ?? { ar: value, en: value, color: '#64748b' };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: item.color }}
    >
      <span aria-hidden>●</span>
      {item[lang]}
    </span>
  );
}

export default function CrowdPage() {
  const { lang } = useLang();
  const [zones, setZones] = useState<CrowdZone[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => api.crowdCurrent().then((z) => alive && setZones(z)).catch(() => alive && setZones([]));
    load();
    const id = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!zones) return <div className="skeleton h-64" />;
  if (zones.length === 0) return <div className="text-slate-500">{t('noData', lang)}</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">{t('crowd', lang)}</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {zones.map((z) => (
          <div key={z.zoneId} className="kpi-card space-y-3">
            <div className="flex items-start justify-between">
              <div className="font-semibold">{lang === 'ar' ? z.zoneArabicName || z.zoneName : z.zoneName}</div>
              <Badge map={RISK_LABELS} value={z.riskLevel} lang={lang} />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>{t('occupancy', lang)}</span>
                <span>
                  {z.occupancy.toLocaleString()} / {z.capacity.toLocaleString()} ({z.occupancyPercentage}%)
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, z.occupancyPercentage)}%`,
                    backgroundColor: (DENSITY_LABELS[z.densityLevel] ?? { color: '#0f7a52' }).color,
                  }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">{t('density', lang)}</span>
              <Badge map={DENSITY_LABELS} value={z.densityLevel} lang={lang} />
            </div>
            <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-2 text-center text-xs dark:border-slate-800">
              <div>
                <div className="text-slate-400">+15{t('minutes', lang)}</div>
                <div className="font-semibold">{z.predictedOccupancy['15'].toLocaleString()}</div>
              </div>
              <div>
                <div className="text-slate-400">+30{t('minutes', lang)}</div>
                <div className="font-semibold">{z.predictedOccupancy['30'].toLocaleString()}</div>
              </div>
              <div>
                <div className="text-slate-400">+60{t('minutes', lang)}</div>
                <div className="font-semibold">{z.predictedOccupancy['60'].toLocaleString()}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
