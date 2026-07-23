'use client';

import { useEffect, useState } from 'react';
import { api, DashboardOverview, CrowdZone } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useLang } from '@/lib/lang-context';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="kpi-card">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const { lang } = useLang();
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [crowd, setCrowd] = useState<CrowdZone[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [ov, cr] = await Promise.all([api.overview(), api.crowdCurrent()]);
        if (!alive) return;
        setData(ov);
        setCrowd(cr);
      } catch {
        if (alive) setError(true);
      }
    }
    load();
    const id = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (error) return <div className="text-red-600">{t('error', lang)}</div>;
  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
    );
  }

  const k = data.kpis;
  const chartData = [...crowd]
    .sort((a, b) => b.occupancyPercentage - a.occupancyPercentage)
    .slice(0, 8)
    .map((z) => ({
      name: lang === 'ar' ? z.zoneArabicName || z.zoneName : z.zoneName,
      value: z.occupancyPercentage,
    }));

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">{t('dashboard', lang)}</h2>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label={t('activeEvents', lang)} value={k.activeEvents} />
        <Kpi label={t('totalVisitors', lang)} value={k.totalVisitors.toLocaleString()} />
        <Kpi
          label={t('currentOccupancy', lang)}
          value={`${k.occupancyPercentage}%`}
          sub={k.currentOccupancy.toLocaleString()}
        />
        <Kpi label={t('avgQueueTime', lang)} value={`${k.averageQueueTime} ${t('minutes', lang)}`} />
        <Kpi label={t('activeAlerts', lang)} value={k.activeAlerts} />
        <Kpi label={t('openIncidents', lang)} value={k.openIncidents} />
        <Kpi label={t('highRiskZones', lang)} value={k.highRiskZones} />
        <Kpi label={t('gateThroughput', lang)} value={k.gateThroughput} />
      </div>

      <div className="kpi-card">
        <div className="mb-4 text-sm font-semibold">{t('occupancy', lang)} — {t('zone', lang)}</div>
        <div className="h-72" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 40, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="name" angle={-30} textAnchor="end" height={60} tick={{ fontSize: 11 }} />
              <YAxis unit="%" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#0f7a52" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
