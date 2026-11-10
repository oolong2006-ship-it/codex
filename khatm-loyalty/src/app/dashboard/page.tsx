import Link from "next/link";
import { requireDashboardActor, getLang } from "@/server/web";
import { kpis, weeklyVisits, branchPerformance, atRiskCustomers } from "@/server/domain/analytics";
import { can, PERMISSIONS } from "@/server/rbac";
import { maskPhone } from "@/server/phone";
import { fmtNumber, t, type Lang } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Overview" };

const TONES = ["bg-coral-50", "bg-grape-50", "bg-mint-50", "bg-sun-50"] as const;

function Stat({ label, value, hint, testId, tone = 0 }: { label: string; value: string; hint?: string; testId?: string; tone?: number }) {
  return (
    <div className={`rounded-3xl p-4 sm:p-5 ${TONES[tone % TONES.length]}`}>
      <div className="text-xs font-medium text-espresso-500 sm:text-sm">{label}</div>
      <div className="mt-1.5 font-[family-name:var(--font-display)] text-2xl font-bold tabular-nums sm:text-3xl" data-testid={testId}>{value}</div>
      {hint && <div className="mt-1 text-[11px] text-espresso-500">{hint}</div>}
    </div>
  );
}

function WeeklyChart({ lang, data }: { lang: Lang; data: Array<{ week: Date; visits: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.visits));
  const fmt = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { day: "numeric", month: "short" });
  return (
    <div role="img" aria-label={t(lang, "analytics.weeklyVisits")}>
      <div className="flex h-44 items-end gap-1.5 border-b border-cream-300 sm:gap-2">
        {data.map((d, i) => (
          <div key={i} className="group relative flex h-full flex-1 items-end">
            <div
              className={`w-full rounded-t-md transition ${i === data.length - 1 ? "bg-saffron-500" : i % 2 ? "bg-grape-500/45 group-hover:bg-grape-500/70" : "bg-grape-500 group-hover:bg-grape-700"}`}
              style={{ height: `${d.visits > 0 ? Math.max((d.visits / max) * 100, 3) : 0}%` }}
              title={`${fmt.format(new Date(d.week))}: ${d.visits}`}
            />
            <span className="pointer-events-none absolute inset-x-0 -top-5 text-center text-[11px] font-semibold tabular-nums text-espresso-700 opacity-0 transition group-hover:opacity-100">{d.visits}</span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5 sm:gap-2">
        {data.map((d, i) => (
          <span key={i} className={`flex-1 truncate text-center text-[10px] text-espresso-500 ${i % 2 ? "hidden sm:block" : ""}`}>
            {fmt.format(new Date(d.week))}
          </span>
        ))}
      </div>
    </div>
  );
}

export default async function Overview() {
  const actor = await requireDashboardActor();
  const lang = await getLang();
  const [k, weeks, branches, risk] = await Promise.all([
    kpis(actor),
    weeklyVisits(actor),
    branchPerformance(actor),
    can(actor.role, PERMISSIONS.CUSTOMER_VIEW) ? atRiskCustomers(actor, 8) : Promise.resolve([]),
  ]);
  const n = (v: number) => fmtNumber(lang, v);
  const empty = k.customers === 0;
  return (
    <>
      <PageHeader title={t(lang, "nav.overview")} />
      {empty && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-sun-50 p-5">
          <p className="font-medium">{t(lang, "analytics.empty")}</p>
          <Link href="/dashboard/poster" className="btn-primary">{t(lang, "nav.poster")}</Link>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 2xl:grid-cols-6">
        <Stat label={t(lang, "kpi.customers")} value={n(k.customers)} testId="kpi-customers" />
        <Stat tone={1} label={t(lang, "kpi.active30")} value={n(k.active30)} />
        <Stat tone={2} label={t(lang, "kpi.visits30")} value={n(k.visits30)} testId="kpi-visits" />
        <Stat tone={3} label={t(lang, "kpi.repeatRate")} value={k.repeatRate === null ? "—" : `${Math.round(k.repeatRate * 100)}%`} hint={t(lang, "kpi.repeatRateHint")} />
        <Stat tone={0} label={t(lang, "kpi.redemptions30")} value={n(k.redemptions30)} />
        <Stat tone={1} label={t(lang, "kpi.rewardsReady")} value={n(k.rewardsReady)} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="card p-5">
          <h2 className="mb-4 font-semibold">{t(lang, "analytics.weeklyVisits")}</h2>
          <WeeklyChart lang={lang} data={weeks} />
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">{t(lang, "analytics.byBranch")}</h2>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>{t(lang, "common.branch")}</th>
                  <th>{t(lang, "analytics.visits")}</th>
                  <th>{t(lang, "analytics.stamps")}</th>
                  <th>{t(lang, "analytics.redemptions")}</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => (
                  <tr key={b.id}>
                    <td className="font-medium">{b.name}</td>
                    <td className="tabular-nums">{n(b.visits)}</td>
                    <td className="tabular-nums">{n(b.stamps)}</td>
                    <td className="tabular-nums">{n(b.redemptions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {can(actor.role, PERMISSIONS.CUSTOMER_VIEW) && (
        <section className="card mt-6 p-5">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-semibold">{t(lang, "analytics.atRisk")}</h2>
              <p className="text-sm text-espresso-500">{t(lang, "analytics.atRiskHint")}</p>
            </div>
            {risk.length > 0 && can(actor.role, PERMISSIONS.CAMPAIGN_SEND) && (
              <Link href="/dashboard/campaigns?template=winback&audience=AT_RISK" className="btn-accent">{t(lang, "analytics.sendWinback")}</Link>
            )}
          </div>
          {risk.length === 0 ? (
            <p className="py-6 text-center text-sm text-espresso-500">{t(lang, "common.none")}</p>
          ) : (
            <ul className="divide-y divide-cream-200">
              {risk.map((r) => (
                <li key={r.customerId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-espresso-500" dir="ltr">{maskPhone(r.phone)}</div>
                  </div>
                  <div className="text-end text-sm">
                    <div className="font-semibold text-rose-600">{t(lang, "common.daysAgo", { n: r.daysSinceLast })}</div>
                    <div className="text-xs text-espresso-500">{t(lang, "analytics.usualEvery", { n: Math.round(r.avgIntervalDays) })}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
