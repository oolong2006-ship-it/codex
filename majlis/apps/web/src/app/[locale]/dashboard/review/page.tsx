import { interviewerTurnsToRate, openFlags, qualityMetrics } from "@majlis/db";
import { isLocale, t, type Locale, type MessageKey } from "@majlis/i18n";
import { notFound } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import { canReview, db, requireUser } from "@/lib/server";
import { FlagCard, RateCard } from "./panels";

export const dynamic = "force-dynamic";

/** Section-3 acceptance thresholds. Shown next to the measured value, never rounded up. */
const TARGETS = { wer: 0.08, mos: 4.4, dialect: 0.95, latencyMs: 800 };

function Metric({
  locale,
  label,
  value,
  target,
  sample,
  pass,
}: {
  locale: Locale;
  label: string;
  value: string | null;
  target: string;
  sample: number;
  pass: boolean | null;
}) {
  return (
    <Card className="flex flex-col gap-2" data-testid="metric">
      <h3 className="font-semibold">{label}</h3>
      <p className="text-2xl font-semibold" dir="ltr">
        {value ?? "—"}
      </p>
      <p className="text-sm opacity-70">
        {t(locale, "review.target", { target })} · {t(locale, "review.sample", { n: sample })}
      </p>
      {pass === null ? (
        <Badge>{t(locale, "review.noData")}</Badge>
      ) : (
        <Badge tone={pass ? "good" : "warn"}>
          {t(locale, pass ? "review.pass" : "review.fail")}
        </Badge>
      )}
    </Card>
  );
}

export default async function ReviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await requireUser(locale);
  if (!canReview(user)) {
    return (
      <Card>
        <p>{t(locale, "review.forbidden")}</p>
      </Card>
    );
  }
  const [metrics, flags, toRate] = await Promise.all([
    qualityMetrics(db(), user.orgId),
    openFlags(db(), user.orgId),
    interviewerTurnsToRate(db(), user.orgId, user.id),
  ]);
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const dialectName = (d: string) =>
    d === "unknown" ? t(locale, "review.unknownDialect") : t(locale, `dialects.${d}` as MessageKey);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t(locale, "review.title")}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">{t(locale, "review.metricsTitle")}</h2>
        <p className="text-sm opacity-70">{t(locale, "review.metricsHint")}</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.wer.length === 0 ? (
            <Metric
              locale={locale}
              label={t(locale, "review.metricWer", { dialect: "—" })}
              value={null}
              target={`< ${pct(TARGETS.wer)}`}
              sample={0}
              pass={null}
            />
          ) : (
            metrics.wer.map((w) => (
              <Metric
                key={w.dialect}
                locale={locale}
                label={t(locale, "review.metricWer", { dialect: dialectName(w.dialect) })}
                value={pct(w.wer)}
                target={`< ${pct(TARGETS.wer)}`}
                sample={w.words}
                pass={w.words ? w.wer < TARGETS.wer : null}
              />
            ))
          )}
          <Metric
            locale={locale}
            label={t(locale, "review.metricMos")}
            value={metrics.mos.mean === null ? null : metrics.mos.mean.toFixed(2)}
            target={`≥ ${TARGETS.mos}`}
            sample={metrics.mos.ratings}
            pass={metrics.mos.mean === null ? null : metrics.mos.mean >= TARGETS.mos}
          />
          <Metric
            locale={locale}
            label={t(locale, "review.metricDialect")}
            value={metrics.dialectCorrect.share === null ? null : pct(metrics.dialectCorrect.share)}
            target={`≥ ${pct(TARGETS.dialect)}`}
            sample={metrics.dialectCorrect.ratings}
            pass={
              metrics.dialectCorrect.share === null
                ? null
                : metrics.dialectCorrect.share >= TARGETS.dialect
            }
          />
          <Metric
            locale={locale}
            label={t(locale, "review.metricLatency")}
            value={
              metrics.latencyP90.value === null
                ? null
                : `${Math.round(metrics.latencyP90.value)} ms`
            }
            target={`< ${TARGETS.latencyMs} ms`}
            sample={metrics.latencyP90.sessions}
            pass={
              metrics.latencyP90.value === null
                ? null
                : metrics.latencyP90.value < TARGETS.latencyMs
            }
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">{t(locale, "review.flagsTitle")}</h2>
        {flags.length === 0 ? (
          <Card>
            <p>{t(locale, "review.flagsEmpty")}</p>
          </Card>
        ) : (
          flags.map((f) => <FlagCard key={f.flagId} locale={locale} flag={f} />)
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">{t(locale, "review.rateTitle")}</h2>
        <p className="text-sm opacity-70">{t(locale, "review.rateHint")}</p>
        {toRate.length === 0 ? (
          <Card>
            <p>{t(locale, "review.rateEmpty")}</p>
          </Card>
        ) : (
          toRate.map((r) => <RateCard key={r.turnId} locale={locale} turn={r} />)
        )}
      </section>
    </div>
  );
}
