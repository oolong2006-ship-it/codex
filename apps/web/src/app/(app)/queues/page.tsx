'use client';

import { useEffect, useState } from 'react';
import { api, QueueGate } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useLang } from '@/lib/lang-context';

export default function QueuesPage() {
  const { lang } = useLang();
  const [gates, setGates] = useState<QueueGate[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => api.queuesCurrent().then((g) => alive && setGates(g)).catch(() => alive && setGates([]));
    load();
    const id = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!gates) return <div className="skeleton h-64" />;
  if (gates.length === 0) return <div className="text-slate-500">{t('noData', lang)}</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">{t('queues', lang)}</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-start dark:bg-slate-800">
            <tr>
              <th className="px-4 py-2 text-start">{t('gate', lang)}</th>
              <th className="px-4 py-2 text-start">{t('queueLength', lang)}</th>
              <th className="px-4 py-2 text-start">{t('waitingTime', lang)}</th>
              <th className="px-4 py-2 text-start">{t('risk', lang)}</th>
              <th className="px-4 py-2 text-start">{t('status', lang)}</th>
            </tr>
          </thead>
          <tbody>
            {gates.map((g) => (
              <tr key={g.gateId} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-4 py-2 font-medium">
                  {g.gateName} <span className="text-slate-400">({g.gateCode})</span>
                </td>
                <td className="px-4 py-2">{g.queueLength}</td>
                <td className="px-4 py-2">
                  {g.waitingTime} {t('minutes', lang)}
                </td>
                <td className="px-4 py-2">
                  <span
                    className="rounded px-2 py-0.5 text-xs font-medium text-white"
                    style={{
                      backgroundColor:
                        g.riskScore >= 90 ? '#7c3aed' : g.riskScore >= 70 ? '#f97316' : g.riskScore >= 40 ? '#eab308' : '#16a34a',
                    }}
                  >
                    {Math.round(g.riskScore)}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">{g.gateStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
