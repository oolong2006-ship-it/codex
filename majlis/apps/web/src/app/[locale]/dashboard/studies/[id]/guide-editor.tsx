"use client";

import type { GuideContent } from "@majlis/db";
import { t, type Locale } from "@majlis/i18n";
import type { ScreenerQuestion } from "@majlis/interviewer";
import { useState, useTransition } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { saveGuideAction, type SaveGuideResult } from "../../actions";

let counter = 0;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`;

export function GuideEditor({
  locale,
  studyId,
  initial,
  screener,
  version,
}: {
  locale: Locale;
  studyId: string;
  initial: GuideContent;
  screener: ScreenerQuestion[];
  version: number;
}) {
  const [guide, setGuide] = useState<GuideContent>(initial);
  const [result, setResult] = useState<SaveGuideResult | null>(null);
  const [pending, start] = useTransition();

  const update = (fn: (g: GuideContent) => void) =>
    setGuide((g) => {
      const next = structuredClone(g);
      fn(next);
      return next;
    });

  const save = () =>
    start(async () => setResult(await saveGuideAction(locale, studyId, guide, screener)));

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm opacity-70">
        {t(locale, "guide.version", { version: result?.ok ? result.version : version })}
      </p>
      <Field label={t(locale, "guide.topic")}>
        <input
          className={inputClass}
          value={guide.topic}
          onChange={(e) => update((g) => void (g.topic = e.target.value))}
        />
      </Field>

      {guide.sections.map((section, si) => (
        <fieldset
          key={section.id}
          className="flex flex-col gap-4 rounded-2xl border border-line p-4"
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <Field label={t(locale, "guide.sectionTitle")}>
                <input
                  className={inputClass}
                  value={section.title}
                  onChange={(e) => update((g) => void (g.sections[si]!.title = e.target.value))}
                />
              </Field>
            </div>
            <Button
              type="button"
              variant="danger"
              disabled={guide.sections.length === 1}
              onClick={() => update((g) => void g.sections.splice(si, 1))}
            >
              {t(locale, "guide.removeSection")}
            </Button>
          </div>

          {section.questions.map((q, qi) => (
            <div
              key={q.id}
              className="flex flex-col gap-3 rounded-xl bg-sand/60 p-3"
              data-question={q.id}
            >
              <Field label={t(locale, "guide.questionText")}>
                <input
                  className={inputClass}
                  value={q.text}
                  onChange={(e) =>
                    update((g) => void (g.sections[si]!.questions[qi]!.text = e.target.value))
                  }
                />
              </Field>
              <Field
                label={`${t(locale, "guide.questionFemale")} (${t(locale, "common.optional")})`}
              >
                <input
                  className={inputClass}
                  value={q.textFemale ?? ""}
                  onChange={(e) =>
                    update((g) => {
                      const target = g.sections[si]!.questions[qi]!;
                      if (e.target.value) target.textFemale = e.target.value;
                      else delete target.textFemale;
                    })
                  }
                />
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={Boolean(q.sensitive)}
                    onChange={(e) =>
                      update((g) => {
                        const target = g.sections[si]!.questions[qi]!;
                        if (e.target.checked) target.sensitive = true;
                        else delete target.sensitive;
                      })
                    }
                  />
                  {t(locale, "guide.sensitive")}
                </label>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={section.questions.length === 1}
                  onClick={() => update((g) => void g.sections[si]!.questions.splice(qi, 1))}
                >
                  {t(locale, "guide.removeQuestion")}
                </Button>
              </div>
              {result?.ok &&
                result.issues
                  .filter((i) => i.questionId === q.id)
                  .map((i) => (
                    <p key={i.detail} className="text-sm text-amber-800">
                      {t(locale, "guide.issue", { detail: i.detail })}
                    </p>
                  ))}
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                update((g) =>
                  g.sections[si]!.questions.push({
                    id: newId("q"),
                    text: t(locale, "guide.newQuestion"),
                  }),
                )
              }
            >
              {t(locale, "guide.addQuestion")}
            </Button>
          </div>
        </fieldset>
      ))}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            update((g) =>
              g.sections.push({
                id: newId("s"),
                title: t(locale, "guide.newSection"),
                questions: [{ id: newId("q"), text: t(locale, "guide.newQuestion") }],
              }),
            )
          }
        >
          {t(locale, "guide.addSection")}
        </Button>
        <Button type="button" onClick={save} disabled={pending}>
          {t(locale, "guide.save")}
        </Button>
      </div>
      <p role="status" aria-live="polite">
        {result?.ok && t(locale, "guide.saved", { version: result.version })}
        {result && !result.ok && (
          <span className="text-red-700">
            {t(locale, "guide.invalid", { reason: result.reason })}
          </span>
        )}
      </p>

      {screener.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold">{t(locale, "guide.screener")}</h3>
          {screener.map((s) => (
            <div key={s.id} className="rounded-xl bg-sand/60 p-3">
              <p className="mb-2">{s.text}</p>
              <ul className="flex flex-wrap gap-2 text-sm">
                {s.options.map((o) => (
                  <li key={o.id} className="rounded-full bg-white px-3 py-1">
                    {o.label} · {t(locale, o.qualifies ? "guide.qualifies" : "guide.notQualifies")}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
