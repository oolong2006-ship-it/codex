import { insightsForClient } from "@majlis/db";
import { t, type Locale, type MessageKey } from "@majlis/i18n";
import Link from "next/link";
import { Badge, cx } from "@/components/ui";
import { db } from "@/lib/server";

const SENTIMENTS = ["positive", "mixed", "neutral", "negative"] as const;
const BAR: Record<(typeof SENTIMENTS)[number], string> = {
  positive: "bg-palm",
  mixed: "bg-amber-400",
  neutral: "bg-line",
  negative: "bg-red-500",
};
const DIMS = ["gender", "ageBand", "city", "dialect"] as const;
type Dim = (typeof DIMS)[number];

function valueLabel(locale: Locale, dim: Dim, value: string): string {
  if (dim === "ageBand") return value;
  const group = dim === "gender" ? "gender" : dim === "city" ? "cities" : "dialects";
  return t(locale, `${group}.${value}` as MessageKey);
}

function SentimentBar({ counts, locale }: { counts: Record<string, number>; locale: Locale }) {
  const total = SENTIMENTS.reduce((n, s) => n + (counts[s] ?? 0), 0) || 1;
  return (
    <div
      className="flex h-3 w-full overflow-hidden rounded-full bg-sand"
      role="img"
      aria-label={t(locale, "results.auto", {
        positive: counts.positive ?? 0,
        negative: counts.negative ?? 0,
        mixed: counts.mixed ?? 0,
        neutral: counts.neutral ?? 0,
      })}
    >
      {SENTIMENTS.map((s) => (
        <span
          key={s}
          className={BAR[s]}
          style={{ width: `${((counts[s] ?? 0) / total) * 100}%` }}
        />
      ))}
    </div>
  );
}

export async function ResultsTab({
  locale,
  orgId,
  studyId,
  by,
}: {
  locale: Locale;
  orgId: string;
  studyId: string;
  by: string | undefined;
}) {
  const result = await insightsForClient(db(), orgId, studyId);
  if (!result) return null;
  const dim: Dim = (DIMS as readonly string[]).includes(by ?? "") ? (by as Dim) : "gender";

  return (
    <div className="flex flex-col gap-6">
      {result.pendingAnalysis > 0 && (
        <p className="text-amber-800">
          {t(locale, "results.pending", { count: result.pendingAnalysis })}
        </p>
      )}
      {result.themes.length === 0 ? (
        <p>{t(locale, "results.empty")}</p>
      ) : (
        <>
          <p className="text-sm opacity-70">{t(locale, "results.baseline")}</p>
          {result.themes.map((theme) => (
            <article
              key={theme.themeId}
              className="flex flex-col gap-3 rounded-2xl border border-line p-4"
              data-theme={theme.themeId}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">{theme.title}</h3>
                <Badge
                  tone={
                    theme.sentiment === "positive"
                      ? "good"
                      : theme.sentiment === "negative"
                        ? "warn"
                        : "neutral"
                  }
                >
                  {t(locale, `results.sentiment.${theme.sentiment}` as MessageKey)}
                </Badge>
              </div>
              <SentimentBar counts={theme.counts} locale={locale} />
              <p className="text-sm opacity-80">
                {t(locale, "results.answers", { answers: theme.answers, sessions: theme.sessions })}{" "}
                ·{" "}
                {t(locale, "results.auto", {
                  positive: theme.counts.positive ?? 0,
                  negative: theme.counts.negative ?? 0,
                  mixed: theme.counts.mixed ?? 0,
                  neutral: theme.counts.neutral ?? 0,
                })}
              </p>
              {theme.summary && <p>{theme.summary}</p>}
              {theme.quotes.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h4 className="text-sm font-semibold">{t(locale, "results.quotes")}</h4>
                  {theme.quotes.map((q) => (
                    <blockquote
                      key={q.turnId}
                      className={cx(
                        "rounded-xl border-s-4 bg-sand p-3",
                        q.sentiment === "negative"
                          ? "border-red-500"
                          : q.sentiment === "positive"
                            ? "border-palm"
                            : "border-line",
                      )}
                    >
                      «{q.text}»
                    </blockquote>
                  ))}
                </div>
              )}
            </article>
          ))}

          <section className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold">{t(locale, "results.compare")}</h3>
            <nav className="flex flex-wrap items-center gap-2 text-sm">
              <span>{t(locale, "results.by")}:</span>
              {DIMS.map((d) => (
                <Link
                  key={d}
                  href={`?tab=results&by=${d}`}
                  aria-current={dim === d ? "page" : undefined}
                  className={cx(
                    "rounded-full border px-3 py-1",
                    dim === d ? "border-palm bg-palm/10 font-semibold" : "border-line",
                  )}
                >
                  {t(locale, `results.dims.${d}`)}
                </Link>
              ))}
            </nav>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-start text-sm" data-testid="compare">
                <thead>
                  <tr className="border-b border-line">
                    <th className="p-2 text-start">{t(locale, "results.segment")}</th>
                    {result.themes.map((th) => (
                      <th key={th.themeId} className="p-2 text-start">
                        {th.title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...new Set(result.themes.flatMap((th) => Object.keys(th.breakdown[dim] ?? {}))),
                  ].map((value) => (
                    <tr key={value} className="border-b border-line/60">
                      <th className="p-2 text-start font-normal">
                        {valueLabel(locale, dim, value)}
                      </th>
                      {result.themes.map((th) => {
                        const counts = th.breakdown[dim]?.[value];
                        return (
                          <td key={th.themeId} className="p-2">
                            {counts ? <SentimentBar counts={counts} locale={locale} /> : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
