import Link from "next/link";
import { redirect } from "next/navigation";
import { getDashboardActor, getLang, getPosActor } from "@/server/web";
import { getMerchant, listBranches } from "@/server/domain/management";
import { t } from "@/lib/i18n";
import { LangToggle } from "@/components/lang-toggle";
import { Terminal } from "./terminal";

export const metadata = { title: "Cashier" };

export default async function PosPage() {
  const actor = await getPosActor();
  if (!actor) redirect((await getDashboardActor()) ? "/pos/branch" : "/pos/login");
  if (!actor.branchId) redirect("/pos/branch");
  const lang = await getLang();
  const [merchant, branches] = await Promise.all([getMerchant(actor), listBranches(actor)]);
  const branch = branches.find((b) => b.id === actor.branchId);
  const keys = ["scan", "startCamera", "stopCamera", "manual", "lookup", "cameraError", "addStamp", "addStamps", "redeem", "stamped", "rewardEarned", "redeemed", "next", "quantity", "firstVisit", "lastVisit", "offline"] as const;
  const labels = Object.fromEntries(keys.map((k) => [k, t(lang, `pos.${k}`)])) as Record<(typeof keys)[number], string>;
  return (
    <main className="flex min-h-dvh flex-col bg-cream-100 px-4 pb-8">
      <header className="mx-auto flex w-full max-w-md items-center justify-between py-3">
        <div className="min-w-0">
          <div className="truncate font-bold">{merchant.name}</div>
          <div className="truncate text-xs text-espresso-500">{branch?.name} · {actor.name}</div>
        </div>
        <div className="flex items-center gap-1">
          <LangToggle lang={lang} />
          {branches.filter((b) => b.active).length > 1 && <Link href="/pos/branch" className="rounded-lg px-2 py-1.5 text-sm hover:bg-cream-200">⌂</Link>}
          <form action="/logout?from=pos" method="post">
            <button className="rounded-lg px-2.5 py-1.5 text-sm text-espresso-500 hover:bg-cream-200">{t(lang, "common.logout")}</button>
          </form>
        </div>
      </header>
      <Terminal
        lang={lang}
        labels={{ ...labels, rewardsReady: t(lang, "card.rewardsReady"), reward: t(lang, "card.reward"), cooldown: t(lang, "errors.cooldown"), generic: t(lang, "errors.generic") }}
      />
    </main>
  );
}
