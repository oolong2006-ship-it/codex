'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, SimStatus } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useLang } from '@/lib/lang-context';

export default function SimulationPage() {
  const { lang } = useLang();
  const [scenarios, setScenarios] = useState<{ key: string; name: string; arabicName: string }[]>([]);
  const [selected, setSelected] = useState('NORMAL');
  const [status, setStatus] = useState<SimStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    api.simStatus().then(setStatus).catch(() => undefined);
  }, []);

  useEffect(() => {
    api.scenarios().then((s) => {
      setScenarios(s);
      if (s[0]) setSelected(s[0].key);
    });
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [refresh]);

  async function start() {
    setBusy(true);
    try {
      await api.startSim(selected);
      refresh();
    } finally {
      setBusy(false);
    }
  }
  async function stop() {
    setBusy(true);
    try {
      await api.stopSim();
      refresh();
    } finally {
      setBusy(false);
    }
  }

  const active = status?.active;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">{t('simulation', lang)}</h2>

      <div className="kpi-card max-w-xl space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">{t('scenario', lang)}</label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={!!active}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            {scenarios.map((s) => (
              <option key={s.key} value={s.key}>
                {lang === 'ar' ? s.arabicName : s.name}
              </option>
            ))}
          </select>
        </div>

        {active ? (
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500" />{' '}
              <span className="font-medium">{active.scenario}</span> · tick {active.tick}
            </div>
            <button
              onClick={stop}
              disabled={busy}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {t('stopSim', lang)}
            </button>
          </div>
        ) : (
          <button
            onClick={start}
            disabled={busy}
            className="w-full rounded-lg bg-masar-600 py-2.5 font-semibold text-white hover:bg-masar-700 disabled:opacity-60"
          >
            {t('startSim', lang)}
          </button>
        )}
      </div>

      {status && status.recent.length > 0 && (
        <div className="kpi-card">
          <div className="mb-3 text-sm font-semibold">{lang === 'ar' ? 'عمليات سابقة' : 'Recent runs'}</div>
          <div className="space-y-1 text-sm">
            {status.recent.map((r) => (
              <div key={r.id} className="flex justify-between border-b border-slate-100 py-1 dark:border-slate-800">
                <span>{r.scenario}</span>
                <span className="text-slate-400">{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
