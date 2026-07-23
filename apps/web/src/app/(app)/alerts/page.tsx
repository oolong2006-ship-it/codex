'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, Alert } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useLang } from '@/lib/lang-context';

const SEVERITY_COLOR: Record<string, string> = {
  INFO: '#64748b',
  LOW: '#16a34a',
  MEDIUM: '#eab308',
  HIGH: '#f97316',
  CRITICAL: '#dc2626',
};

export default function AlertsPage() {
  const { lang } = useLang();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);

  const load = useCallback(() => {
    api.alerts().then(setAlerts).catch(() => setAlerts([]));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [load]);

  async function ack(id: string) {
    await api.acknowledgeAlert(id);
    load();
  }
  async function resolve(id: string) {
    await api.resolveAlert(id);
    load();
  }

  if (!alerts) return <div className="skeleton h-64" />;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">{t('alerts', lang)}</h2>
      {alerts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-700">
          {t('noData', lang)}
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center gap-3">
                <span
                  className="rounded px-2 py-0.5 text-xs font-semibold text-white"
                  style={{ backgroundColor: SEVERITY_COLOR[a.severity] ?? '#64748b' }}
                >
                  {a.severity}
                </span>
                <div>
                  <div className="text-sm font-medium">{a.message}</div>
                  <div className="text-xs text-slate-400">
                    {a.type} · {a.status}
                    {a.recommendedAction ? ` · ${a.recommendedAction}` : ''}
                  </div>
                </div>
              </div>
              {a.status !== 'RESOLVED' && (
                <div className="flex shrink-0 gap-2">
                  {a.status === 'NEW' && (
                    <button
                      onClick={() => ack(a.id)}
                      className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      {t('acknowledge', lang)}
                    </button>
                  )}
                  <button
                    onClick={() => resolve(a.id)}
                    className="rounded-lg bg-masar-600 px-2.5 py-1 text-xs text-white hover:bg-masar-700"
                  >
                    {t('resolve', lang)}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
