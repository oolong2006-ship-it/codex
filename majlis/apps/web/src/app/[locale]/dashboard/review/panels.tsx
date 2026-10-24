"use client";

import { t, type Locale, type MessageKey } from "@majlis/i18n";
import { useState, useTransition } from "react";
import { Badge, Button, Card, inputClass } from "@/components/ui";
import { correctTranscriptAction, dismissFlagAction, rateInterviewerAction } from "./actions";

export interface FlagView {
  flagId: string;
  kind: string;
  turnId: string;
  text: string;
  asrConfidence: number | null;
  hasAudio: boolean;
  studyTitle: string;
}

export function FlagCard({ locale, flag }: { locale: Locale; flag: FlagView }) {
  const [text, setText] = useState(flag.text);
  const [status, setStatus] = useState<"saved" | "failed" | null>(null);
  const [pending, start] = useTransition();
  const run = (action: () => Promise<boolean>) =>
    start(async () => setStatus((await action()) ? "saved" : "failed"));

  return (
    <Card className="flex flex-col gap-3" data-testid="flag">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge tone="warn">{t(locale, `review.flagKinds.${flag.kind}` as MessageKey)}</Badge>
        <span className="text-sm opacity-70">{flag.studyTitle}</span>
      </div>
      {flag.asrConfidence !== null && (
        <p className="text-sm opacity-70">
          {t(locale, "review.confidence", { value: flag.asrConfidence.toFixed(2) })}
        </p>
      )}
      {flag.hasAudio && (
        <audio controls preload="none" src={`/api/audio/${flag.turnId}`} className="w-full" />
      )}
      <label className="flex flex-col gap-1.5">
        <span className="font-semibold">{t(locale, "review.correction")}</span>
        <textarea
          className={`${inputClass} min-h-24`}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {status && (
        <p role="status" className={status === "saved" ? "text-palm" : "text-red-700"}>
          {t(locale, status === "saved" ? "review.saved" : "review.failed")}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={pending || status === "saved"}
          onClick={() => run(() => correctTranscriptAction(locale, flag.turnId, text))}
        >
          {t(locale, "review.saveCorrection")}
        </Button>
        <Button
          variant="secondary"
          disabled={pending || status === "saved"}
          onClick={() => run(() => dismissFlagAction(locale, flag.flagId))}
        >
          {t(locale, "review.dismiss")}
        </Button>
      </div>
    </Card>
  );
}

export function RateCard({
  locale,
  turn,
}: {
  locale: Locale;
  turn: { turnId: string; text: string };
}) {
  const [score, setScore] = useState<number | null>(null);
  const [dialectOk, setDialectOk] = useState(true);
  const [status, setStatus] = useState<"saved" | "failed" | null>(null);
  const [pending, start] = useTransition();

  return (
    <Card className="flex flex-col gap-3" data-testid="rate">
      <p>{turn.text}</p>
      <audio controls preload="none" src={`/api/review/tts/${turn.turnId}`} className="w-full" />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">{t(locale, "review.naturalness")}</legend>
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              className="flex min-h-11 items-center justify-center rounded-xl border border-line bg-white has-[:checked]:border-palm has-[:checked]:bg-palm/10"
            >
              <input
                type="radio"
                className="sr-only"
                name={`mos-${turn.turnId}`}
                checked={score === n}
                onChange={() => setScore(n)}
              />
              {n}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          className="size-5"
          checked={dialectOk}
          onChange={(e) => setDialectOk(e.target.checked)}
        />
        {t(locale, "review.dialectOk")}
      </label>
      {status && (
        <p role="status" className={status === "saved" ? "text-palm" : "text-red-700"}>
          {t(locale, status === "saved" ? "review.saved" : "review.failed")}
        </p>
      )}
      <Button
        disabled={score === null || pending || status === "saved"}
        onClick={() =>
          start(async () =>
            setStatus(
              (await rateInterviewerAction(locale, turn.turnId, score!, dialectOk))
                ? "saved"
                : "failed",
            ),
          )
        }
      >
        {t(locale, "review.saveRating")}
      </Button>
    </Card>
  );
}
