import { notFound } from "next/navigation";
import { publicProgram } from "@/server/domain/enrollment";
import { parseDesign } from "@/server/domain/design";
import { getLang } from "@/server/web";
import { t } from "@/lib/i18n";
import { LangToggle } from "@/components/lang-toggle";
import { JoinForm } from "./join-form";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const p = await publicProgram((await params).slug);
  return { title: p?.merchantName ?? "Join" };
}

export default async function JoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lang = await getLang();
  const p = await publicProgram(slug);
  if (!p) notFound();
  const d = parseDesign(p.design);
  const k = (key: string, x?: Record<string, string | number>) => t(lang, key, x);
  return (
    <main className="min-h-dvh" style={{ background: `linear-gradient(180deg, ${d.bg} 0 230px, transparent 230px)` }}>
      <div className="mx-auto max-w-md px-4 pb-10">
        <div className="flex justify-end pt-3 [&_button]:text-white/90 [&_button:hover]:bg-white/10">
          <LangToggle lang={lang} />
        </div>
        <div className="px-2 pb-6 pt-4 text-center" style={{ color: d.fg }}>
          <div className="text-4xl" aria-hidden>{d.icon}</div>
          <h1 className="mt-2 text-2xl font-bold">{k("join.title", { merchant: p.merchantName })}</h1>
          <p className="mt-2 text-sm font-medium" style={{ color: d.accent }}>{k("join.offer", { n: p.stampsRequired, reward: p.rewardDescription })}</p>
        </div>
        <div className="card p-5 sm:p-6">
          {!p.active ? (
            <p className="py-6 text-center text-espresso-500">{k("join.unavailable")}</p>
          ) : (
            <>
              {p.welcomeStamps > 0 && <p className="mb-4 rounded-xl bg-saffron-400/15 px-3 py-2 text-center text-sm font-medium">{k("join.welcomeBonus", { n: p.welcomeStamps })}</p>}
              <JoinForm
                slug={p.slug}
                labels={{ name: k("common.name"), phone: k("common.phone"), consent: k("join.consent"), marketing: k("join.marketing"), submit: k("join.submit"), privacy: k("join.privacy") }}
              />
            </>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-espresso-500">{k("card.poweredBy")}</p>
      </div>
    </main>
  );
}
