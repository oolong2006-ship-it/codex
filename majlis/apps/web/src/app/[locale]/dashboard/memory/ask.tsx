"use client";

import type { MemoryAnswer } from "@majlis/analysis";
import { t, type Locale, type MessageKey } from "@majlis/i18n";
import { useState, useTransition } from "react";
import { Button, Card, inputClass } from "@/components/ui";
import { askMemoryAction } from "./actions";

function filtersLabel(locale: Locale, f: MemoryAnswer["filters"]): string {
  const parts = [
    f.gender ? t(locale, `gender.${f.gender}`) : null,
    ...f.ageBands,
    ...f.cities.map((c) => t(locale, `cities.${c}` as MessageKey)),
    ...f.dialects.map((d) => t(locale, `dialects.${d}` as MessageKey)),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : t(locale, "memory.everyone");
}

export function AskMemory({ locale }: { locale: Locale }) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<MemoryAnswer | null>(null);
  const [pending, start] = useTransition();

  return (
    <Card className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => setResult(await askMemoryAction(locale, question)));
        }}
      >
        <input
          className={inputClass}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t(locale, "memory.hint")}
          aria-label={t(locale, "memory.title")}
          minLength={3}
          maxLength={300}
          required
        />
        <Button type="submit" disabled={pending} className="shrink-0">
          {t(locale, "memory.ask")}
        </Button>
      </form>

      {result && (
        <div className="flex flex-col gap-3" data-testid="memory-answer" data-mode={result.mode}>
          <p className="text-sm opacity-70">
            {t(locale, "memory.filters", { filters: filtersLabel(locale, result.filters) })}
          </p>
          {result.notes.includes("parenthood_not_collected") && (
            <p className="text-amber-800">{t(locale, "memory.parenthood")}</p>
          )}
          <h2 className="font-semibold">{t(locale, "memory.answer")}</h2>
          {result.mode === "insufficient" && <p>{t(locale, "memory.insufficient")}</p>}
          {result.mode === "extractive" && (
            <p>
              {t(locale, "memory.extractive", {
                quotes: result.stats.quotes,
                sessions: result.stats.sessions,
                positive: result.stats.sentiment.positive,
                negative: result.stats.sentiment.negative,
                neutral: result.stats.sentiment.neutral + result.stats.sentiment.mixed,
              })}
            </p>
          )}
          {result.mode === "llm" && (
            <>
              <p>{result.answer}</p>
              <p className="text-xs opacity-60">{t(locale, "memory.llmNote")}</p>
            </>
          )}
          {result.quotes.length > 0 && (
            <>
              <h3 className="text-sm font-semibold">{t(locale, "memory.evidence")}</h3>
              <ol className="flex list-decimal flex-col gap-2 ps-6">
                {result.quotes.map((q) => (
                  <li key={q.turnId}>
                    <blockquote className="rounded-xl bg-sand p-3">«{q.text}»</blockquote>
                    <span className="text-xs opacity-60">{q.studyTitle}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
