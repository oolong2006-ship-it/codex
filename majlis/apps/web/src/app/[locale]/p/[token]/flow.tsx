"use client";

import { t, type Locale, type MessageKey } from "@majlis/i18n";
import type { ScreenerQuestion } from "@majlis/interviewer";
import { VoiceClient, type ClientState } from "@majlis/voice-client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { AGE_BANDS, CITIES, DIALECT_CODES, GENDERS } from "@/lib/options";
import { startInterviewAction } from "./actions";

type Gender = (typeof GENDERS)[number];

interface Invite {
  topic: string;
  durationPhrase: string;
  incentive: string | null;
  voiceSetting: "participant_choice" | "male" | "female";
  screener: ScreenerQuestion[];
  disclosure: { male: string; female: string };
}

type Step = "welcome" | "about" | "consent" | "interview" | "done" | "screened";
const NUMBERED: Step[] = ["welcome", "about", "consent"];

export function ParticipantFlow({
  locale,
  token,
  gateway,
  invite,
}: {
  locale: Locale;
  token: string;
  gateway: string;
  invite: Invite;
}) {
  const [step, setStep] = useState<Step>("welcome");
  const [about, setAbout] = useState<{
    gender?: Gender;
    ageBand?: string;
    city?: string;
    dialect?: string;
  }>({});
  const [screener, setScreener] = useState<Record<string, string>>({});
  const [voice, setVoice] = useState<Gender>(invite.voiceSetting === "male" ? "male" : "female");
  const [consent, setConsent] = useState({ interview: false, audio: false });
  const [error, setError] = useState<MessageKey | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [deletionCode, setDeletionCode] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const index = NUMBERED.indexOf(step);
  const screenerDone = invite.screener.every((q) => screener[q.id]);

  const begin = () =>
    start(async () => {
      setError(null);
      if (!consent.interview) return setError("participant.consentRequired");
      const result = await startInterviewAction({
        token,
        consentInterview: consent.interview,
        consentAudio: consent.audio,
        voiceGender: voice,
        screener,
        ...(about.gender ? { gender: about.gender } : {}),
        ...(about.ageBand ? { ageBand: about.ageBand as never } : {}),
        ...(about.city ? { city: about.city as never } : {}),
        ...(about.dialect ? { dialect: about.dialect as never } : {}),
      });
      if (result.ok) {
        setSessionId(result.sessionId);
        setDeletionCode(result.deletionCode);
        setStep("interview");
      } else if (result.reason === "screened_out") setStep("screened");
      else
        setError(
          result.reason === "no_consent" ? "participant.consentRequired" : "participant.failed",
        );
    });

  return (
    <div className="flex flex-col gap-4">
      {index >= 0 && (
        <p className="text-sm opacity-70">
          {t(locale, "participant.step", { step: index + 1, total: NUMBERED.length })}
        </p>
      )}

      {step === "welcome" && (
        <Card className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">{t(locale, "participant.welcomeTitle")}</h1>
          <p>
            {t(locale, "participant.welcomeBody", {
              topic: invite.topic,
              duration: invite.durationPhrase,
            })}
          </p>
          <ul className="flex list-disc flex-col gap-2 ps-5">
            <li>{t(locale, "participant.pointAi")}</li>
            <li>{t(locale, "participant.pointPrivate")}</li>
            <li>{t(locale, "participant.pointRegion")}</li>
            {invite.incentive && (
              <li>{t(locale, "participant.pointIncentive", { incentive: invite.incentive })}</li>
            )}
          </ul>
          <Button onClick={() => setStep("about")}>{t(locale, "common.next")}</Button>
        </Card>
      )}

      {step === "about" && (
        <Card className="flex flex-col gap-4">
          <h1 className="text-xl font-semibold">{t(locale, "participant.aboutTitle")}</h1>
          <p className="text-sm opacity-70">{t(locale, "participant.aboutHint")}</p>
          <Select
            label={t(locale, "participant.gender")}
            locale={locale}
            value={about.gender}
            options={GENDERS.map((g) => [g, t(locale, `gender.${g}`)])}
            onChange={(v) => setAbout({ ...about, gender: v as Gender | undefined })}
          />
          <Select
            label={t(locale, "participant.age")}
            locale={locale}
            value={about.ageBand}
            options={AGE_BANDS.map((a) => [a, a])}
            onChange={(v) => setAbout({ ...about, ageBand: v })}
          />
          <Select
            label={t(locale, "participant.city")}
            locale={locale}
            value={about.city}
            options={CITIES.map((c) => [c, t(locale, `cities.${c}`)])}
            onChange={(v) => setAbout({ ...about, city: v })}
          />
          <Select
            label={t(locale, "participant.dialect")}
            locale={locale}
            value={about.dialect}
            options={DIALECT_CODES.map((d) => [d, t(locale, `dialects.${d}`)])}
            onChange={(v) => setAbout({ ...about, dialect: v })}
          />
          {invite.screener.map((q) => (
            <fieldset key={q.id} className="flex flex-col gap-2">
              <legend className="mb-1 font-semibold">{q.text}</legend>
              {q.options.map((o) => (
                <label
                  key={o.id}
                  className="flex min-h-11 items-center gap-3 rounded-xl border border-line bg-white px-3"
                >
                  <input
                    type="radio"
                    name={`screener-${q.id}`}
                    checked={screener[q.id] === o.id}
                    onChange={() => setScreener({ ...screener, [q.id]: o.id })}
                  />
                  {o.label}
                </label>
              ))}
            </fieldset>
          ))}
          {!screenerDone && (
            <p className="text-sm opacity-70">{t(locale, "participant.screenerRequired")}</p>
          )}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep("welcome")}>
              {t(locale, "common.back")}
            </Button>
            <Button disabled={!screenerDone} onClick={() => setStep("consent")}>
              {t(locale, "common.next")}
            </Button>
          </div>
        </Card>
      )}

      {step === "consent" && (
        <Card className="flex flex-col gap-4">
          <h1 className="text-xl font-semibold">{t(locale, "participant.consentTitle")}</h1>
          {invite.voiceSetting === "participant_choice" && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 font-semibold">{t(locale, "participant.voiceLabel")}</legend>
              <div className="grid grid-cols-2 gap-2">
                {(["female", "male"] as const).map((g) => (
                  <label
                    key={g}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-white has-[:checked]:border-palm has-[:checked]:bg-palm/10"
                  >
                    <input
                      type="radio"
                      name="voice"
                      className="sr-only"
                      checked={voice === g}
                      onChange={() => setVoice(g)}
                    />
                    {t(locale, g === "male" ? "segment.voiceMale" : "segment.voiceFemale")}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div>
            <p className="mb-1 text-sm font-semibold">{t(locale, "participant.disclosureLabel")}</p>
            <blockquote
              className="rounded-xl border-s-4 border-palm bg-sand p-3"
              data-testid="disclosure"
            >
              {invite.disclosure[voice]}
            </blockquote>
          </div>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-5 shrink-0"
              checked={consent.interview}
              onChange={(e) => setConsent({ ...consent, interview: e.target.checked })}
            />
            <span>{t(locale, "participant.consentInterview")}</span>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-5 shrink-0"
              checked={consent.audio}
              onChange={(e) => setConsent({ ...consent, audio: e.target.checked })}
            />
            <span>{t(locale, "participant.consentAudio")}</span>
          </label>
          {error && (
            <p role="alert" className="text-red-700">
              {t(locale, error)}
            </p>
          )}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep("about")}>
              {t(locale, "common.back")}
            </Button>
            <Button disabled={!consent.interview || pending} onClick={begin}>
              {t(locale, "participant.begin")}
            </Button>
          </div>
        </Card>
      )}

      {step === "interview" && sessionId && (
        <Interview
          locale={locale}
          url={`${gateway}/v1/sessions/${sessionId}/stream`}
          voice={voice}
          participantGender={about.gender}
          onDone={() => setStep("done")}
        />
      )}

      {step === "done" && (
        <Card className="flex flex-col gap-3 text-center">
          <h1 className="text-2xl font-semibold">{t(locale, "participant.thanksTitle")}</h1>
          <p>{t(locale, "participant.thanksBody")}</p>
          {invite.incentive && (
            <p>{t(locale, "participant.thanksIncentive", { incentive: invite.incentive })}</p>
          )}
          {deletionCode && (
            <div className="mt-2 flex flex-col gap-2 rounded-xl bg-sand p-4">
              <h2 className="font-semibold">{t(locale, "participant.deletionTitle")}</h2>
              <p
                dir="ltr"
                className="font-mono text-xl tracking-widest"
                data-testid="deletion-code"
              >
                {deletionCode}
              </p>
              <p className="text-sm">{t(locale, "participant.deletionBody")}</p>
              <a href={`/${locale}/delete`} className="text-palm underline underline-offset-4">
                {t(locale, "participant.deletionLink")}
              </a>
            </div>
          )}
        </Card>
      )}

      {step === "screened" && (
        <Card>
          <p>{t(locale, "participant.screenedOut")}</p>
        </Card>
      )}
    </div>
  );
}

function Select({
  label,
  locale,
  value,
  options,
  onChange,
}: {
  label: string;
  locale: Locale;
  value: string | undefined;
  options: [string, string][];
  onChange: (v: string | undefined) => void;
}) {
  return (
    <Field label={`${label} (${t(locale, "common.optional")})`}>
      <select
        className={inputClass}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">{t(locale, "common.preferNot")}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </Field>
  );
}

const STATE_KEYS: Record<ClientState, MessageKey> = {
  connecting: "participant.connecting",
  listening: "participant.listening",
  speaking: "participant.speaking",
  ended: "participant.ended",
  error: "participant.error",
};

function Interview({
  locale,
  url,
  voice,
  participantGender,
  onDone,
}: {
  locale: Locale;
  url: string;
  voice: Gender;
  participantGender: Gender | undefined;
  onDone: () => void;
}) {
  const client = useRef<VoiceClient | null>(null);
  const bars = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ClientState>("connecting");
  const [mode, setMode] = useState<"voice" | "text">("voice");
  const [caption, setCaption] = useState("");
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [draft, setDraft] = useState("");
  const ended = useRef(false);
  // Kept in a ref: a new callback identity must never reconnect (a session link works once).
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const finish = () => {
      if (ended.current) return;
      ended.current = true;
      // Let the closing words finish playing before showing the thank-you screen.
      setTimeout(() => onDoneRef.current(), 2500);
    };
    const make = (m: "voice" | "text") =>
      new VoiceClient({
        url,
        mode: m,
        voiceGender: voice,
        ...(participantGender ? { participantGender } : {}),
        onTurn: (turn) => setCaption(turn.text),
        onState: setState,
        onLevel: (level) => {
          const el = bars.current;
          if (!el) return;
          [...el.children].forEach((b, i) => {
            (b as HTMLElement).style.transform =
              `scaleY(${Math.min(1, 0.15 + level * 6 * (0.6 + 0.4 * Math.sin(i * 1.7)))})`;
          });
        },
        onEnded: finish,
      });
    let c: VoiceClient | null = null;
    // Deferred one tick: React's dev double-mount would otherwise open two
    // connections, and a session link accepts only one.
    const timer = setTimeout(() => {
      c = make("voice");
      client.current = c;
      c.connect().catch(async (err: unknown) => {
        console.warn("voice unavailable, switching to text:", err);
        // No microphone (denied or missing): continue the same session by text.
        setNotice("participant.micDenied");
        setMode("text");
        c = make("text");
        client.current = c;
        await c.connect();
      });
    }, 0);
    return () => {
      clearTimeout(timer);
      c?.close();
    };
  }, [url, voice, participantGender]);

  const toggleMode = async () => {
    const next = mode === "voice" ? "text" : "voice";
    try {
      await client.current?.setMode(next);
      setMode(next);
    } catch {
      setNotice("participant.micDenied");
    }
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    client.current?.sendText(text);
    setDraft("");
  };

  return (
    <Card className="flex flex-col items-center gap-5 text-center">
      <h1 className="text-xl font-semibold">{t(locale, "participant.interviewTitle")}</h1>
      {/* A calm sound wave, never a face. */}
      <div ref={bars} className="flex h-16 items-center gap-1.5" aria-hidden="true">
        {Array.from({ length: 13 }, (_, i) => (
          <span
            key={i}
            className="h-16 w-1.5 origin-center scale-y-[0.15] rounded-full bg-palm transition-transform duration-100"
          />
        ))}
      </div>
      <p role="status" aria-live="polite" data-state={state}>
        {t(locale, STATE_KEYS[state])}
      </p>
      {caption && (
        <p className="w-full rounded-xl bg-sand p-3 text-start text-lg" data-testid="caption">
          {caption}
        </p>
      )}
      {notice && <p className="text-amber-800">{t(locale, notice)}</p>}
      {mode === "text" && (
        <form
          className="flex w-full gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            className={inputClass}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t(locale, "participant.typePlaceholder")}
            aria-label={t(locale, "participant.typePlaceholder")}
          />
          <Button type="submit" className="shrink-0 whitespace-nowrap">
            {t(locale, "participant.send")}
          </Button>
        </form>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="secondary" onClick={toggleMode}>
          {t(locale, mode === "voice" ? "participant.switchToText" : "participant.switchToVoice")}
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            client.current?.close();
            onDone();
          }}
        >
          {t(locale, "participant.end")}
        </Button>
      </div>
    </Card>
  );
}
