"use client";

import { useActionState, useState } from "react";
import { saveProgramAction } from "./actions";
import { CardFace } from "@/components/card-face";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import type { Lang } from "@/lib/i18n";

type Program = {
  name: string;
  stampsRequired: number;
  rewardDescription: string;
  cooldownMinutes: number;
  maxStampsPerScan: number;
  welcomeStamps: number;
  terms: string | null;
  active: boolean;
  design: { bg: string; fg: string; accent: string; icon: string };
};

const PRESETS = [
  { bg: "#6D4AFF", fg: "#FFFFFF", accent: "#FFC233" },
  { bg: "#FF5A3C", fg: "#FFFFFF", accent: "#FFE08A" },
  { bg: "#12B886", fg: "#FFFFFF", accent: "#FFF3B0" },
  { bg: "#17143A", fg: "#FFFFFF", accent: "#FF7559" },
  { bg: "#2F9BFF", fg: "#FFFFFF", accent: "#FFE066" },
  { bg: "#3B2418", fg: "#FFF7ED", accent: "#F59E0B" },
];

export function ProgramForm({ lang, merchantName, program, icons, labels }: { lang: Lang; merchantName: string; program: Program; icons: readonly string[]; labels: Record<string, string> }) {
  const [state, action] = useActionState(saveProgramAction, undefined);
  const [p, setP] = useState(program);
  const set = <K extends keyof Program>(k: K, v: Program[K]) => setP((x) => ({ ...x, [k]: v }));
  const setD = (k: keyof Program["design"], v: string) => setP((x) => ({ ...x, design: { ...x.design, [k]: v } }));
  return (
    <form action={action} className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <section className="card space-y-4 p-5">
          <div>
            <label className="label" htmlFor="name">{labels.name}</label>
            <input id="name" name="name" className="input" required minLength={2} maxLength={60} value={p.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="stampsRequired">{labels.stampsRequired}</label>
              <input id="stampsRequired" name="stampsRequired" type="number" min={2} max={30} className="input" value={p.stampsRequired} onChange={(e) => set("stampsRequired", Math.max(2, Math.min(30, Number(e.target.value) || 2)))} />
            </div>
            <div>
              <label className="label" htmlFor="rewardDescription">{labels.reward}</label>
              <input id="rewardDescription" name="rewardDescription" className="input" required minLength={2} maxLength={80} placeholder={labels.rewardPlaceholder} value={p.rewardDescription} onChange={(e) => set("rewardDescription", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="cooldownMinutes">{labels.cooldown}</label>
              <input id="cooldownMinutes" name="cooldownMinutes" type="number" min={0} max={1440} className="input" defaultValue={p.cooldownMinutes} />
            </div>
            <div>
              <label className="label" htmlFor="maxStampsPerScan">{labels.maxPerScan}</label>
              <input id="maxStampsPerScan" name="maxStampsPerScan" type="number" min={1} max={10} className="input" defaultValue={p.maxStampsPerScan} />
            </div>
            <div>
              <label className="label" htmlFor="welcomeStamps">{labels.welcome}</label>
              <input id="welcomeStamps" name="welcomeStamps" type="number" min={0} max={5} className="input" defaultValue={p.welcomeStamps} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="terms">{labels.terms}</label>
            <textarea id="terms" name="terms" rows={3} maxLength={1000} className="input" defaultValue={p.terms ?? ""} />
          </div>
          <label className="flex items-center gap-2.5 text-sm font-medium">
            <input type="checkbox" name="active" defaultChecked={p.active} className="h-4 w-4 accent-espresso-800" />
            {labels.active}
          </label>
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="font-semibold">{labels.design}</h2>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((pr) => (
              <button
                key={pr.bg}
                type="button"
                aria-label={pr.bg}
                onClick={() => setP((x) => ({ ...x, design: { ...x.design, ...pr } }))}
                className="h-10 w-10 rounded-xl border-2 border-white shadow ring-1 ring-cream-300"
                style={{ background: `linear-gradient(135deg, ${pr.bg} 60%, ${pr.accent} 60%)` }}
              />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ["bg", labels.bgColor],
                ["fg", labels.fgColor],
                ["accent", labels.accentColor],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="block">
                <span className="label">{l}</span>
                <input type="color" name={k} value={p.design[k]} onChange={(e) => setD(k, e.target.value.toUpperCase())} className="h-11 w-full cursor-pointer rounded-xl border border-cream-300 bg-white p-1" />
              </label>
            ))}
          </div>
          <div>
            <span className="label">{labels.stampIcon}</span>
            <div className="flex flex-wrap gap-2">
              {icons.map((ic) => (
                <label key={ic} className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border text-xl ${p.design.icon === ic ? "border-espresso-800 bg-cream-200" : "border-cream-300 bg-white"}`}>
                  <input type="radio" name="icon" value={ic} checked={p.design.icon === ic} onChange={() => setD("icon", ic)} className="sr-only" />
                  {ic}
                </label>
              ))}
            </div>
          </div>
        </section>
        <FormMessage state={state} />
        <SubmitButton className="btn-primary px-8 py-3">{labels.save}</SubmitButton>
      </div>

      <aside className="xl:sticky xl:top-8 xl:self-start">
        <div className="mb-3 text-sm font-medium text-espresso-500">{labels.preview}</div>
        <CardFace
          lang={lang}
          merchantName={merchantName}
          programName={p.name}
          rewardDescription={p.rewardDescription}
          stampsRequired={p.stampsRequired}
          currentStamps={Math.min(Math.max(p.welcomeStamps, Math.round(p.stampsRequired * 0.6)), p.stampsRequired - 1)}
          rewardsAvailable={0}
          customerName={lang === "ar" ? "سارة" : "Sara"}
          design={p.design}
        />
      </aside>
    </form>
  );
}
