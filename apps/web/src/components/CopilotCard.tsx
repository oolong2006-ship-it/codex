'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, CopilotBriefing } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useLang } from '@/lib/lang-context';

const LEVEL_STYLE: Record<CopilotBriefing['level'], string> = {
  CALM: 'bg-safe text-white',
  WATCH: 'bg-watch text-white',
  ELEVATED: 'bg-busy text-white',
  CRITICAL: 'bg-critical text-white',
};

const PRIORITY_STYLE: Record<CopilotBriefing['actions'][number]['priority'], string> = {
  HIGH: 'border-danger text-danger',
  MEDIUM: 'border-busy text-busy',
  LOW: 'border-safe text-safe',
};

// The briefing may call an LLM, so it refreshes far less often than the KPIs.
const REFRESH_MS = 60_000;

export function CopilotCard() {
  const { lang } = useLang();
  const [data, setData] = useState<CopilotBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.copilotBriefing());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  return (
    <section className="kpi-card space-y-3" aria-busy={loading}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{t('copilotTitle', lang)}</h3>
          {data && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${LEVEL_STYLE[data.level]}`}>
              {t(`level${data.level}`, lang)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-lg border px-3 py-1 text-xs font-medium hover:bg-surface-2 disabled:opacity-60"
        >
          {loading ? t('copilotLoading', lang) : t('copilotRefresh', lang)}
        </button>
      </div>

      {error && !data && <div className="text-sm text-danger">{t('error', lang)}</div>}
      {!data && !error && <div className="skeleton h-20" />}

      {data && (
        <>
          {/* The model and the rules both write Arabic, so the briefing body stays RTL. */}
          <div dir="rtl" lang="ar" className="space-y-3">
            <p className="text-sm leading-relaxed">{data.summary}</p>
            <ol className="space-y-2">
              {data.actions.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span
                    className={`mt-0.5 shrink-0 rounded border px-1.5 text-xs font-semibold ${PRIORITY_STYLE[a.priority]}`}
                  >
                    {t(`priority${a.priority}`, lang)}
                  </span>
                  <span>
                    {a.target && <strong className="font-semibold">{a.target}: </strong>}
                    {a.action}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-faint">
            <span>{t(data.source === 'omniroute' ? 'copilotViaOmni' : 'copilotViaRules', lang)}</span>
            <span>
              {t(data.route.tier === 'priority' ? 'copilotTierPriority' : 'copilotTierRoutine', lang)}
            </span>
            {data.source === 'omniroute' && <span dir="ltr">{data.servedModel ?? data.route.model}</span>}
            {data.source === 'omniroute' && <span dir="ltr">{data.latencyMs} ms</span>}
            {data.cached && <span>{t('copilotCached', lang)}</span>}
          </div>
        </>
      )}
    </section>
  );
}
